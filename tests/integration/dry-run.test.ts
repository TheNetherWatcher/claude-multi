import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let sandbox: string;
let fakeDefaultClaudeDir: string;

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-multi-dryrun-'));
  fakeDefaultClaudeDir = path.join(sandbox, 'fake-home', '.claude');
  process.env.CLAUDE_MULTI_HOME = path.join(sandbox, '.claude-multi');
  process.env.CLAUDE_MULTI_DEFAULT_CONFIG_DIR = fakeDefaultClaudeDir;
  process.env.CLAUDE_MULTI_HOME_STATE_FILE = path.join(sandbox, 'fake-home', '.claude.json');
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.CLAUDE_MULTI_HOME;
  delete process.env.CLAUDE_MULTI_DEFAULT_CONFIG_DIR;
  delete process.env.CLAUDE_MULTI_HOME_STATE_FILE;
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('removeCommand --dry-run', () => {
  it('reports the plan and makes no changes', async () => {
    const { addCommand } = await import('../../src/commands/add.js');
    await addCommand('work', { launch: false });

    const { writeState, readState } = await import('../../src/core/state.js');
    await writeState({ ...(await readState()), defaultProfile: 'work' });

    const { removeCommand } = await import('../../src/commands/remove.js');
    const logSpy = vi.spyOn(console, 'log');
    await removeCommand('work', { dryRun: true });

    const dir = path.join(process.env.CLAUDE_MULTI_HOME!, 'profiles', 'work');
    const stat = await fs.lstat(dir);
    expect(stat.isDirectory()).toBe(true);

    const state = await readState();
    expect(state.defaultProfile).toBe('work');

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Would remove profile "work"');
    expect(output).toContain('Would clear "work" as the default profile');
  });
});

describe('setupCommand --dry-run', () => {
  it('describes the adoption plan without moving anything', async () => {
    await fs.mkdir(fakeDefaultClaudeDir, { recursive: true });
    await fs.writeFile(path.join(fakeDefaultClaudeDir, 'config.json'), '{}');
    await fs.mkdir(path.join(fakeDefaultClaudeDir, 'projects'), { recursive: true });
    await fs.writeFile(path.join(fakeDefaultClaudeDir, 'projects', 'p1.json'), '{}');

    vi.doMock('@clack/prompts', () => ({
      intro: () => {},
      outro: () => {},
      confirm: async () => true,
      isCancel: () => false,
      log: { info: () => {} },
    }));

    const { setupCommand } = await import('../../src/commands/setup.js');
    const logSpy = vi.spyOn(console, 'log');
    await setupCommand({ dryRun: true });

    // Original dir untouched — still a real directory, not moved or symlinked.
    const stat = await fs.lstat(fakeDefaultClaudeDir);
    expect(stat.isDirectory()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);

    // No profile or shared store created.
    await expect(
      fs.access(path.join(process.env.CLAUDE_MULTI_HOME!, 'profiles', 'primary'))
    ).rejects.toThrow();
    await expect(fs.access(process.env.CLAUDE_MULTI_HOME!)).rejects.toThrow();

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('would move into');
  });

  it('does nothing to report when there is no existing ~/.claude to adopt', async () => {
    vi.doMock('@clack/prompts', () => ({
      intro: () => {},
      outro: () => {},
      confirm: async () => true,
      isCancel: () => false,
      log: { info: () => {} },
    }));

    const { setupCommand } = await import('../../src/commands/setup.js');
    await setupCommand({ dryRun: true });

    await expect(fs.access(process.env.CLAUDE_MULTI_HOME!)).rejects.toThrow();
  });
});
