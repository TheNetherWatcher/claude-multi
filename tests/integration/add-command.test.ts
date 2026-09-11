import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let sandbox: string;

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-multi-add-'));
  process.env.CLAUDE_MULTI_HOME = path.join(sandbox, '.claude-multi');
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.CLAUDE_MULTI_HOME;
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('addCommand', () => {
  it('rejects an invalid profile name without creating anything', async () => {
    const { addCommand } = await import('../../src/commands/add.js');
    await addCommand('not valid!', { launch: false });

    expect(process.exitCode).toBe(1);
    await expect(fs.access(path.join(process.env.CLAUDE_MULTI_HOME!, 'profiles', 'not valid!'))).rejects.toThrow();
    process.exitCode = 0;
  });

  it('rejects a name that already exists', async () => {
    const { addCommand } = await import('../../src/commands/add.js');
    await addCommand('work', { launch: false });
    process.exitCode = 0;

    await addCommand('work', { launch: false });
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('creates a profile with linked shared entries when not launching', async () => {
    const { addCommand } = await import('../../src/commands/add.js');
    await addCommand('work', { launch: false });

    const dir = path.join(process.env.CLAUDE_MULTI_HOME!, 'profiles', 'work');
    const projectsStat = await fs.lstat(path.join(dir, 'projects'));
    expect(projectsStat.isSymbolicLink()).toBe(true);
  });

  it('launches and reports captured credentials when the store has one', async () => {
    vi.doMock('../../src/core/launcher.js', () => ({
      launchClaudeForProfile: vi.fn(async () => 0),
    }));
    vi.doMock('../../src/core/credential-store.js', () => ({
      getCredentialStore: () => ({
        hasCredential: async () => true,
      }),
    }));

    const { addCommand } = await import('../../src/commands/add.js');
    const logSpy = vi.spyOn(console, 'log');
    await addCommand('work', { launch: true });

    expect(logSpy.mock.calls.some((c) => String(c.join(' ')).includes('Captured credentials'))).toBe(true);
  });

  it('warns when no credentials were captured after launch', async () => {
    vi.doMock('../../src/core/launcher.js', () => ({
      launchClaudeForProfile: vi.fn(async () => 0),
    }));
    vi.doMock('../../src/core/credential-store.js', () => ({
      getCredentialStore: () => ({
        hasCredential: async () => false,
      }),
    }));

    const { addCommand } = await import('../../src/commands/add.js');
    const warnSpy = vi.spyOn(console, 'warn');
    await addCommand('work', { launch: true });

    expect(warnSpy.mock.calls.some((c) => String(c.join(' ')).includes('No credentials captured'))).toBe(true);
  });
});
