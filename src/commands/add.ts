import * as p from '@clack/prompts';
import { isValidProfileName, profileExists, linkSharedEntries, profileDir } from '../core/profile-manager.js';
import { getCredentialStore } from '../core/credential-store.js';
import { launchClaudeForProfile } from '../core/launcher.js';
import { log } from '../utils/logger.js';

export async function addCommand(name: string, opts: { launch?: boolean } = {}): Promise<void> {
  if (!isValidProfileName(name)) {
    log.error(`Invalid profile name "${name}". Use letters, numbers, "-", "_" only.`);
    process.exitCode = 1;
    return;
  }

  if (await profileExists(name)) {
    log.error(`Profile "${name}" already exists.`);
    process.exitCode = 1;
    return;
  }

  await linkSharedEntries(name);
  const dir = profileDir(name);
  log.success(`Created profile "${name}" at ${dir}`);
  log.dim('Auth files (config.json, .credentials.json, etc.) stay private to this profile.');

  let shouldLaunch = opts.launch ?? false;
  if (opts.launch === undefined) {
    const answer = await p.confirm({
      message: `Launch Claude Code now under "${name}" to complete /login?`,
    });
    shouldLaunch = !p.isCancel(answer) && answer === true;
  }

  if (!shouldLaunch) {
    log.info(`When ready: claude-multi run ${name} -- /login  (or just \`claude-multi run ${name}\`)`);
    return;
  }

  const exitCode = await launchClaudeForProfile(name, dir, []);
  const store = getCredentialStore();
  if (await store.hasCredential(dir)) {
    log.success(`Captured credentials for profile "${name}".`);
  } else {
    log.warn(`No credentials captured yet — run \`claude-multi run ${name}\` and complete /login.`);
  }
  process.exitCode = exitCode;
}
