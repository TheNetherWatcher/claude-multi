import { describe, it, expect } from 'vitest';
import { applyShellBlock, removeShellBlock } from '../../src/utils/shell-block.js';
import { SHELL_BLOCK_START, SHELL_BLOCK_END } from '../../src/core/constants.js';

describe('applyShellBlock', () => {
  it('appends a block to empty content', () => {
    const result = applyShellBlock('', 'claude-work() { :; }');
    expect(result).toContain(SHELL_BLOCK_START);
    expect(result).toContain(SHELL_BLOCK_END);
    expect(result).toContain('claude-work');
  });

  it('appends after existing unrelated content, preserving it', () => {
    const existing = 'export PATH="$HOME/bin:$PATH"\nalias ll="ls -la"\n';
    const result = applyShellBlock(existing, 'claude-work() { :; }');
    expect(result.startsWith(existing.trimEnd())).toBe(true);
    expect(result).toContain('claude-work');
  });

  it('is idempotent: re-applying with the same body produces the same result', () => {
    const existing = 'echo hello\n';
    const once = applyShellBlock(existing, 'claude-work() { :; }');
    const twice = applyShellBlock(once, 'claude-work() { :; }');
    expect(twice).toBe(once);
  });

  it('replaces only the marked block on update, leaving surrounding content untouched', () => {
    const existing = applyShellBlock('# my custom stuff\nalias foo=bar\n', 'claude-work() { :; }');
    const updated = applyShellBlock(existing, 'claude-work() { :; }\n\nclaude-personal() { :; }');

    expect(updated).toContain('# my custom stuff');
    expect(updated).toContain('alias foo=bar');
    expect(updated).toContain('claude-personal');
    // old block content should not be duplicated
    expect(updated.match(new RegExp(SHELL_BLOCK_START, 'g'))?.length).toBe(1);
  });

  it('does not corrupt content when re-run many times (no marker drift/growth)', () => {
    let content = 'export FOO=bar\n';
    for (let i = 0; i < 5; i++) {
      content = applyShellBlock(content, `claude-profile${i}() { :; }`);
    }
    const startCount = content.match(new RegExp(SHELL_BLOCK_START, 'g'))?.length ?? 0;
    const endCount = content.match(new RegExp(SHELL_BLOCK_END, 'g'))?.length ?? 0;
    expect(startCount).toBe(1);
    expect(endCount).toBe(1);
    expect(content).toContain('claude-profile4');
    expect(content).not.toContain('claude-profile0');
  });

  it('throws on a single stray marker rather than guessing', () => {
    const corrupted = `${SHELL_BLOCK_START}\nsomething\n`;
    expect(() => applyShellBlock(corrupted, 'claude-work() { :; }')).toThrow();
  });
});

describe('removeShellBlock', () => {
  it('strips a previously-applied block entirely', () => {
    const withBlock = applyShellBlock('alias ll="ls -la"\n', 'claude-work() { :; }');
    const stripped = removeShellBlock(withBlock);
    expect(stripped).not.toContain(SHELL_BLOCK_START);
    expect(stripped).not.toContain('claude-work');
    expect(stripped).toContain('alias ll="ls -la"');
  });

  it('is a no-op when no block is present', () => {
    const content = 'echo hi\n';
    expect(removeShellBlock(content)).toBe(content);
  });
});
