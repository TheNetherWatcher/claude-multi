import { describe, it, expect } from 'vitest';
import { detectShell, renderProfileBinding } from '../../src/platform/shell.js';

describe('detectShell', () => {
  it('detects zsh from $SHELL on unix platforms', () => {
    const info = detectShell('/bin/zsh', 'darwin');
    expect(info.kind).toBe('zsh');
    expect(info.rcFile).toMatch(/\.zshrc$/);
  });

  it('detects fish from $SHELL', () => {
    const info = detectShell('/usr/local/bin/fish', 'linux');
    expect(info.kind).toBe('fish');
    expect(info.rcFile).toMatch(/config\.fish$/);
  });

  it('ignores $SHELL entirely on win32 and targets the PowerShell profile', () => {
    // $SHELL is a Unix convention; PowerShell/cmd never set it, so even if
    // it happens to be set (e.g. under WSL-adjacent tooling) win32 must win.
    const info = detectShell('/bin/zsh', 'win32');
    expect(info.kind).toBe('powershell');
    expect(info.rcFile).toMatch(/Microsoft\.PowerShell_profile\.ps1$/);
  });

  it('falls back to unknown with no rc file when $SHELL is unrecognized', () => {
    const info = detectShell('/bin/tcsh', 'linux');
    expect(info.kind).toBe('unknown');
    expect(info.rcFile).toBeNull();
  });

  it('honors CLAUDE_MULTI_RC_FILE override regardless of platform', () => {
    process.env.CLAUDE_MULTI_RC_FILE = '/sandbox/fake-profile.ps1';
    try {
      const info = detectShell('/bin/zsh', 'win32');
      expect(info.rcFile).toBe('/sandbox/fake-profile.ps1');
    } finally {
      delete process.env.CLAUDE_MULTI_RC_FILE;
    }
  });
});

describe('renderProfileBinding', () => {
  it('scopes CLAUDE_CONFIG_DIR to just the one invocation on PowerShell', () => {
    const binding = renderProfileBinding('powershell', 'work', 'C:\\profiles\\work');
    // Must save and restore the previous value — a bare assignment would
    // leak CLAUDE_CONFIG_DIR into every later command in the session.
    expect(binding).toContain('$prevConfigDir = $env:CLAUDE_CONFIG_DIR');
    expect(binding).toContain('finally { $env:CLAUDE_CONFIG_DIR = $prevConfigDir }');
    expect(binding).toContain('claude-work');
  });

  it('produces a bash function for zsh/bash', () => {
    const binding = renderProfileBinding('zsh', 'personal', '/home/u/.claude-multi/profiles/personal');
    expect(binding).toContain('claude-personal()');
    expect(binding).toContain('CLAUDE_CONFIG_DIR="/home/u/.claude-multi/profiles/personal" claude "$@"');
  });

  it('produces a fish function', () => {
    const binding = renderProfileBinding('fish', 'work', '/home/u/.claude-multi/profiles/work');
    expect(binding).toContain('function claude-work');
    expect(binding).toContain('env CLAUDE_CONFIG_DIR="/home/u/.claude-multi/profiles/work" claude $argv');
  });
});
