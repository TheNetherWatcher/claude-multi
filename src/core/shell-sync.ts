import { detectShell, renderProfileBinding } from '../platform/shell.js';
import { upsertShellBlock } from '../utils/shell-block.js';
import { listProfiles, profileDir } from './profile-manager.js';

/**
 * Regenerate the whole claude-multi shell block from the current profile
 * list. Called by both `link-shell` (explicit) and `remove` (implicit
 * cleanup) so the block never drifts from what profiles actually exist —
 * no separate "delete just this one alias" logic to keep in sync.
 */
export async function syncShellAliases(): Promise<{ rcFile: string; profileCount: number } | null> {
  const { kind, rcFile } = detectShell();
  if (!rcFile) return null;

  const profiles = await listProfiles();
  const bindings = profiles
    .sort()
    .map((name) => renderProfileBinding(kind, name, profileDir(name)));

  const body =
    bindings.length > 0
      ? bindings.join('\n\n')
      : '# no claude-multi profiles configured yet — run `claude-multi add <name>`';

  await upsertShellBlock(rcFile, body);
  return { rcFile, profileCount: profiles.length };
}
