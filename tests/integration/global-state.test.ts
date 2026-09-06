import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;
let fakeHomeStateFile: string;
let profileDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-multi-globalstate-'));
  fakeHomeStateFile = path.join(tmpDir, 'fake-home-claude.json');
  profileDir = path.join(tmpDir, 'profile');
  await fs.mkdir(profileDir, { recursive: true });
  // Never resolves to a real path — this is the whole point of the override.
  process.env.CLAUDE_MULTI_HOME_STATE_FILE = fakeHomeStateFile;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.CLAUDE_MULTI_HOME_STATE_FILE;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('captureGlobalState / restoreGlobalState', () => {
  it('captures only the whitelisted account-identity keys, not the whole file', async () => {
    const { captureGlobalState } = await import('../../src/core/global-state.js');

    await fs.writeFile(
      fakeHomeStateFile,
      JSON.stringify({
        oauthAccount: { email: 'work@example.com' },
        claudeCodeFirstTokenDate: '2024-01-01',
        projects: { '/some/dir': { trusted: true } },
        machineID: 'abc123',
      })
    );

    await captureGlobalState(profileDir);

    const snapshotRaw = await fs.readFile(
      path.join(profileDir, '.claude-multi-global-state.json'),
      'utf8'
    );
    const snapshot = JSON.parse(snapshotRaw);

    expect(snapshot.oauthAccount).toEqual({ email: 'work@example.com' });
    expect(snapshot.claudeCodeFirstTokenDate).toBe('2024-01-01');
    expect(snapshot.projects).toBeUndefined();
    expect(snapshot.machineID).toBeUndefined();
  });

  it('restoring merges the snapshot in without touching unrelated shared fields', async () => {
    const { captureGlobalState, restoreGlobalState } = await import('../../src/core/global-state.js');

    // Profile "work" captures its own identity.
    await fs.writeFile(
      fakeHomeStateFile,
      JSON.stringify({ oauthAccount: { email: 'work@example.com' }, machineID: 'abc123' })
    );
    await captureGlobalState(profileDir);

    // Simulate a different profile having run in between, leaving its own
    // account in the live file but also changing an unrelated shared field.
    await fs.writeFile(
      fakeHomeStateFile,
      JSON.stringify({
        oauthAccount: { email: 'personal@example.com' },
        machineID: 'abc123',
        projects: { '/new/dir': { trusted: true } },
      })
    );

    await restoreGlobalState(profileDir);

    const live = JSON.parse(await fs.readFile(fakeHomeStateFile, 'utf8'));
    expect(live.oauthAccount).toEqual({ email: 'work@example.com' }); // restored
    expect(live.machineID).toBe('abc123'); // untouched shared field
    expect(live.projects).toEqual({ '/new/dir': { trusted: true } }); // untouched shared field
  });

  it('restore is a no-op when the profile never captured a snapshot', async () => {
    const { restoreGlobalState } = await import('../../src/core/global-state.js');
    await fs.writeFile(fakeHomeStateFile, JSON.stringify({ oauthAccount: { email: 'x@example.com' } }));

    await restoreGlobalState(profileDir);

    const live = JSON.parse(await fs.readFile(fakeHomeStateFile, 'utf8'));
    expect(live.oauthAccount).toEqual({ email: 'x@example.com' });
  });

  it('restore creates the home state file if it does not exist yet', async () => {
    const { captureGlobalState, restoreGlobalState } = await import('../../src/core/global-state.js');
    await fs.writeFile(fakeHomeStateFile, JSON.stringify({ oauthAccount: { email: 'work@example.com' } }));
    await captureGlobalState(profileDir);
    await fs.rm(fakeHomeStateFile);

    await restoreGlobalState(profileDir);

    const live = JSON.parse(await fs.readFile(fakeHomeStateFile, 'utf8'));
    expect(live.oauthAccount).toEqual({ email: 'work@example.com' });
  });

  it('capture is a no-op when the home state file does not exist', async () => {
    const { captureGlobalState, hasGlobalStateSnapshot } = await import('../../src/core/global-state.js');
    await captureGlobalState(profileDir);
    expect(await hasGlobalStateSnapshot(profileDir)).toBe(false);
  });
});
