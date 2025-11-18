# GitHub Issue Sync

**Bidirectional sync between local markdown task files and GitHub issues with interactive conflict resolution.**

## Quick Start

```bash
# Install and link for development
pnpm install
pnpm link --global

# Set up environment
export GITHUB_TOKEN=your_token_here
export GITHUB_REPO=owner/repo

# Run sync
github-issue-sync sync
```

## Tech Stack

- Node.js 18+ & TypeScript
- Octokit (GitHub API)
- Commander (CLI framework)
- Gray-matter (YAML frontmatter parsing)

## Current Status

- ✅ Bidirectional sync with conflict detection
- ✅ Interactive conflict resolution
- ✅ Label management with color schemes
- 🚧 Test suite implementation
- 📋 npm registry publication
- 📋 GitHub Actions integration

## Documentation

📖 **[Full Documentation](docs/start-here.md)** - Complete setup and development guide

📋 **[Current Tasks](docs/tasks/active/)** - What's being worked on now

🔧 **[Quick Reference](docs/quick-reference.md)** - Commands and common fixes

### 2. Set Up Task Structure

Create task files in `docs/tasks/` with this structure:

```
your-project/
├── docs/
│   └── tasks/
│       ├── backlog/
│       │   └── 001-task-name.md
│       ├── active/
│       │   └── 002-another-task.md
│       └── completed/
│           └── 003-done-task.md
├── .env.local
└── .sync-state.json (auto-generated)
```

### 3. Markdown Format

Each task file needs YAML frontmatter:

```markdown
---
created_utc: '2025-10-30T12:00:00Z'
reporter: yourname
title: '[#001] Task title here'
severity: P1
priority: high
type: feature
component:
  - backend
  - api
labels:
  - enhancement
assignee: githubusername
status: active
---

# Task content here

Task description and details...
```

### 4. Run Sync Commands

```bash
# Check what would sync (dry-run)
github-issue-sync status

# Full bidirectional sync with conflict resolution
github-issue-sync sync

# Push local changes to GitHub (one-way)
github-issue-sync push

# Pull GitHub changes to local (one-way)
github-issue-sync pull
```

## Commands

### `sync` (default)

Bidirectional sync with interactive conflict resolution.

```bash
github-issue-sync sync
```

**When conflicts occur:**
- Shows side-by-side diff
- Choose: use local, use remote, or skip
- Handles multiple conflicts with "skip all" option

**Orphaned files (deleted GitHub issues):**
- Local files referencing deleted GitHub issues are automatically detected and skipped
- Warning shown with list of orphaned files
- Use `sync --clean` to interactively remove orphaned files

**Options:**
- `--create` - Create new GitHub issues from files without issue numbers
- `--clean` - Interactively clean up orphaned local files where GitHub issues were deleted
- `--file <path>` - Sync only the specified file
- `--issue <number>` - Sync only the specified issue number

```bash
# Create new issues and sync
github-issue-sync sync --create

# Clean up orphaned files
github-issue-sync sync --clean

# Sync a single file
github-issue-sync sync --file docs/tasks/active/002-feature.md

# Sync a single issue (creates local file if doesn't exist)
github-issue-sync sync --issue 123
```

### `status`

Dry-run that shows what would change without syncing.

```bash
github-issue-sync status

# Check status of a single file
github-issue-sync status --file docs/tasks/active/002-feature.md

# Check status of a single issue
github-issue-sync status --issue 123
```

### `push`

One-way sync: local → GitHub (overwrites GitHub).

```bash
github-issue-sync push

# Push a single file to GitHub
github-issue-sync push --file docs/tasks/active/002-feature.md

# Push a single issue to GitHub
github-issue-sync push --issue 123
```

### `pull`

One-way sync: GitHub → local (overwrites local).

```bash
github-issue-sync pull

# Pull a single file from GitHub
github-issue-sync pull --file docs/tasks/active/002-feature.md

# Pull a single issue from GitHub (creates local file if doesn't exist)
github-issue-sync pull --issue 123
```

## Label Colors

Consistent, meaningful colors for grouped labels:

| Group | Colors | Example |
|-------|--------|---------|
| **Priority** | Red → Orange → Gray | `priority:blocker` 🔴 → `priority:low` ⚪ |
| **Severity** | Dark → Light Purple | `severity:P0` 🟣 → `severity:P3` 🟣 |
| **Status** | Gray → Blue → Green | `status:backlog` ⚪ → `status:completed` 🟢 |
| **Type** | Varied | `type:bug` 🔴, `type:feature` 🔵 |
| **Component** | Teal/Cyan Palette | `component:backend` 🔷 |

Labels are automatically created/updated with correct colors during sync.

## Frontmatter Fields

### Required Fields

- `created_utc` - ISO 8601 timestamp
- `reporter` - Person who created the task
- `title` - Task title (include issue number like `[#001]`)
- `severity` - `P0` | `P1` | `P2` | `P3`
- `priority` - `blocker` | `critical` | `high` | `medium` | `low`
- `component` - Array of component names
- `labels` - Array of additional labels
- `status` - `backlog` | `active` | `completed`

### Optional Fields

- `type` - `epic` | `feature` | `bug` | `enhancement`
- `assignee` - GitHub username
- `completed_utc` - ISO 8601 timestamp (for completed tasks)
- `parent_epic` - Parent epic identifier
- `epic_progress` - Progress string
- `commit` - Related commit hash
- `commit_url` - Related commit URL
- `relates_to` - Array of related issue numbers
- `due_date` - Due date string

## Programmatic Usage

```typescript
import {
  GitHubClient,
  MarkdownParser,
  FieldMapper,
  SyncEngine,
  ConflictResolver
} from '@noticewise/github-issue-sync';

const github = new GitHubClient(token, 'owner/repo');
const parser = new MarkdownParser('/path/to/project');
const mapper = new FieldMapper();
const engine = new SyncEngine(github, parser, mapper, '/path/to/project');

// Run sync
const result = await engine.sync();
console.log(`Pushed: ${result.pushed.length}`);
console.log(`Pulled: ${result.pulled.length}`);
console.log(`Conflicts: ${result.conflicts.length}`);
```

## Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GITHUB_TOKEN` | Yes | Personal access token | `ghp_abc123...` |
| `GITHUB_REPO` | Yes | Repository (owner/name) | `thunter009/my-repo` |

### Directory Structure

The tool looks for tasks in `docs/tasks/` by default:

- `docs/tasks/backlog/` - Backlog tasks
- `docs/tasks/active/` - Active/in-progress tasks
- `docs/tasks/completed/` - Completed tasks

Files must follow naming pattern: `NNN-slug.md` where `NNN` is the issue number.

## How It Works

1. **Discovery** - Scans `docs/tasks/` for markdown files
2. **Parse** - Extracts frontmatter and body content
3. **Fetch** - Gets corresponding GitHub issues
4. **Compare** - Detects changes using content hashing
5. **Conflict Detection** - Identifies files changed in both places
6. **Interactive Resolution** - Shows diffs, prompts for choice
7. **Sync** - Updates local files and GitHub issues
8. **Track State** - Saves hashes to `.sync-state.json`

## Troubleshooting

### "GITHUB_TOKEN not set"

```bash
# Add to .env.local
echo "GITHUB_TOKEN=ghp_your_token" >> .env.local
echo "GITHUB_REPO=owner/repo" >> .env.local
```

### "Missing required frontmatter fields"

Ensure your markdown files have all required frontmatter fields. Check the error message for which fields are missing.

### "Resource not accessible by personal access token"

Your token needs the `repo` scope. Create a new token at:
https://github.com/settings/tokens/new

### "Issue doesn't exist on GitHub"

The sync tool only updates existing issues. It doesn't create new issues (yet). Manually create the issue on GitHub first.

## Development

```bash
# Clone repo
git clone https://github.com/thunter009/github-issue-sync.git
cd github-issue-sync

# Install dependencies
npm install

# Build
npm run build

# Test locally with npm link
npm link
```

### Pre-Commit Hooks

Tests automatically run before each commit via husky + lint-staged. Only tests related to changed files are executed for faster feedback. To bypass:

```bash
git commit --no-verify  # Skip pre-commit hook
```

To disable hooks entirely, set `HUSKY=0`:

```bash
HUSKY=0 git commit -m "message"
```

## License

MIT © Tom Hunter

## Contributing

Issues and PRs welcome! Please follow conventional commits.

## Related

- Built for [NoticeWise](https://github.com/thunter009/notice-wise-ui-k1)
- Uses [@octokit/rest](https://github.com/octokit/rest.js) for GitHub API
- Inspired by [Linear's GitHub sync](https://linear.app/docs/github)
