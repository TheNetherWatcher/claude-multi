import os from 'node:os';
import path from 'node:path';

export type ShellKind = 'zsh' | 'bash' | 'fish' | 'unknown';

export interface ShellInfo {
  kind: ShellKind;
  rcFile: string | null;
}

export function detectShell(shellEnv: string | undefined = process.env.SHELL): ShellInfo {
  const home = os.homedir();
  const name = shellEnv ? path.basename(shellEnv) : '';

  let kind: ShellKind = 'unknown';
  let rcFile: string | null = null;

  if (name === 'zsh') {
    kind = 'zsh';
    rcFile = path.join(home, '.zshrc');
  } else if (name === 'bash') {
    kind = 'bash';
    rcFile = path.join(home, '.bashrc');
  } else if (name === 'fish') {
    kind = 'fish';
    rcFile = path.join(home, '.config', 'fish', 'config.fish');
  }

  // Escape hatch for tests (and users who keep aliases in a non-default rc
  // file) — never resolved from a real $HOME so a test run can't land in
  // an actual dotfile just because CLAUDE_MULTI_HOME was sandboxed.
  const override = process.env.CLAUDE_MULTI_RC_FILE;
  if (override) rcFile = override;

  return { kind, rcFile };
}

/** Render the wrapper alias/function for one profile, in the target shell's syntax. */
export function renderProfileBinding(kind: ShellKind, profileName: string, configDir: string): string {
  const funcName = `claude-${profileName}`;
  if (kind === 'fish') {
    return `function ${funcName}\n    env CLAUDE_CONFIG_DIR="${configDir}" claude $argv\nend`;
  }
  // zsh / bash
  return `${funcName}() {\n  CLAUDE_CONFIG_DIR="${configDir}" claude "$@"\n}`;
}
