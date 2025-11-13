---
created_utc: 2025-01-13T00:00:00Z
title: Increase SyncEngine Test Coverage
severity: P2
priority: medium
type: enhancement
component: []
labels:
  - testing
  - quality
reporter: thom
status: backlog
---

# Increase SyncEngine Test Coverage

## Summary

SyncEngine currently has 38% test coverage. Add more integration tests to cover edge cases, error handling, and complex sync scenarios.

## Current Coverage

**SyncEngine** (38% coverage):
- Uncovered: lines 55-56, 135-137, 151, 193-206, 223-224, 284-449, 473-587
- Key gaps:
  - `pushOnly()` and `pullOnly()` methods
  - `createNewIssues()` flow
  - Error handling paths
  - `resolveConflict()` method
  - `getTaskStatus()` helper

## Action Items

- [ ] Add tests for `pushOnly()` method
  - [ ] Push when only local modified
  - [ ] Skip when up-to-date
- [ ] Add tests for `pullOnly()` method
  - [ ] Pull when only remote modified
  - [ ] Skip when up-to-date
- [ ] Add tests for `createNewIssues()` flow
  - [ ] Mock `gh` CLI command execution
  - [ ] Test file renaming after creation
  - [ ] Test state persistence
- [ ] Add error handling tests
  - [ ] GitHub API failures
  - [ ] File I/O errors
  - [ ] Invalid frontmatter
- [ ] Add edge case tests
  - [ ] Empty task list
  - [ ] All tasks up-to-date
  - [ ] Partial failures

## Target

Increase SyncEngine coverage from 38% to >70%

**Effort**: Medium (3-4 hours)
**Priority**: Medium (important for reliability)
