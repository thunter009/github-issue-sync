---
created_utc: 2025-01-13T00:00:00Z
title: Auto-Detect Orphaned Numbered Files
severity: P3
priority: low
type: enhancement
component: []
labels:
  - feature
  - safety
reporter: thom
status: backlog
---

# Auto-Detect Orphaned Numbered Files

## Summary

Add automatic detection and handling for "orphaned" local files - files with issue numbers (e.g., `007-foo.md`) where the corresponding GitHub issue doesn't exist. Currently these files silently skip during sync with warnings, confusing users.

## Problem

When files have numbers but GitHub issues don't exist:
- User creates `007-task.md` manually with wrong number
- User deletes GitHub issue but keeps local file
- Tool creates follow-up tasks with numbers (like we just did)

**Current behavior**: Sync skips with warning "Issue #7 doesn't exist - skipping"
**Desired behavior**: Detect, prompt user, offer solutions

## Safety Requirements

**Critical**: Must prevent duplicate issue creation

1. **Check GitHub issue history**
   - Use GitHub API to check if issue was deleted/moved
   - Check `.sync-state.json` for previously synced issues
   - Mark known-deleted issues

2. **User confirmation required**
   - Never auto-create without prompt
   - Show what will happen before acting
   - Offer multiple resolution options

3. **Dry-run mode**
   - `--detect-orphans` flag to find orphans
   - Display orphans without taking action
   - Let user decide next steps

4. **Track deleted issues**
   - Add `deletedIssues: number[]` to `.sync-state.json`
   - Prevent re-creation of intentionally deleted issues
   - Clear on explicit user request

## Action Items

- [ ] Add orphan detection to `MarkdownParser.discoverTasks()`
  - [ ] Return separate array of orphaned files
  - [ ] Check GitHub API for issue existence
  - [ ] Check sync state for deletion history
- [ ] Add `--detect-orphans` flag to sync command
  - [ ] Display orphaned files with context
  - [ ] Show last known sync state if available
  - [ ] Suggest actions (create, renumber, delete)
- [ ] Add interactive resolution flow
  - [ ] Option 1: Create new GitHub issue (confirm first)
  - [ ] Option 2: Remove number from filename
  - [ ] Option 3: Delete local file
  - [ ] Option 4: Skip (keep as-is)
- [ ] Update `.sync-state.json` schema
  - [ ] Add `deletedIssues: number[]` field
  - [ ] Track when issues disappear from GitHub
  - [ ] Prevent re-creation without explicit override
- [ ] Add `--force-create-orphans` flag
  - [ ] Bypass safety checks (dangerous)
  - [ ] Require explicit confirmation
  - [ ] Log all actions
- [ ] Update documentation
  - [ ] Explain orphan detection in README
  - [ ] Add troubleshooting guide
  - [ ] Document safety mechanisms

## Technical Details

**Detection Logic**:
```typescript
interface OrphanedFile {
  filepath: string;
  issueNumber: number;
  wasDeleted: boolean;     // In deletedIssues list
  lastSynced?: string;     // From sync state
  suggestion: 'create' | 'renumber' | 'investigate';
}
```

**Resolution Flow**:
1. Discover tasks with numbers
2. Check GitHub for each issue
3. If 404: Check if in deletedIssues
4. If deleted: Skip with message
5. If never existed: Prompt user
6. Apply user's choice

**Safety Checks**:
- Don't auto-create (always prompt)
- Check deletion history
- Dry-run mode available
- Undo/rollback support

## Alternatives Considered

**Option 1: Auto-remove numbers** (rejected)
- Too aggressive, loses information
- Could break user workflows

**Option 2: Auto-create always** (rejected)
- High risk of duplicates
- Could spam GitHub issues

**Option 3: Manual only** (current)
- Safe but requires user intervention
- Confusing warnings

**Option 4: Interactive detection** (recommended)
- Balance of safety and convenience
- User in control

## Effort Estimate

**Size**: Medium (4-6 hours)
**Complexity**: Medium (safety checks, API calls, state management)
**Priority**: Low (workaround exists - manual renaming)
