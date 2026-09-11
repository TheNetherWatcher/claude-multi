import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let sandbox: string;

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-multi-list-'));
  process.env.CLAUDE_MULTI_HOME = path.join(sandbox, '.claude-multi');
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.CLAUDE_MULTI_HOME;
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('listCommand', () => {
  it('prints a hint when there are no profiles yet', async () => {
    const { listCommand } = await import('../../src/commands/list.js');
    const logSpy = vi.spyOn(console, 'log');
    await listCommand();

    expect(logSpy.mock.calls.some((c) => String(c.join(' ')).includes('No profiles yet'))).toBe(true);
  });

  it('reports healthy links for a freshly added profile', async () => {
    const { addCommand } = await import('../../src/commands/add.js');
    await addCommand('work', { launch: false });

    const { listCommand } = await import('../../src/commands/list.js');
    const logSpy = vi.spyOn(console, 'log');
    await listCommand();

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('work');
    expect(output).toContain('links ok');
  });

  it('flags a broken link when a shared target has been deleted', async () => {
    const { addCommand } = await import('../../src/commands/add.js');
    await addCommand('work', { launch: false });

    await fs.rm(path.join(process.env.CLAUDE_MULTI_HOME!, 'shared', 'projects'), {
      recursive: true,
      force: true,
    });

    const { listCommand } = await import('../../src/commands/list.js');
    const logSpy = vi.spyOn(console, 'log');
    await listCommand();

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('broken link');
  });
});
