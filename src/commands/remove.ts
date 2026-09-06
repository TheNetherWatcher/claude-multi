import * as p from '@clack/prompts';
import { profileExists, removeProfile } from '../core/profile-manager.js';
import { syncShellAliases } from '../core/shell-sync.js';
import { readState, writeState } from '../core/state.js';
import { log } from '../utils/logger.js';

export async function removeCommand(name: string, opts: { yes?: boolean } = {}): Promise<void> {
  if (!(await profileExists(name))) {
    log.error(`Profile "${name}" doesn't exist.`);
    process.exitCode = 1;
    return;
  }

  if (!opts.yes) {
    const confirmed = await p.confirm({
      message: `Remove profile "${name}"? Shared history is untouched — only this profile's ` +
        `auth files and links are deleted.`,
    });
    if (p.isCancel(confirmed) || !confirmed) {
      log.info('Cancelled.');
      return;
    }
  }

  await removeProfile(name);

  const state = await readState();
  if (state.defaultProfile === name) {
    await writeState({ ...state, defaultProfile: undefined });
  }

  const shellResult = await syncShellAliases();
  log.success(`Removed profile "${name}".`);
  if (shellResult) {
    log.info(`Updated shell aliases in ${shellResult.rcFile}.`);
  }
}
