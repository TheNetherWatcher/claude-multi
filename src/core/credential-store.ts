import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';
import { KEYCHAIN_SERVICE } from './constants.js';
import type { CredentialStore } from './types.js';

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
export class KeychainCredentialStore implements CredentialStore {
  private credentialPath(profileDir: string): string {
    return path.join(profileDir, PROFILE_CRED_FILE);
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
    } catch {
      // Nothing in the Keychain yet (e.g. user never ran /login) — nothing to capture.
      return;
    }
    await fs.writeFile(this.credentialPath(profileDir), secret, { mode: 0o600 });
  }

  async restore(profileName: string, profileDir: string): Promise<void> {
    const credPath = this.credentialPath(profileDir);
    if (!(await pathExists(credPath))) {
      return; // profile has no saved credential yet; let Claude Code prompt /login
    }
    const secret = await fs.readFile(credPath, 'utf8');
    const account = os.userInfo().username;

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
