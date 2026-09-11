# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `setup`, `add`, `list`, `run`, `link-shell`, `remove` commands.
- Shared state store (`projects/`, `sessions/`, `tasks/`, `plans/`, `file-history/`, `history.jsonl`, `skills/`, `plugins/`, `mcp-servers/`, `settings.json`) symlinked per profile, with per-profile auth files kept private.
- macOS Keychain credential swap so each profile has its own isolated OAuth token.
- Capture/restore of the `oauthAccount` identity field in the shared `$HOME/.claude.json`.
- Linux support (file-based auth, no Keychain swap needed).
- `list` reports symlink health per profile (ok / missing / broken / target-missing).
- LICENSE (MIT), CONTRIBUTING.md, CODE_OF_CONDUCT.md, and GitHub issue/PR templates.
- `--dry-run` on `setup` and `remove`.

### Changed

- Dropped CI and official Windows support to keep scope to macOS/Linux for now. Windows-specific code (junctions, hardlink fallback, PowerShell integration) is still in the codebase but untested and unmaintained — best-effort only.

### Fixed

- Junction reparse-point paths on Windows carry a trailing separator that broke symlink health/idempotency comparisons; normalized before comparing (moot while Windows isn't tested in CI, but correct regardless).

### Known limitations

- Windows isn't officially supported (see README's Cross-platform status section).
- Concurrent profile runs can interleave writes to the shared `history.jsonl` (small, append-only — not file-locked).
