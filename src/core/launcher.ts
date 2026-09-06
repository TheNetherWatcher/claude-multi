import { execa } from 'execa';
import { getCredentialStore } from './credential-store.js';
import { captureGlobalState, restoreGlobalState } from './global-state.js';

/**
 * Spawn `claude` scoped to a single profile, with full auth isolation.
 *
 * Two independent things get swapped around the spawn, both for the same
 * reason: Claude Code keeps some account-identity state outside
 * $CLAUDE_CONFIG_DIR, so pointing CLAUDE_CONFIG_DIR at a profile alone
 * doesn't isolate it.
 *   - CredentialStore: the OAuth token (Keychain on macOS, a file on Linux).
 *   - global-state: the `oauthAccount` field inside the always-shared
 *     $HOME/.claude.json.
 * restore() before launch puts this profile's identity in place; capture()
 * after exit persists anything Claude Code refreshed mid-session (e.g.
 * right after /login) — skipping that would silently revert to a stale
 * value on this profile's next run.
 */
export async function launchClaudeForProfile(
  profileName: string,
  profileDir: string,
  args: string[]
): Promise<number> {
  const credentialStore = getCredentialStore();
  await credentialStore.restore(profileName, profileDir);
  await restoreGlobalState(profileDir);

  let exitCode = 0;
  try {
    const result = await execa('claude', args, {
      stdio: 'inherit',
      env: { ...process.env, CLAUDE_CONFIG_DIR: profileDir },
      reject: false,
    });
    if (result.failed && result.exitCode === undefined) {
      // Spawn itself failed (e.g. `claude` not on PATH), not a nonzero exit.
      throw new Error(result.shortMessage ?? 'failed to spawn `claude`');
    }
    exitCode = result.exitCode ?? 1;
  } finally {
    await credentialStore.capture(profileName, profileDir);
    await captureGlobalState(profileDir);
  }

  return exitCode;
}
