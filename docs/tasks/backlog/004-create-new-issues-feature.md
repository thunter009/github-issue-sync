---
created_utc: 2025-01-10T00:00:00.000Z
title: Create New Issues Feature
severity: P2
priority: medium
type: feature
component: []
labels: []
reporter: thunter009
status: backlog
assignee: unassigned
---
# Create New Issues Feature

## Summary

Currently the sync tool only updates existing GitHub issues. Add capability to create new issues from local markdown files that don't have an issue number yet. This would enable full workflow from local task creation to GitHub issue.

## Action Items

- [x] Design filename format for new tasks (use existing unnumbered files)
- [x] Update MarkdownParser to handle files without issue numbers
  - [x] Added `discoverNewTasks()` method
  - [x] Added `renameTask()` method
- [x] Add issue creation logic (using `gh` CLI instead of direct API)
- [x] Update SyncEngine to handle creation flow
  - [x] Create issue on GitHub via `gh issue create`
  - [x] Get assigned issue number from gh output
  - [x] Rename local file to include issue number
  - [x] Update sync state with issue metadata
- [x] Handle edge cases
  - [x] Failed creation rollback (file not renamed if gh fails)
  - [x] Duplicate filename detection before rename
  - [ ] Rate limiting (gh CLI handles this)
- [x] Add `--create` flag to CLI for explicit creation mode
- [x] Add standalone `create` command
- [ ] Update documentation with new workflow
- [ ] Add tests for creation logic

## Technical Details

**Proposed Workflow**:

1. User creates `docs/tasks/backlog/new-feature-name.md`
2. Runs `github-issue-sync sync --create`
3. Tool creates issue on GitHub
4. Renames file to `001-feature-name.md`
5. Updates frontmatter with GitHub metadata

**Alternative Approach**:

- Use a special prefix like `DRAFT-feature.md`
- Auto-increment issue numbers locally
- Interactive prompt for new file handling

**API Considerations**:

- Need to handle rate limits for creation
- Batch creation might be needed
- Transaction-like behavior for safety

## Implementation Notes (Nov 2024)

**Decision: Use GitHub CLI (`gh`) instead of direct API**

Benefits:

- Simpler implementation (no direct API code)
- Automatic auth handling (uses GITHUB_TOKEN)
- Rate limiting handled by gh
- Label creation automatic

**Files Modified**:

1. `src/lib/markdown-parser.ts` - Added `discoverNewTasks()` and `renameTask()`
2. `src/lib/sync-engine.ts` - Added `createNewIssues()` method
3. `src/cli.ts` - Added `--create` flag and `create` command

**Usage**:

```bash
# Create issues from all unnumbered files
github-issue-sync create

# Or combine with sync
github-issue-sync sync --create
```

**Workflow**:

1. Create file: `docs/tasks/backlog/my-feature.md` (no issue number)
2. Run: `github-issue-sync create`
3. Tool executes: `gh issue create --repo "owner/repo" --title "..." --body "$(cat file.md)" --label "..." --assignee "..."`
4. Parses issue number from gh output URL
5. Renames file: `my-feature.md` → `123-my-feature.md`
6. Updates sync state

**Testing Required**:

- Unit tests for new methods
- Integration test with actual GitHub repo
- Error handling tests (API failures, network issues)
