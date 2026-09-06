import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Every path this test touches is sandboxed via env override — none of
// them may ever resolve to a real $HOME path. `setup` does an fs.rename on
// DEFAULT_CLAUDE_CONFIG_DIR, so getting this wrong would rename a real
// ~/.claude directory.
let sandbox: string;
let fakeDefaultClaudeDir: string;

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-multi-setup-'));
  fakeDefaultClaudeDir = path.join(sandbox, 'fake-home', '.claude');
  await fs.mkdir(fakeDefaultClaudeDir, { recursive: true });

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

describe('setupCommand adoption', () => {
  it('sanity check: every env override actually points inside the sandbox', () => {
    expect(fakeDefaultClaudeDir.startsWith(sandbox)).toBe(true);
    expect(process.env.CLAUDE_MULTI_HOME!.startsWith(sandbox)).toBe(true);
    expect(process.env.CLAUDE_MULTI_HOME_STATE_FILE!.startsWith(sandbox)).toBe(true);
  });

  it('moves an existing config dir into profiles/primary and symlinks it back', async () => {
    await fs.writeFile(path.join(fakeDefaultClaudeDir, 'config.json'), '{"customApiKeyResponses":{}}');
    await fs.mkdir(path.join(fakeDefaultClaudeDir, 'projects'), { recursive: true });
    await fs.writeFile(path.join(fakeDefaultClaudeDir, 'projects', 'p1.json'), '{}');
    await fs.writeFile(path.join(fakeDefaultClaudeDir, 'history.jsonl'), 'line1\n');

    // @clack/prompts reads from a real TTY for confirm() — stub it to auto-accept.
    vi.doMock('@clack/prompts', () => ({
      intro: () => {},
      outro: () => {},
      confirm: async () => true,
      isCancel: () => false,
      log: { info: () => {} },
    }));

    // setup() also calls getCredentialStore().capture() on the adopted profile.
    // On this machine that's the real macOS Keychain — stub it so the test
    // never shells out to `security` against a real, live Keychain entry.
    vi.doMock('../../src/core/credential-store.js', () => ({
      getCredentialStore: () => ({
        capture: async () => {},
        restore: async () => {},
        hasCredential: async () => false,
      }),
    }));

    const { setupCommand } = await import('../../src/commands/setup.js');
    await setupCommand();

    const primaryDir = path.join(process.env.CLAUDE_MULTI_HOME!, 'profiles', 'primary');
    const primaryStat = await fs.lstat(primaryDir);
    expect(primaryStat.isDirectory()).toBe(true);

    // Original path now symlinks to the profile, so bare `claude` still works.
    const originalStat = await fs.lstat(fakeDefaultClaudeDir);
    expect(originalStat.isSymbolicLink()).toBe(true);
    expect(await fs.readlink(fakeDefaultClaudeDir)).toBe(primaryDir);

    // Shared data actually moved into the shared store, not left behind or duplicated.
    const sharedProjects = await fs.readdir(path.join(process.env.CLAUDE_MULTI_HOME!, 'shared', 'projects'));
    expect(sharedProjects).toContain('p1.json');

    // Auth file stayed local to the profile (real file, not a symlink).
    const configStat = await fs.lstat(path.join(primaryDir, 'config.json'));
    expect(configStat.isSymbolicLink()).toBe(false);

    const state = JSON.parse(
      await fs.readFile(path.join(process.env.CLAUDE_MULTI_HOME!, 'state.json'), 'utf8')
    );
    expect(state.primaryAdopted).toBe(true);
    expect(state.defaultProfile).toBe('primary');
  });
});
