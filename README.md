# claude-multi

Switch between multiple Claude Code accounts without losing session history, transcripts, or context.

Rate limits in `@anthropic-ai/claude-code` are tied to the logged-in account. When you hit one, switching accounts the naive way (swapping `~/.claude` around) loses every transcript, project, and in-flight session. `claude-multi` keeps a single shared history store and gives each account its own isolated auth, so `claude --continue` works no matter which account you're on.

## How it works

Claude Code splits its state into two categories:

| Category | Files | Account-specific? |
|---|---|---|
| Auth | `config.json`, `.credentials.json` (Linux), `policy-limits.json`, `mcp-needs-auth-cache.json`, and (macOS only) a Keychain entry | Yes |
| Everything else | `projects/`, `sessions/`, `tasks/`, `plans/`, `file-history/`, `history.jsonl`, `skills/`, `plugins/`, `mcp-servers/`, `settings.json` | No |

`claude-multi` puts each account's auth files in its own directory (`~/.claude-multi/profiles/<name>`) and symlinks everything else back to one shared store (`~/.claude-multi/shared`). Point `CLAUDE_CONFIG_DIR` at a profile and Claude Code sees its own account plus your full shared history.

**The macOS catch:** Claude Code stores its OAuth token in the system Keychain under a fixed service name, not inside `$CLAUDE_CONFIG_DIR`. `CLAUDE_CONFIG_DIR` alone does nothing for auth isolation there — every profile would read the same Keychain entry. `claude-multi` handles this by keeping a private copy of each profile's Keychain secret and swapping it into the shared entry immediately before/after each `claude` invocation. On Linux, the token is just a file inside `CLAUDE_CONFIG_DIR`, so no swap is needed. Windows Credential Manager isolation isn't implemented yet — flagged, not faked.

## Install

```bash
npm install -g claude-multi
# or, without installing:
npx claude-multi setup
```

## Quickstart

```bash
# Adopt your existing ~/.claude as the "primary" profile
claude-multi setup

# Add another account
claude-multi add work
# -> creates ~/.claude-multi/profiles/work, offers to launch `claude` for /login

# Use it
claude-multi run work --continue

# See what you've got
claude-multi list

# Optional: shell aliases (claude-work, claude-personal, ...)
claude-multi link-shell
source ~/.zshrc

# Clean up (shared history untouched)
claude-multi remove work
```

## Commands

- `claude-multi setup [--dry-run]` — interactive; adopts an existing `~/.claude` as the `primary` profile and moves its shared data into `~/.claude-multi/shared`. `--dry-run` prints the adoption plan (what would move where) without touching disk.
- `claude-multi add <name>` — creates a profile, links shared state, offers to launch `claude` for `/login`.
- `claude-multi list` — shows profiles, which is active/default, and symlink health.
- `claude-multi run <name> [claude-args...]` — spawns `claude` under that profile, args forwarded as-is (`claude-multi run work --continue`).
- `claude-multi link-shell` — idempotently writes `claude-<name>` shell functions into `~/.zshrc` / `~/.bashrc` / `~/.config/fish/config.fish`, inside a marked `# >>> claude-multi >>>` block.
- `claude-multi remove <name> [--dry-run]` — deletes a profile's auth/links and its shell alias. Shared history is never touched (`rm` on a directory of symlinks doesn't follow them). `--dry-run` shows what would be removed without deleting anything.

## Project layout

```
~/.claude-multi/
  profiles/
    primary/        # real auth files + symlinks to ../../shared/*
    work/           # same
  shared/
    projects/ sessions/ tasks/ plans/ file-history/
    history.jsonl skills/ plugins/ mcp-servers/ settings.json
  state.json
```

## Development

```bash
npm install
npm run dev        # run against src/ via tsx, no build step
npm run build       # compile to dist/
npm test            # vitest
```

## Cross-platform status

| Platform | Symlinks/shared state | Auth isolation | Shell integration |
|---|---|---|---|
| macOS | full (real symlinks) | full (Keychain swap) | zsh, bash, fish |
| Linux/WSL | full (real symlinks) | full (file-based, no swap needed) | zsh, bash, fish |
| Windows | full (junctions for dirs, hardlink fallback for files) | **not yet** — see below | PowerShell (`$PROFILE`) |

Windows directories use junctions (no admin/Developer Mode required); files
(`history.jsonl`, `settings.json`) fall back to a hardlink when a real
symlink isn't permitted, which needs no special privilege.

**Why Windows auth isolation isn't built yet:** macOS has a documented CLI
(`security`) for reading/writing a Keychain item, which is how the
credential swap in `core/credential-store.ts` works. Windows Credential
Manager has no equivalent — there's no clean "read this stored password
back out" CLI, so building this correctly needs an empirical check on a
real Windows box of what Claude Code actually does there (same way the
macOS Keychain behavior and the `$HOME/.claude.json` `oauthAccount` leak
were confirmed by inspection rather than assumed). CI (`.github/workflows/test.yml`)
runs the test suite on `windows-latest` so the symlink/hardlink and
PowerShell-profile logic get verified on a real Windows runner on every
push — auth isolation is the one piece still open, tracked as future work.

## Known limitations

- Windows: no Credential Manager isolation yet (see above); everything else works.
- Running two profiles concurrently can interleave writes to the shared `history.jsonl`. Fine in practice (small, append-only writes) but not file-locked — avoid it if you can.
