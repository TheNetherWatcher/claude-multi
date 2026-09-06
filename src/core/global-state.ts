import fs from 'node:fs/promises';
import path from 'node:path';
import { HOME_STATE_FILE, HOME_STATE_ACCOUNT_KEYS } from './constants.js';

const PROFILE_STATE_FILE = '.claude-multi-global-state.json';

type JsonRecord = Record<string, unknown>;

async function readJson(filePath: string): Promise<JsonRecord | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err; // malformed JSON is a real problem — surface it, don't guess
  }
}

/** Write atomically (temp file + rename) so a crash mid-write can't corrupt a file Claude Code itself may read concurrently. */
async function writeJsonAtomic(filePath: string, data: JsonRecord): Promise<void> {
  const tmpPath = `${filePath}.claude-multi-tmp-${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

/**
 * Save this profile's copy of the account-identity fields out of the live
 * $HOME/.claude.json. Called after `claude` exits, mirroring
 * CredentialStore.capture() for the same reason: Claude Code may update
 * `oauthAccount` mid-session (e.g. right after /login).
 */
export async function captureGlobalState(profileDir: string): Promise<void> {
  const live = await readJson(HOME_STATE_FILE);
  if (!live) return;

  const snapshot: JsonRecord = {};
  for (const key of HOME_STATE_ACCOUNT_KEYS) {
    if (key in live) snapshot[key] = live[key];
  }
  if (Object.keys(snapshot).length === 0) return;

  await writeJsonAtomic(path.join(profileDir, PROFILE_STATE_FILE), snapshot);
}

/**
 * Merge this profile's saved account-identity fields into the live
 * $HOME/.claude.json before spawning `claude`. Reads the file fresh and
 * only overwrites the whitelisted keys — every other key (project trust
 * registry, migration flags, etc.) passes through untouched, since that
 * data is genuinely shared across all profiles.
 */
export async function restoreGlobalState(profileDir: string): Promise<void> {
  const snapshotPath = path.join(profileDir, PROFILE_STATE_FILE);
  const snapshot = await readJson(snapshotPath);
  if (!snapshot) return; // profile never captured a state snapshot yet

  const live = (await readJson(HOME_STATE_FILE)) ?? {};
  const merged = { ...live, ...snapshot };
  await writeJsonAtomic(HOME_STATE_FILE, merged);
}

export async function hasGlobalStateSnapshot(profileDir: string): Promise<boolean> {
  return (await readJson(path.join(profileDir, PROFILE_STATE_FILE))) !== null;
}
