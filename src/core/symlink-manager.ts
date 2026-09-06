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

/** True if two existing paths are the same underlying file (i.e. `b` is a hardlink to `a`). */
async function isSameFile(a: string, b: string): Promise<boolean> {
  try {
    const [statA, statB] = await Promise.all([fs.stat(a), fs.stat(b)]);
    return statA.dev === statB.dev && statA.ino === statB.ino;
  } catch {
    return false;
  }
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
 *
 * Windows note: directories use a junction (works without admin/Developer
 * Mode). Files have no junction equivalent, and a real file symlink needs
 * a privilege most installs don't have — so a file entry falls back to a
 * hardlink there, which needs no special privilege as long as both paths
 * are on the same volume (guaranteed here: everything lives under one
 * CLAUDE_MULTI_HOME). A hardlink isn't a symlink, so checkSymlinkHealth()
 * treats "same inode as the target" as the healthy state for files too.
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
    } else if (!isDirectory && (await isSameFile(linkPath, targetPath))) {
      return; // already a correct hardlink (Windows fallback case)
    } else {
      throw new Error(
        `Refusing to overwrite existing non-symlink at ${linkPath}. ` +
          `Move or remove it manually, then re-run.`
      );
    }
  }

  if (isDirectory) {
    const symlinkType = process.platform === 'win32' ? 'junction' : undefined;
    await fs.symlink(targetPath, linkPath, symlinkType);
    return;
  }

  if (process.platform !== 'win32') {
    await fs.symlink(targetPath, linkPath);
    return;
  }

  try {
    await fs.symlink(targetPath, linkPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EPERM') throw err;
    // No SeCreateSymbolicLinkPrivilege (the common case outside Developer
    // Mode/admin) — a hardlink gets the same "one shared file" outcome.
    await fs.link(targetPath, linkPath);
  }
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
    // Windows file-entry fallback: a hardlink to the right target is healthy too.
    if (stat.isFile() && (await isSameFile(linkPath, expectedTarget))) {
      return { entry, linkPath, status: 'ok' };
    }
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
