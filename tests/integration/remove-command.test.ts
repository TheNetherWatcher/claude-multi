import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let sandbox: string;

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-multi-remove-'));
  process.env.CLAUDE_MULTI_HOME = path.join(sandbox, '.claude-multi');
  process.env.CLAUDE_MULTI_RC_FILE = path.join(sandbox, 'rcfile');
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.CLAUDE_MULTI_HOME;
  delete process.env.CLAUDE_MULTI_RC_FILE;
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('removeCommand', () => {
  it('errors when the profile does not exist', async () => {
    const { removeCommand } = await import('../../src/commands/remove.js');
    await removeCommand('ghost', { yes: true });

    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('removes an existing profile with --yes and clears it as default', async () => {
    const { addCommand } = await import('../../src/commands/add.js');
    await addCommand('work', { launch: false });

    const { writeState, readState } = await import('../../src/core/state.js');
    await writeState({ ...(await readState()), defaultProfile: 'work' });

    const { removeCommand } = await import('../../src/commands/remove.js');
    await removeCommand('work', { yes: true });

    const dir = path.join(process.env.CLAUDE_MULTI_HOME!, 'profiles', 'work');
    await expect(fs.access(dir)).rejects.toThrow();

    const state = await readState();
    expect(state.defaultProfile).toBeUndefined();
  });

  it('does not remove the profile when the confirmation is declined', async () => {
    const { addCommand } = await import('../../src/commands/add.js');
    await addCommand('work', { launch: false });

    vi.doMock('@clack/prompts', () => ({
      confirm: async () => false,
      isCancel: () => false,
    }));

    const { removeCommand } = await import('../../src/commands/remove.js');
    await removeCommand('work', {});

    const dir = path.join(process.env.CLAUDE_MULTI_HOME!, 'profiles', 'work');
    const stat = await fs.lstat(dir);
    expect(stat.isDirectory()).toBe(true);
  });
});
