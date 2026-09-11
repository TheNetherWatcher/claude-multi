# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `setup`, `add`, `list`, `run`, `link-shell`, `remove` commands.
- Shared state store (`projects/`, `sessions/`, `tasks/`, `plans/`, `file-history/`, `history.jsonl`, `skills/`, `plugins/`, `mcp-servers/`, `settings.json`) symlinked per profile, with per-profile auth files kept private.
- macOS Keychain credential swap so each profile has its own isolated OAuth token.
- Capture/restore of the `oauthAccount` identity field in the shared `$HOME/.claude.json`.
- Cross-platform support: Linux (file-based auth, no swap needed), Windows (junctions for directories, hardlink fallback for files, PowerShell `$PROFILE` integration).
- CI matrix testing on Ubuntu, macOS, and Windows.
- `list` reports symlink health per profile (ok / missing / broken / target-missing).
- LICENSE (MIT), CONTRIBUTING.md, CODE_OF_CONDUCT.md, and GitHub issue/PR templates.

### Known limitations

- Windows: no Credential Manager isolation yet (see README's Cross-platform status section).
- Concurrent profile runs can interleave writes to the shared `history.jsonl` (small, append-only — not file-locked).
