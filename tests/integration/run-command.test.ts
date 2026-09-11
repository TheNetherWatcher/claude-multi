import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let sandbox: string;

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-multi-run-'));
  process.env.CLAUDE_MULTI_HOME = path.join(sandbox, '.claude-multi');
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.CLAUDE_MULTI_HOME;
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('runCommand', () => {
  it('errors and never launches when the profile does not exist', async () => {
    const launchMock = vi.fn(async () => 0);
    vi.doMock('../../src/core/launcher.js', () => ({ launchClaudeForProfile: launchMock }));

    const { runCommand } = await import('../../src/commands/run.js');
    await runCommand('ghost', ['--continue']);

    expect(process.exitCode).toBe(1);
    expect(launchMock).not.toHaveBeenCalled();
    process.exitCode = 0;
  });

  it('launches the existing profile with forwarded args and propagates exit code', async () => {
    const launchMock = vi.fn(async () => 7);
    vi.doMock('../../src/core/launcher.js', () => ({ launchClaudeForProfile: launchMock }));

    const { addCommand } = await import('../../src/commands/add.js');
    await addCommand('work', { launch: false });

    const { runCommand } = await import('../../src/commands/run.js');
    await runCommand('work', ['--continue']);

    const dir = path.join(process.env.CLAUDE_MULTI_HOME!, 'profiles', 'work');
    expect(launchMock).toHaveBeenCalledWith('work', dir, ['--continue']);
    expect(process.exitCode).toBe(7);
    process.exitCode = 0;
  });
});
