# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

GitHub Issue Sync - Bidirectional sync between local markdown task files and GitHub issues with interactive conflict resolution. Built for the NoticeWise project.

## Commands

```bash
# Development
pnpm run build    # Compile TypeScript to dist/
pnpm run dev      # Watch mode - recompile on changes
pnpm run clean    # Remove dist/ directory

# Testing local changes
pnpm link --global  # Install globally for testing
github-issue-sync sync    # Test full sync
github-issue-sync status  # Dry run to see what would change
github-issue-sync sync --clean  # Clean up orphaned files (deleted GitHub issues)
github-issue-sync sync --create # Create new issues from unnumbered files

# Single file/issue sync (NEW)
github-issue-sync sync --file docs/tasks/active/002-feature.md  # Sync specific file
github-issue-sync sync --issue 123  # Sync specific issue
github-issue-sync pull --issue 789  # Pull issue from GitHub (creates file if needed)
github-issue-sync push --file docs/tasks/backlog/456-bug.md  # Push file to GitHub

# Authentication (choose one)
gh auth login             # Preferred: uses gh CLI keyring
GITHUB_TOKEN=<token>      # Fallback: env var for CI/CD

# Optional env var (auto-detected from git remote)
GITHUB_REPO=owner/repo    # Only if no git remote

# Pre-commit hooks
# Tests run automatically before commits
git commit --no-verify    # Bypass if needed
HUSKY=0 git commit -m "message"  # Disable hooks entirely
```

## Architecture

### Core Components

1. **Sync Engine** (`src/lib/sync-engine.ts`): Orchestrates bidirectional sync, manages conflict detection via content hashing, persists state in `.sync-state.json`

2. **Field Mapper** (`src/lib/field-mapper.ts`): Bidirectional conversion between markdown frontmatter and GitHub issue fields. Handles label prefixes (`priority:`, `severity:`, `component:`)

3. **Conflict Resolution** (`src/lib/conflict-resolver.ts`): Interactive UI for resolving conflicts when both local and remote have changed

4. **GitHub Client** (`src/lib/github-client.ts`): Wraps Octokit, manages label caching and color assignment

5. **Markdown Parser** (`src/lib/markdown-parser.ts`): Discovers task files in `docs/tasks/{backlog,active,completed}/`, parses YAML frontmatter

### Data Flow

1. Tasks stored as markdown files: `docs/tasks/{status}/NNN-slug.md`
2. Frontmatter maps to GitHub issue fields (title, labels, assignee, state)
3. Content hashing detects changes since last sync
4. Conflicts resolved interactively when both sides change
5. State tracked in `.sync-state.json` with hashes and timestamps

### Key Interfaces

- **TaskDocument**: Core data structure with frontmatter + body
- **TaskFrontmatter**: YAML fields (title, priority, severity, component, status, etc.)
- **SyncState**: Tracks localHash, remoteHash per issue

### Label Color Scheme

Labels auto-created with consistent colors:
- `priority:*` → shades of red
- `severity:*` → shades of orange
- `status:*` → shades of blue
- `type:*` → shades of green
- `component:*` → shades of purple

## Important Notes

- Files must follow pattern: `NNN-slug.md` where NNN is GitHub issue number
- Status determines directory: backlog/, active/, or completed/
- Metadata preserved in GitHub via HTML comments in issue body
- API requests chunked (10 at a time) for rate limiting
- Auth: tries `gh auth token` first, then GITHUB_TOKEN env var
- use pnpm for this repo instead of npm