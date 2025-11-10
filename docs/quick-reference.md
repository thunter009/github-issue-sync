# Quick Reference - GitHub Issue Sync

## Essential Commands

### Development
```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode
npm run clean      # Remove dist/
npm link           # Install globally for testing
npm unlink         # Remove global link
```

### Sync Commands
```bash
github-issue-sync status   # Dry run - see what would change
github-issue-sync sync     # Full bidirectional sync
github-issue-sync push     # Local → GitHub only
github-issue-sync pull     # GitHub → local only
```

### Environment Setup
```bash
# Create .env.local file
echo "GITHUB_TOKEN=ghp_your_token" > .env.local
echo "GITHUB_REPO=owner/repo" >> .env.local

# Or export directly
export GITHUB_TOKEN=ghp_your_token
export GITHUB_REPO=owner/repo
```

## Key Files & Locations

| File/Dir | Purpose |
|----------|---------|
| `src/cli.ts` | CLI entry point |
| `src/lib/sync-engine.ts` | Core sync orchestration |
| `src/lib/conflict-resolver.ts` | Interactive conflict UI |
| `.sync-state.json` | Tracks sync state (auto-generated) |
| `docs/tasks/active/` | Current tasks |
| `docs/tasks/backlog/` | Future tasks |
| `docs/tasks/completed/` | Done tasks |

## Common Fixes

### "GITHUB_TOKEN not set"
```bash
# Check if token exists
echo $GITHUB_TOKEN

# Set in .env.local
echo "GITHUB_TOKEN=ghp_..." > .env.local
```

### "Missing required frontmatter"
Required fields: `created_utc`, `reporter`, `title`, `severity`, `priority`, `component`, `labels`, `status`

### "Issue doesn't exist on GitHub"
Tool doesn't create new issues yet. Create manually on GitHub first.

### "Resource not accessible"
Token needs `repo` scope. Get new token: https://github.com/settings/tokens/new

### TypeScript build errors
```bash
npm run clean
npm install
npm run build
```

### Conflict during sync
- Choose: `use local`, `use remote`, or `skip`
- Use `skip all` for multiple conflicts

## Task File Format

```markdown
---
created_utc: '2025-10-30T12:00:00Z'
reporter: yourname
title: '[#001] Task title'
severity: P1
priority: high
type: feature
component: [backend, api]
labels: [enhancement]
assignee: githubusername
status: active
---

# Task content
```

## Label Color Scheme

| Prefix | Colors | Example |
|--------|--------|---------|
| `priority:` | Red shades | `priority:blocker` |
| `severity:` | Orange shades | `severity:P0` |
| `status:` | Blue shades | `status:active` |
| `type:` | Green shades | `type:feature` |
| `component:` | Purple shades | `component:backend` |

## API Rate Limits

- Requests chunked in groups of 10
- Label caching reduces API calls
- If hit limit, wait 60 minutes

## Useful Links

- [GitHub Token Settings](https://github.com/settings/tokens)
- [Octokit Docs](https://octokit.github.io/rest.js)
- [Commander.js Docs](https://github.com/tj/commander.js)
- [Gray Matter Docs](https://github.com/jonschlinkert/gray-matter)