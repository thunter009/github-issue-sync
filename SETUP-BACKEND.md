# Setup for notice-wise-backend

Quick guide to use github-issue-sync in your Python backend project.

## 1. Link the Package (Development)

Since the package isn't published to npm yet, use npm link:

```bash
# Already done - package is globally linked
# To verify:
which github-issue-sync
# Should show: /usr/local/bin/github-issue-sync (or similar)
```

## 2. Set Up Backend Project

```bash
cd /Users/thom/10-19_projects/notice-wise-backend

# Create environment file
cat >> .env << 'EOF'

# GitHub Issue Sync
GITHUB_TOKEN=ghp_your_token_here
GITHUB_REPO=thunter009/notice-wise-backend
EOF

# Add to .gitignore (if not already there)
echo ".sync-state.json" >> .gitignore
```

## 3. Create Task Structure

```bash
# Create task directories if they don't exist
mkdir -p docs/tasks/{backlog,active,completed}
```

## 4. Test It

```bash
# Check status (dry-run)
github-issue-sync status

# If you get environment variable errors, try:
export GITHUB_TOKEN=ghp_your_token_here
export GITHUB_REPO=thunter009/notice-wise-backend
github-issue-sync status

# Run sync
github-issue-sync sync
```

## 5. Optional: Add npm Scripts (for convenience)

Even in a Python project, you can have a minimal `package.json` for tooling:

```bash
cat > package.json << 'EOF'
{
  "name": "notice-wise-backend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "sync": "github-issue-sync sync",
    "sync:status": "github-issue-sync status",
    "sync:push": "github-issue-sync push",
    "sync:pull": "github-issue-sync pull"
  },
  "devDependencies": {
    "@noticewise/github-issue-sync": "link:../github-issue-sync"
  }
}
EOF

# Install (creates symlink)
npm install

# Now you can use:
npm run sync:status
npm run sync
```

## 6. Update .gitignore (Backend)

```bash
cat >> .gitignore << 'EOF'

# GitHub sync
.sync-state.json

# Node.js (if using npm scripts)
node_modules/
package-lock.json
EOF
```

## Task File Format

Create tasks in `docs/tasks/backlog/NNN-task-name.md`:

```markdown
---
created_utc: '2025-10-30T12:00:00Z'
reporter: thom
title: '[#001] Task title here'
severity: P1
priority: high
type: feature
component:
  - backend
  - api
labels:
  - enhancement
assignee: thom
status: backlog
---

# Task content

Task description and details...
```

## Troubleshooting

### "Command not found: github-issue-sync"

```bash
# Re-link the package
cd ~/10-19_projects/github-issue-sync
npm link
```

### "GITHUB_TOKEN not set"

```bash
# Export temporarily
export GITHUB_TOKEN=ghp_your_token_here
export GITHUB_REPO=thunter009/notice-wise-backend

# Or add to .env and source it
source .env
```

### "Missing required frontmatter fields"

Check that your markdown files have all required fields:
- `created_utc`, `reporter`, `title`
- `severity`, `priority`, `component`
- `labels`, `status`

## Publishing (Future)

To publish to npm for easier installation:

```bash
cd ~/10-19_projects/github-issue-sync

# Login to npm
npm login

# Publish (first time)
npm publish --access public

# Then in backend, install normally:
npm install @noticewise/github-issue-sync
```

## Uninstalling

```bash
# Unlink globally
npm unlink -g @noticewise/github-issue-sync

# In backend (if using package.json)
npm uninstall @noticewise/github-issue-sync
```
