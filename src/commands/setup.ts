import fs from 'node:fs/promises';
import path from 'node:path';
import * as p from '@clack/prompts';
import {
  DEFAULT_CLAUDE_CONFIG_DIR,
  SHARED_DIR,
  SHARED_ENTRIES,
  SHARED_DIR_ENTRIES,
  PROFILES_DIR,
} from '../core/constants.js';
import { profileDir, sharedEntryPath, profileExists } from '../core/profile-manager.js';
import { createSymlink } from '../core/symlink-manager.js';
import { readState, writeState } from '../core/state.js';
import { getCredentialStore } from '../core/credential-store.js';
import { captureGlobalState } from '../core/global-state.js';
import { log } from '../utils/logger.js';

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function isSymlink(target: string): Promise<boolean> {
  try {
    return (await fs.lstat(target)).isSymbolicLink();
  } catch {
    return false;
  }
}

export async function setupCommand(): Promise<void> {
  p.intro('claude-multi setup');
  await fs.mkdir(PROFILES_DIR, { recursive: true });
  await fs.mkdir(SHARED_DIR, { recursive: true });

  const state = await readState();

  if (state.primaryAdopted) {
    p.outro('Already set up — primary profile exists. Use `claude-multi add <name>` for more.');
    return;
  }

  const existingIsRealDir =
    (await pathExists(DEFAULT_CLAUDE_CONFIG_DIR)) && !(await isSymlink(DEFAULT_CLAUDE_CONFIG_DIR));

  if (!existingIsRealDir) {
    p.log.info(
      `No existing ~/.claude directory found (or it's already managed). ` +
        `Run \`claude-multi add <profile-name>\` to create your first profile.`
    );
    p.outro('Nothing to adopt.');
    return;
  }

  const shouldAdopt = await p.confirm({
    message: `Found an existing ~/.claude directory. Adopt it as the "primary" profile ` +
      `and move its shared history into ~/.claude-multi/shared?`,
  });

  if (p.isCancel(shouldAdopt) || !shouldAdopt) {
    p.outro('Cancelled — no changes made.');
    return;
  }

  if (await profileExists('primary')) {
    log.error(
      `A profile named "primary" already exists at ${profileDir('primary')}, but setup hasn't ` +
        `run before (state.json has no record of it). Refusing to overwrite it — rename or ` +
        `remove that profile first if you really want setup to reclaim the name.`
    );
    process.exitCode = 1;
    return;
  }

  const primaryDir = profileDir('primary');

  // Move the real ~/.claude dir into profiles/primary wholesale first, so
  // every shared entry's move below is a local rename within profiles/primary
  // rather than a rename across the original location.
  await fs.rename(DEFAULT_CLAUDE_CONFIG_DIR, primaryDir);

  for (const entry of SHARED_ENTRIES) {
    const inPrimary = path.join(primaryDir, entry);
    const inShared = sharedEntryPath(entry);
    const isDir = SHARED_DIR_ENTRIES.has(entry);

    if ((await pathExists(inPrimary)) && !(await isSymlink(inPrimary))) {
      // Real data lives in the adopted profile — move it into the shared
      // store first so `add`-ed profiles (and this one) can link to it.
      await fs.mkdir(path.dirname(inShared), { recursive: true });
      await fs.rename(inPrimary, inShared);
    }
    await createSymlink(inPrimary, inShared, isDir);
  }

  // Symlink the original ~/.claude path to profiles/primary so bare `claude`
  // invocations (no CLAUDE_CONFIG_DIR set) keep working exactly as before.
  await fs.symlink(primaryDir, DEFAULT_CLAUDE_CONFIG_DIR, process.platform === 'win32' ? 'junction' : undefined);

  // The adopted directory was already logged in — snapshot that identity
  // into the profile now, otherwise the first `run primary` after a
  // different profile has run would silently pick up whichever account's
  // credential/oauthAccount is currently live instead of primary's own.
  await getCredentialStore().capture('primary', primaryDir);
  await captureGlobalState(primaryDir);

  await writeState({ ...state, primaryAdopted: true, defaultProfile: 'primary' });

  log.success(`Adopted existing config as profile "primary" (${primaryDir}).`);
  log.info(`~/.claude now points at it, so bare \`claude\` is unaffected.`);
  p.outro('Run `claude-multi add <profile-name>` to create additional accounts.');
}
