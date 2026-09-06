import fs from 'node:fs/promises';
import { SHELL_BLOCK_START, SHELL_BLOCK_END } from '../core/constants.js';

/**
 * Idempotently replace (or append) a marked block inside a shell rc file's
 * content. Pure string transform, no I/O — kept separate from
 * upsertShellBlock() so it's trivially unit-testable against arbitrary
 * existing rc content without touching the filesystem.
 */
export function applyShellBlock(existingContent: string, blockBody: string): string {
  const block = `${SHELL_BLOCK_START}\n${blockBody}\n${SHELL_BLOCK_END}`;
  const startIdx = existingContent.indexOf(SHELL_BLOCK_START);
  const endIdx = existingContent.indexOf(SHELL_BLOCK_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existingContent.slice(0, startIdx);
    const after = existingContent.slice(endIdx + SHELL_BLOCK_END.length);
    return `${before}${block}${after}`;
  }

  if (startIdx !== -1 || endIdx !== -1) {
    // Only one marker present — file was hand-edited or corrupted. Don't
    // guess; caller should surface this rather than mangling user content.
    throw new Error(
      'Found a claude-multi start/end marker without its matching pair. ' +
        'Refusing to edit automatically — please fix or remove the stray marker.'
    );
  }

  const separator = existingContent.length > 0 && !existingContent.endsWith('\n') ? '\n' : '';
  const spacer = existingContent.length > 0 ? '\n' : '';
  return `${existingContent}${separator}${spacer}${block}\n`;
}

/** Strip the marked block entirely (used by `remove` cleanup / full uninstall). */
export function removeShellBlock(existingContent: string): string {
  const startIdx = existingContent.indexOf(SHELL_BLOCK_START);
  const endIdx = existingContent.indexOf(SHELL_BLOCK_END);
  if (startIdx === -1 || endIdx === -1) return existingContent;

  const before = existingContent.slice(0, startIdx);
  const after = existingContent.slice(endIdx + SHELL_BLOCK_END.length);
  return `${before}${after}`.replace(/\n{3,}/g, '\n\n');
}

export async function upsertShellBlock(rcFile: string, blockBody: string): Promise<void> {
  let existing = '';
  try {
    existing = await fs.readFile(rcFile, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const updated = applyShellBlock(existing, blockBody);
  await fs.writeFile(rcFile, updated, 'utf8');
}
