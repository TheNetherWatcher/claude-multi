import os from 'node:os';
import path from 'node:path';

export type ShellKind = 'zsh' | 'bash' | 'fish' | 'powershell' | 'unknown';

export interface ShellInfo {
  kind: ShellKind;
  rcFile: string | null;
}

/**
 * $SHELL is a Unix convention — PowerShell/cmd.exe never set it, so on
 * win32 we skip straight to PowerShell's default profile path rather than
 * looking for it. cmd.exe has no persistent function/alias mechanism worth
 * targeting (AutoRun + doskey macros are a much obscurer setup), so it's
 * left as `unknown` rather than guessed at.
 */
export function detectShell(
  shellEnv: string | undefined = process.env.SHELL,
  platform: NodeJS.Platform = process.platform
): ShellInfo {
  const home = os.homedir();

  let kind: ShellKind = 'unknown';
  let rcFile: string | null = null;

  if (platform === 'win32') {
    kind = 'powershell';
    // PowerShell 7+ (pwsh) default `$PROFILE` location. Windows PowerShell
    // 5.1 uses .../WindowsPowerShell/... instead — link-shell's output
    // notes this so a 5.1-only user can copy the block over manually.
    rcFile = path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
  } else {
    const name = shellEnv ? path.basename(shellEnv) : '';
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
  if (kind === 'powershell') {
    // Assigning $env:CLAUDE_CONFIG_DIR persists for the rest of the shell
    // session, not just this call — save/restore keeps it scoped to one
    // invocation, matching the bash functions' `VAR=val cmd` semantics.
    // Getting this wrong would mean one profile switch silently sticks for
    // every later command in the terminal, the exact failure mode this
    // tool exists to prevent.
    return (
      `function ${funcName} {\n` +
      `    $prevConfigDir = $env:CLAUDE_CONFIG_DIR\n` +
      `    $env:CLAUDE_CONFIG_DIR = "${configDir}"\n` +
      `    try { claude @args } finally { $env:CLAUDE_CONFIG_DIR = $prevConfigDir }\n` +
      `}`
    );
  }
  // zsh / bash
  return `${funcName}() {\n  CLAUDE_CONFIG_DIR="${configDir}" claude "$@"\n}`;
}
