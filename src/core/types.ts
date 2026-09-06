export interface ProfileInfo {
  name: string;
  path: string;
  isDefault: boolean;
  hasAuth: boolean;
}

export interface SymlinkHealth {
  entry: string;
  linkPath: string;
  status: 'ok' | 'missing' | 'broken' | 'not-a-symlink' | 'target-missing';
  detail?: string;
}

export interface ClaudeMultiState {
  defaultProfile?: string;
  primaryAdopted: boolean;
}

export type Platform = 'darwin' | 'linux' | 'win32';

/**
 * Storage for the Claude Code OAuth credential, isolated per profile.
 * Implementations are platform-specific because Claude Code itself stores
 * the token differently per OS (see credential-store.ts for why).
 */
export interface CredentialStore {
  /** Save whatever credential Claude Code is currently using into the profile. */
  capture(profileName: string, profileDir: string): Promise<void>;
  /** Load the profile's saved credential so Claude Code will use it on next run. */
  restore(profileName: string, profileDir: string): Promise<void>;
  /** True if this profile has ever captured a credential. */
  hasCredential(profileDir: string): Promise<boolean>;
}
