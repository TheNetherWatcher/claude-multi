import os from 'node:os';
import path from 'node:path';

/** Root of claude-multi's own state, separate from any Claude Code config dir. */
export const CLAUDE_MULTI_HOME =
  process.env.CLAUDE_MULTI_HOME ?? path.join(os.homedir(), '.claude-multi');

export const PROFILES_DIR = path.join(CLAUDE_MULTI_HOME, 'profiles');
export const SHARED_DIR = path.join(CLAUDE_MULTI_HOME, 'shared');
export const STATE_FILE = path.join(CLAUDE_MULTI_HOME, 'state.json');

/** Default location Claude Code itself uses when CLAUDE_CONFIG_DIR is unset. */
export const DEFAULT_CLAUDE_CONFIG_DIR = path.join(os.homedir(), '.claude');

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
