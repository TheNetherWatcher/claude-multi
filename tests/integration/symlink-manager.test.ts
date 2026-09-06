import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createSymlink,
  checkSymlinkHealth,
  ensureSharedTarget,
} from '../../src/core/symlink-manager.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-multi-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ensureSharedTarget', () => {
  it('creates a missing directory target', async () => {
    const target = path.join(tmpDir, 'shared', 'projects');
    await ensureSharedTarget(target, true);
    const stat = await fs.stat(target);
    expect(stat.isDirectory()).toBe(true);
  });

  it('creates a missing file target, including parent dirs', async () => {
    const target = path.join(tmpDir, 'shared', 'history.jsonl');
    await ensureSharedTarget(target, false);
    const stat = await fs.stat(target);
    expect(stat.isFile()).toBe(true);
  });

  it('leaves an existing target untouched', async () => {
    const target = path.join(tmpDir, 'shared', 'settings.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, '{"kept":true}');
    await ensureSharedTarget(target, false);
    expect(await fs.readFile(target, 'utf8')).toBe('{"kept":true}');
  });
});

describe('createSymlink', () => {
  it('links to a shared dir target that does not exist yet, creating it', async () => {
    const link = path.join(tmpDir, 'profile', 'projects');
    const target = path.join(tmpDir, 'shared', 'projects');

    await createSymlink(link, target, true);

    const linkStat = await fs.lstat(link);
    expect(linkStat.isSymbolicLink()).toBe(true);
    expect(await fs.readlink(link)).toBe(target);
    expect((await fs.stat(target)).isDirectory()).toBe(true);
  });

  it('links to a shared file target, creating parent dirs first', async () => {
    const link = path.join(tmpDir, 'profile', 'history.jsonl');
    const target = path.join(tmpDir, 'shared', 'history.jsonl');

    await createSymlink(link, target, false);

    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
    expect((await fs.stat(target)).isFile()).toBe(true);
  });

  it('is idempotent when re-run against an already-correct link', async () => {
    const link = path.join(tmpDir, 'profile', 'plans');
    const target = path.join(tmpDir, 'shared', 'plans');

    await createSymlink(link, target, true);
    await createSymlink(link, target, true); // should not throw

    expect(await fs.readlink(link)).toBe(target);
  });

  it('repairs a stale symlink pointing at the wrong target', async () => {
    const link = path.join(tmpDir, 'profile', 'skills');
    const wrongTarget = path.join(tmpDir, 'shared-old', 'skills');
    const correctTarget = path.join(tmpDir, 'shared', 'skills');

    await createSymlink(link, wrongTarget, true);
    await createSymlink(link, correctTarget, true);

    expect(await fs.readlink(link)).toBe(correctTarget);
  });

  it('refuses to clobber a real file that is not already a symlink', async () => {
    const link = path.join(tmpDir, 'profile', 'settings.json');
    const target = path.join(tmpDir, 'shared', 'settings.json');

    await fs.mkdir(path.dirname(link), { recursive: true });
    await fs.writeFile(link, '{"real":"data"}');

    await expect(createSymlink(link, target, false)).rejects.toThrow();
    expect(await fs.readFile(link, 'utf8')).toBe('{"real":"data"}');
  });
});

describe('checkSymlinkHealth', () => {
  it('reports "ok" for a correct, healthy link', async () => {
    const link = path.join(tmpDir, 'profile', 'tasks');
    const target = path.join(tmpDir, 'shared', 'tasks');
    await createSymlink(link, target, true);

    const health = await checkSymlinkHealth('tasks', link, target);
    expect(health.status).toBe('ok');
  });

  it('reports "missing" when the link was never created', async () => {
    const link = path.join(tmpDir, 'profile', 'tasks');
    const target = path.join(tmpDir, 'shared', 'tasks');

    const health = await checkSymlinkHealth('tasks', link, target);
    expect(health.status).toBe('missing');
  });

  it('reports "not-a-symlink" when a real file occupies the slot', async () => {
    const link = path.join(tmpDir, 'profile', 'settings.json');
    await fs.mkdir(path.dirname(link), { recursive: true });
    await fs.writeFile(link, '{}');

    const health = await checkSymlinkHealth('settings.json', link, path.join(tmpDir, 'shared', 'settings.json'));
    expect(health.status).toBe('not-a-symlink');
  });

  it('reports "target-missing" when the shared target was deleted out from under the link', async () => {
    const link = path.join(tmpDir, 'profile', 'plans');
    const target = path.join(tmpDir, 'shared', 'plans');
    await createSymlink(link, target, true);
    await fs.rm(target, { recursive: true });

    const health = await checkSymlinkHealth('plans', link, target);
    expect(health.status).toBe('target-missing');
  });

  it('reports "broken" when the link points somewhere other than expected', async () => {
    const link = path.join(tmpDir, 'profile', 'skills');
    const actualTarget = path.join(tmpDir, 'shared', 'skills');
    const expectedTarget = path.join(tmpDir, 'shared', 'other-skills');
    await createSymlink(link, actualTarget, true);
    await ensureSharedTarget(expectedTarget, true);

    const health = await checkSymlinkHealth('skills', link, expectedTarget);
    expect(health.status).toBe('broken');
  });
});
