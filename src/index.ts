#!/usr/bin/env node
import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { runCommand } from './commands/run.js';
import { linkShellCommand } from './commands/link-shell.js';
import { removeCommand } from './commands/remove.js';
import { log } from './utils/logger.js';

// `run` forwards every trailing argument verbatim to `claude` (flags
// included, e.g. `claude-multi run work --continue`). Commander's own
// option parser would otherwise try to interpret those flags as its own,
// so `run` is special-cased before anything reaches commander.
const argv = process.argv;
if (argv[2] === 'run') {
  const profileName = argv[3];
  if (!profileName) {
    log.error('Usage: claude-multi run <profile-name> [claude-args...]');
    process.exit(1);
  }
  const claudeArgs = argv.slice(4);
  runCommand(profileName, claudeArgs).catch((err) => {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
} else {
  const program = new Command();

  program
    .name('claude-multi')
    .description('Manage and switch between multiple Claude Code accounts without losing session history.')
    .version('0.1.0');

  program
    .command('setup')
    .description('Interactive setup: adopt an existing ~/.claude as the "primary" profile.')
    .option('--dry-run', 'show what would happen without changing anything')
    .action((opts) => setupCommand({ dryRun: opts.dryRun }));

  program
    .command('add <profile-name>')
    .description('Create a new profile, linked to shared history, with its own isolated auth.')
    .option('--no-launch', 'skip the prompt to launch Claude Code for /login')
    .action((name, opts) => addCommand(name, { launch: opts.launch === false ? false : undefined }));

  program
    .command('list')
    .description('List configured profiles and check symlink health.')
    .action(listCommand);

  program
    .command('run <profile-name>')
    .description('Run Claude Code under a specific profile (trailing args passed through).')
    .allowUnknownOption()
    .action(() => {
      // Unreachable: handled above before commander parses. Kept so
      // `claude-multi run --help` still shows useful usage.
    });

  program
    .command('link-shell')
    .description('Install/refresh shell alias functions (claude-<profile>) idempotently.')
    .action(linkShellCommand);

  program
    .command('remove <profile-name>')
    .description("Remove a profile's auth/links without touching shared history.")
    .option('-y, --yes', 'skip confirmation prompt')
    .option('--dry-run', 'show what would happen without changing anything')
    .action((name, opts) => removeCommand(name, { yes: opts.yes, dryRun: opts.dryRun }));

  program.parseAsync(process.argv).catch((err) => {
    log.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
