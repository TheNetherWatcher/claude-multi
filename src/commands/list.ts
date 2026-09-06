import path from 'node:path';
import pc from 'picocolors';
import { listProfiles, getProfileInfo, checkProfileHealth, profileDir } from '../core/profile-manager.js';
import { readState } from '../core/state.js';
import { log } from '../utils/logger.js';

export async function listCommand(): Promise<void> {
  const profiles = await listProfiles();
  if (profiles.length === 0) {
    log.info('No profiles yet. Run `claude-multi setup` or `claude-multi add <name>`.');
    return;
  }

  const state = await readState();
  const activeEnvDir = process.env.CLAUDE_CONFIG_DIR
    ? path.resolve(process.env.CLAUDE_CONFIG_DIR)
    : undefined;

  for (const name of profiles.sort()) {
    const info = await getProfileInfo(name, state.defaultProfile);
    const health = await checkProfileHealth(name);
    const broken = health.filter((h) => h.status !== 'ok');

    const isActive = activeEnvDir ? activeEnvDir === path.resolve(profileDir(name)) : false;
    const markers = [
      info.isDefault ? pc.cyan('[default]') : '',
      isActive ? pc.green('[active]') : '',
      info.hasAuth ? '' : pc.yellow('[not logged in]'),
    ]
      .filter(Boolean)
      .join(' ');

    const healthLabel =
      broken.length === 0 ? pc.green('links ok') : pc.red(`${broken.length} broken link(s)`);

    log.info(`${pc.bold(name)}  ${markers}  ${healthLabel}`);
    if (broken.length > 0) {
      for (const b of broken) {
        log.dim(`    ${b.entry}: ${b.status}${b.detail ? ` (${b.detail})` : ''}`);
      }
    }
  }
}
