import { syncShellAliases } from '../core/shell-sync.js';
import { detectShell } from '../platform/shell.js';
import { log } from '../utils/logger.js';

export async function linkShellCommand(): Promise<void> {
  const { kind, rcFile } = detectShell();
  if (!rcFile) {
    log.error(
      `Couldn't detect a supported shell from $SHELL. Supported: zsh, bash, fish.`
    );
    process.exitCode = 1;
    return;
  }

  const result = await syncShellAliases();
  if (!result) return;

  log.success(`Wrote ${result.profileCount} profile alias(es) to ${result.rcFile} (${kind}).`);
  log.info(`Run \`source ${result.rcFile}\` or restart your shell to use them.`);
}
