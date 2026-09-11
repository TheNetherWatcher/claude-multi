# Contributing

## Setup

```bash
git clone https://github.com/TheNetherWatcher/claude-multi.git
cd claude-multi
npm install
```

## Dev loop

```bash
npm run dev          # run the CLI from source (tsx, no build step)
npm run build        # compile to dist/
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:watch   # vitest watch mode
```

## Project layout

- `src/commands/` — one file per CLI subcommand (`add`, `remove`, `run`, `list`, `link-shell`, `setup`)
- `src/core/` — profile/state management, symlinking, credential store, launcher
- `src/platform/` — OS-specific shell behavior
- `tests/unit/` and `tests/integration/` — vitest

## Before opening a PR

- `npm run typecheck` and `npm test` must pass.
- Add or update tests for any behavior change under `tests/`.
- Keep platform-specific code (macOS Keychain, Linux, Windows) behind the existing `src/platform` abstractions rather than inline `process.platform` checks scattered through commands.
- If you touch symlink/credential handling, call out the macOS Keychain swap and Windows fallback behavior explicitly in the PR description — these are the parts most likely to have platform-specific edge cases.

## Reporting bugs / requesting features

Open an issue at https://github.com/TheNetherWatcher/claude-multi/issues. Include your OS, Node version, and `claude-multi list` output where relevant.
