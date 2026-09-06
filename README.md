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

- `claude-multi setup` — interactive; adopts an existing `~/.claude` as the `primary` profile and moves its shared data into `~/.claude-multi/shared`.
- `claude-multi add <name>` — creates a profile, links shared state, offers to launch `claude` for `/login`.
- `claude-multi list` — shows profiles, which is active/default, and symlink health.
- `claude-multi run <name> [claude-args...]` — spawns `claude` under that profile, args forwarded as-is (`claude-multi run work --continue`).
- `claude-multi link-shell` — idempotently writes `claude-<name>` shell functions into `~/.zshrc` / `~/.bashrc` / `~/.config/fish/config.fish`, inside a marked `# >>> claude-multi >>>` block.
- `claude-multi remove <name>` — deletes a profile's auth/links and its shell alias. Shared history is never touched (`rm` on a directory of symlinks doesn't follow them).

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

## Known limitations

- Windows: no Credential Manager isolation yet; profiles/symlinks work (via junctions) but auth won't actually separate.
- Running two profiles concurrently can interleave writes to the shared `history.jsonl`. Fine in practice (small, append-only writes) but not file-locked — avoid it if you can.
