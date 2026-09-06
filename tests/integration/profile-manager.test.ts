import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-multi-home-'));
  process.env.CLAUDE_MULTI_HOME = tmpHome;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.CLAUDE_MULTI_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe('linkSharedEntries', () => {
  it('links every shared entry for a new profile into the shared store', async () => {
    const { linkSharedEntries, profileDir } = await import('../../src/core/profile-manager.js');
    const { SHARED_ENTRIES } = await import('../../src/core/constants.js');

    await linkSharedEntries('work');
    const dir = profileDir('work');

    for (const entry of SHARED_ENTRIES) {
      const stat = await fs.lstat(path.join(dir, entry));
      expect(stat.isSymbolicLink()).toBe(true);
    }
  });

  it('two profiles share the same underlying target (writes are visible across profiles)', async () => {
    const { linkSharedEntries, profileDir } = await import('../../src/core/profile-manager.js');

    await linkSharedEntries('work');
    await linkSharedEntries('personal');

    const workHistory = path.join(profileDir('work'), 'history.jsonl');
    const personalHistory = path.join(profileDir('personal'), 'history.jsonl');

    await fs.appendFile(workHistory, 'line-from-work\n');
    const seenFromPersonal = await fs.readFile(personalHistory, 'utf8');
    expect(seenFromPersonal).toContain('line-from-work');
  });

  it('does not touch auth-only files, leaving them isolated per profile', async () => {
    const { linkSharedEntries, profileDir } = await import('../../src/core/profile-manager.js');

    await linkSharedEntries('work');
    await linkSharedEntries('personal');

    const workConfig = path.join(profileDir('work'), 'config.json');
    await fs.writeFile(workConfig, '{"account":"work"}');

    const personalConfigExists = await fs
      .access(path.join(profileDir('personal'), 'config.json'))
      .then(() => true)
      .catch(() => false);

    expect(personalConfigExists).toBe(false);
  });
});

describe('removeProfile', () => {
  it('removes the profile dir without deleting shared data', async () => {
    const { linkSharedEntries, removeProfile, profileDir } = await import(
      '../../src/core/profile-manager.js'
    );
    const { SHARED_DIR } = await import('../../src/core/constants.js');

    await linkSharedEntries('temp');
    await fs.appendFile(path.join(profileDir('temp'), 'history.jsonl'), 'important\n');

    await removeProfile('temp');

    const profileGone = await fs
      .access(profileDir('temp'))
      .then(() => false)
      .catch(() => true);
    expect(profileGone).toBe(true);

    const sharedHistory = await fs.readFile(path.join(SHARED_DIR, 'history.jsonl'), 'utf8');
    expect(sharedHistory).toContain('important');
  });
});

describe('isValidProfileName', () => {
  it('rejects the reserved name "shared" and path-unsafe input', async () => {
    const { isValidProfileName } = await import('../../src/core/profile-manager.js');
    expect(isValidProfileName('shared')).toBe(false);
    expect(isValidProfileName('../escape')).toBe(false);
    expect(isValidProfileName('work')).toBe(true);
    expect(isValidProfileName('work-2')).toBe(true);
  });
});
