import os from 'node:os';
import path from 'node:path';

/** Root of claude-multi's own state, separate from any Claude Code config dir. */
export const CLAUDE_MULTI_HOME =
  process.env.CLAUDE_MULTI_HOME ?? path.join(os.homedir(), '.claude-multi');

export const PROFILES_DIR = path.join(CLAUDE_MULTI_HOME, 'profiles');
export const SHARED_DIR = path.join(CLAUDE_MULTI_HOME, 'shared');
export const STATE_FILE = path.join(CLAUDE_MULTI_HOME, 'state.json');

/**
 * Default location Claude Code itself uses when CLAUDE_CONFIG_DIR is unset.
 * Overridable for tests — `setup` does an `fs.rename` on this path, so it
 * must never resolve to a real ~/.claude by accident in an automated run.
 */
export const DEFAULT_CLAUDE_CONFIG_DIR =
  process.env.CLAUDE_MULTI_DEFAULT_CONFIG_DIR ?? path.join(os.homedir(), '.claude');

/**
 * Entries symlinked from each profile back into the shared store.
 * These hold session/transcript/tool state, not account identity.
 */
export const SHARED_ENTRIES = [
  'projects',
  'sessions',
  'tasks',
  'plans',
  'file-history',
  'history.jsonl',
  'skills',
  'plugins',
  'mcp-servers',
  'settings.json',
] as const;

/** Which SHARED_ENTRIES are directories vs. plain files — single source of truth. */
export const SHARED_DIR_ENTRIES = new Set<string>([
  'projects',
  'sessions',
  'tasks',
  'plans',
  'file-history',
  'skills',
  'plugins',
  'mcp-servers',
]);

/**
 * Entries that must stay private per-profile: account identity, tokens,
 * or per-account gates. Never symlinked.
 *
 * `.credentials.json` is the Linux/WSL file-based OAuth store. On macOS the
 * OAuth token instead lives in the system Keychain (see core/credential-store.ts) —
 * config.json itself never contains the token there.
 */
export const AUTH_ENTRIES = [
  'config.json',
  'policy-limits.json',
  'mcp-needs-auth-cache.json',
  '.credentials.json',
] as const;

export const KEYCHAIN_SERVICE = 'Claude Code-credentials';

export const SHELL_BLOCK_START = '# >>> claude-multi >>>';
export const SHELL_BLOCK_END = '# <<< claude-multi <<<';

/**
 * Claude Code keeps a SECOND state file fixed at $HOME/.claude.json —
 * outside $CLAUDE_CONFIG_DIR entirely, so pointing CLAUDE_CONFIG_DIR at a
 * profile does not isolate it. Most of its content (project trust registry,
 * migration flags, machine id) is genuinely machine-global and fine to
 * share. A small number of fields are account identity and leak across
 * profiles unless explicitly captured/restored — see core/global-state.ts.
 *
 * Overridable via CLAUDE_MULTI_HOME_STATE_FILE so tests (and anyone
 * double-checking this in a throwaway sandbox) never touch the real file.
 */
export const HOME_STATE_FILE =
  process.env.CLAUDE_MULTI_HOME_STATE_FILE ?? path.join(os.homedir(), '.claude.json');

/** Account-identity fields inside HOME_STATE_FILE that must be captured/restored per profile. */
export const HOME_STATE_ACCOUNT_KEYS = ['oauthAccount', 'claudeCodeFirstTokenDate'] as const;
