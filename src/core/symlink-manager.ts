import fs from 'node:fs/promises';
import path from 'node:path';
import type { SymlinkHealth } from './types.js';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

async function ensureParentDir(p: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
}

/**
 * Ensure `targetPath` exists in the shared store before anything links to it.
 * Claude Code creates these lazily on first use; if a profile launches before
 * the shared store has ever seen e.g. `plans/`, a dangling symlink would
 * crash Claude Code on startup instead of Node creating the dir for it.
 */
export async function ensureSharedTarget(targetPath: string, isDirectory: boolean): Promise<void> {
  if (await pathExists(targetPath)) return;
  if (isDirectory) {
    await fs.mkdir(targetPath, { recursive: true });
  } else {
    await ensureParentDir(targetPath);
    await fs.writeFile(targetPath, '', { flag: 'a' });
  }
}

/**
 * Create (or repair) a symlink at `linkPath` pointing at `targetPath`.
 * Idempotent: safe to call on an already-correct link, replaces a stale one,
 * and refuses to clobber a real file/dir that isn't already a symlink
 * (that data would silently vanish behind the link otherwise).
 */
export async function createSymlink(
  linkPath: string,
  targetPath: string,
  isDirectory: boolean
): Promise<void> {
  await ensureSharedTarget(targetPath, isDirectory);
  await ensureParentDir(linkPath);

  if (await pathExists(linkPath)) {
    const stat = await fs.lstat(linkPath);
    if (stat.isSymbolicLink()) {
      const current = await fs.readlink(linkPath);
      if (path.resolve(path.dirname(linkPath), current) === path.resolve(targetPath)) {
        return; // already correct
      }
      await fs.unlink(linkPath);
    } else {
      throw new Error(
        `Refusing to overwrite existing non-symlink at ${linkPath}. ` +
          `Move or remove it manually, then re-run.`
      );
    }
  }

  const symlinkType = process.platform === 'win32' && isDirectory ? 'junction' : undefined;
  await fs.symlink(targetPath, linkPath, symlinkType);
}

export async function checkSymlinkHealth(
  entry: string,
  linkPath: string,
  expectedTarget: string
): Promise<SymlinkHealth> {
  if (!(await pathExists(linkPath))) {
    return { entry, linkPath, status: 'missing' };
  }

  const stat = await fs.lstat(linkPath);
  if (!stat.isSymbolicLink()) {
    return { entry, linkPath, status: 'not-a-symlink' };
  }

  let resolvedTarget: string;
  try {
    resolvedTarget = await fs.readlink(linkPath);
  } catch (err) {
    return { entry, linkPath, status: 'broken', detail: String(err) };
  }

  const absoluteTarget = path.resolve(path.dirname(linkPath), resolvedTarget);
  if (!(await pathExists(absoluteTarget))) {
    return { entry, linkPath, status: 'target-missing', detail: absoluteTarget };
  }

  if (path.resolve(expectedTarget) !== absoluteTarget) {
    return {
      entry,
      linkPath,
      status: 'broken',
      detail: `points to ${absoluteTarget}, expected ${expectedTarget}`,
    };
  }

  return { entry, linkPath, status: 'ok' };
}
