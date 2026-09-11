import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let sandbox: string;

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-multi-link-shell-'));
  process.env.CLAUDE_MULTI_HOME = path.join(sandbox, '.claude-multi');
  process.env.CLAUDE_MULTI_RC_FILE = path.join(sandbox, 'rcfile');
  process.env.SHELL = '/bin/zsh';
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.CLAUDE_MULTI_HOME;
  delete process.env.CLAUDE_MULTI_RC_FILE;
  delete process.env.SHELL;
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('linkShellCommand', () => {
  it('writes a claude-multi block with one binding per profile', async () => {
    const { addCommand } = await import('../../src/commands/add.js');
    await addCommand('work', { launch: false });

    const { linkShellCommand } = await import('../../src/commands/link-shell.js');
    await linkShellCommand();

    const rc = await fs.readFile(process.env.CLAUDE_MULTI_RC_FILE!, 'utf8');
    expect(rc).toContain('# >>> claude-multi >>>');
    // Binding syntax depends on the real OS (win32 always maps to
    // PowerShell in detectShell regardless of $SHELL) — assert the
    // function name only, not shell-specific syntax.
    expect(rc).toContain('claude-work');
  });

  it('is idempotent across repeated runs', async () => {
    const { addCommand } = await import('../../src/commands/add.js');
    await addCommand('work', { launch: false });

    const { linkShellCommand } = await import('../../src/commands/link-shell.js');
    await linkShellCommand();
    await linkShellCommand();

    const rc = await fs.readFile(process.env.CLAUDE_MULTI_RC_FILE!, 'utf8');
    expect(rc.match(/# >>> claude-multi >>>/g)?.length).toBe(1);
  });
});
