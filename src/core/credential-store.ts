import fs from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { KEYCHAIN_SERVICE } from './constants.js';
import type { CredentialStore } from './types.js';
import { log } from '../utils/logger.js';

/** macOS `security` exit code for "no such keychain item" — the only failure worth swallowing silently. */
const SEC_ITEM_NOT_FOUND = 44;

const PROFILE_CRED_FILE = '.claude-multi-credential.json';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Linux/WSL: Claude Code stores the OAuth token as a plaintext file inside
 * $CLAUDE_CONFIG_DIR (`.credentials.json`). Pointing CLAUDE_CONFIG_DIR at a
 * profile dir already isolates it — nothing to capture/restore, the file
 * just lives there natively. This store is a no-op that only reports
 * presence, for `list`'s health check.
 */
export class FileCredentialStore implements CredentialStore {
  async capture(): Promise<void> {
    // No-op: the real .credentials.json already lives in the profile dir
    // because CLAUDE_CONFIG_DIR pointed there when `claude` wrote it.
  }

  async restore(): Promise<void> {
    // No-op, same reason.
  }

  async hasCredential(profileDir: string): Promise<boolean> {
    return pathExists(path.join(profileDir, '.credentials.json'));
  }
}

/**
 * macOS: Claude Code stores the OAuth token in the system Keychain under a
 * fixed service name, NOT namespaced by CLAUDE_CONFIG_DIR. That means every
 * profile would read/write the same Keychain entry — switching
 * CLAUDE_CONFIG_DIR alone does nothing for auth isolation on this platform.
 *
 * To actually isolate accounts we keep a private copy of the Keychain
 * secret per profile and swap it into the shared Keychain entry around each
 * `claude` invocation:
 *   restore() -> write this profile's saved secret into the Keychain entry
 *                claude reads, right before spawning `claude`.
 *   capture() -> read the Keychain entry back out after `claude` exits and
 *                save it, since Claude Code may silently refresh the token
 *                mid-session — skipping this would log the profile out.
 */
interface KeychainSnapshot {
  account: string;
  secret: string;
}

export class KeychainCredentialStore implements CredentialStore {
  private credentialPath(profileDir: string): string {
    return path.join(profileDir, PROFILE_CRED_FILE);
  }

  /**
   * The account attribute on the real entry may not be the OS username —
   * Claude Code decides that, not us. Reading it back (rather than assuming
   * `os.userInfo().username`) means restore() re-creates the exact item
   * Claude Code originally wrote, instead of a lookalike under a possibly
   * different account that `security add-generic-password -U` would treat
   * as a distinct item (leaving two ambiguous entries under one service name).
   */
  private async readAccountAttribute(): Promise<string | null> {
    try {
      const { stdout } = await execa('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE]);
      const match = stdout.match(/"acct"<blob>="(.*)"/);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  async capture(profileName: string, profileDir: string): Promise<void> {
    let secret: string;
    try {
      const { stdout } = await execa('security', [
        'find-generic-password',
        '-s',
        KEYCHAIN_SERVICE,
        '-w',
      ]);
      secret = stdout;
    } catch (err) {
      const exitCode = (err as { exitCode?: number }).exitCode;
      if (exitCode !== SEC_ITEM_NOT_FOUND) {
        // Something other than "no such item" — e.g. Keychain locked, `security`
        // missing, access denied. Swallowing this silently would look like a
        // successful capture while actually leaving the profile's saved
        // credential stale (or never written in the first place).
        log.warn(`Could not read Keychain entry "${KEYCHAIN_SERVICE}" for profile "${profileName}": ${err}`);
      }
      return;
    }

    const account = (await this.readAccountAttribute()) ?? '';
    const snapshot: KeychainSnapshot = { account, secret };
    await fs.writeFile(this.credentialPath(profileDir), JSON.stringify(snapshot), { mode: 0o600 });
  }

  async restore(profileName: string, profileDir: string): Promise<void> {
    const credPath = this.credentialPath(profileDir);
    if (!(await pathExists(credPath))) {
      return; // profile has no saved credential yet; let Claude Code prompt /login
    }
    const { account, secret }: KeychainSnapshot = JSON.parse(await fs.readFile(credPath, 'utf8'));

    // Overwrite (not just add) the single shared Keychain entry so this
    // profile's token is what `claude` reads next.
    await execa('security', [
      'add-generic-password',
      '-U',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      account,
      '-w',
      secret,
    ]);
  }

  async hasCredential(profileDir: string): Promise<boolean> {
    return pathExists(this.credentialPath(profileDir));
  }
}

/**
 * Windows: Claude Code uses Credential Manager, also not namespaced by
 * CLAUDE_CONFIG_DIR. No swap implementation yet — flagged explicitly rather
 * than silently pretending isolation works.
 */
export class UnsupportedCredentialStore implements CredentialStore {
  async capture(): Promise<void> {
    // Intentionally unimplemented — see class doc.
  }
  async restore(): Promise<void> {
    // Intentionally unimplemented — see class doc.
  }
  async hasCredential(): Promise<boolean> {
    return false;
  }
}

export function getCredentialStore(platform: NodeJS.Platform = process.platform): CredentialStore {
  switch (platform) {
    case 'darwin':
      return new KeychainCredentialStore();
    case 'linux':
      return new FileCredentialStore();
    default:
      return new UnsupportedCredentialStore();
  }
}
