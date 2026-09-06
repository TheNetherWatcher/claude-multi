import { profileExists, profileDir } from '../core/profile-manager.js';
import { launchClaudeForProfile } from '../core/launcher.js';
import { log } from '../utils/logger.js';

export async function runCommand(name: string, claudeArgs: string[]): Promise<void> {
  if (!(await profileExists(name))) {
    log.error(`Profile "${name}" doesn't exist. Run \`claude-multi add ${name}\` first.`);
    process.exitCode = 1;
    return;
  }

  const dir = profileDir(name);
  process.exitCode = await launchClaudeForProfile(name, dir, claudeArgs);
}
