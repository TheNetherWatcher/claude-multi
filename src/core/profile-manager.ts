import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PROFILES_DIR,
  SHARED_DIR,
  SHARED_ENTRIES,
  AUTH_ENTRIES,
} from './constants.js';
import { createSymlink, checkSymlinkHealth } from './symlink-manager.js';
import type { ProfileInfo, SymlinkHealth } from './types.js';

const DIR_ENTRIES = new Set([
  'projects',
  'sessions',
  'tasks',
  'plans',
  'file-history',
  'skills',
  'plugins',
  'mcp-servers',
]);

function isDirEntry(entry: string): boolean {
  return DIR_ENTRIES.has(entry);
}

export function profileDir(name: string): string {
  return path.join(PROFILES_DIR, name);
}

export function sharedEntryPath(entry: string): string {
  return path.join(SHARED_DIR, entry);
}

/** Reserved name: an actual profile called "shared" would collide with the shared store dir. */
export function isValidProfileName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name) && name !== 'shared';
}

export async function profileExists(name: string): Promise<boolean> {
  try {
    await fs.access(profileDir(name));
    return true;
  } catch {
    return false;
  }
}

export async function listProfiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(PROFILES_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Link every shared entry from a profile dir back to the master shared store.
 * Auth entries (AUTH_ENTRIES) are deliberately left alone: they either don't
 * exist yet (fresh profile, Claude Code creates them on /login) or already
 * hold this profile's own copy (adopted "primary" profile).
 */
export async function linkSharedEntries(name: string): Promise<void> {
  const dir = profileDir(name);
  await fs.mkdir(dir, { recursive: true });

  for (const entry of SHARED_ENTRIES) {
    const linkPath = path.join(dir, entry);
    const targetPath = sharedEntryPath(entry);
    await createSymlink(linkPath, targetPath, isDirEntry(entry));
  }
}

export async function checkProfileHealth(name: string): Promise<SymlinkHealth[]> {
  const dir = profileDir(name);
  const results: SymlinkHealth[] = [];
  for (const entry of SHARED_ENTRIES) {
    const linkPath = path.join(dir, entry);
    const targetPath = sharedEntryPath(entry);
    results.push(await checkSymlinkHealth(entry, linkPath, targetPath));
  }
  return results;
}

export async function getProfileInfo(name: string, defaultProfile?: string): Promise<ProfileInfo> {
  const dir = profileDir(name);
  let hasAuth = false;
  for (const authFile of AUTH_ENTRIES) {
    try {
      await fs.access(path.join(dir, authFile));
      hasAuth = true;
      break;
    } catch {
      // keep checking
    }
  }
  return { name, path: dir, isDefault: name === defaultProfile, hasAuth };
}

export async function removeProfile(name: string): Promise<void> {
  const dir = profileDir(name);
  // rm on a dir full of symlinks only removes the links themselves, never
  // follows them into the shared store — this is safe by construction.
  await fs.rm(dir, { recursive: true, force: true });
}
