import { execa } from 'execa';
import { getCredentialStore } from './credential-store.js';

/**
 * Spawn `claude` scoped to a single profile, with full auth isolation.
 *
 * The credential swap happens around the spawn rather than once at startup
 * because on macOS the Keychain holds one shared entry regardless of which
 * profile is "active" — restore() before launch makes sure the right
 * account's token is in place, capture() after exit persists any token
 * refresh Claude Code performed mid-session (otherwise the next `restore()`
 * for this profile would silently use a stale token).
 */
export async function launchClaudeForProfile(
  profileName: string,
  profileDir: string,
  args: string[]
): Promise<number> {
  const credentialStore = getCredentialStore();
  await credentialStore.restore(profileName, profileDir);

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
  }

  return exitCode;
}
