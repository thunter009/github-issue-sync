---
created_utc: 2025-01-13T00:00:00.000Z
title: Add Pre-Commit Hooks for Tests
severity: P3
priority: low
type: enhancement
component: []
labels: []
reporter: thom
status: completed
completed_utc: '2025-11-18T00:44:50Z'
---
# Add Pre-Commit Hooks for Tests

## Summary

Add git pre-commit hooks to automatically run tests before commits, preventing broken code from being committed.

## Action Items

- [x] Install husky for git hook management
  - [x] `pnpm add -D husky`
  - [x] `pnpm exec husky init`
- [x] Create `.husky/pre-commit` script
  - [x] Run `pnpm test` before commit
  - [x] Exit 1 if tests fail
- [x] Optional: Add lint-staged for faster checks
  - [x] Only run tests for changed files
  - [x] Skip if no relevant changes
- [x] Document in README and CLAUDE.md
  - [x] How to bypass hook: `git commit --no-verify`
  - [x] How to disable hooks if needed
- [x] Update GitHub Actions to verify hooks work (CI runs tests)

## Technical Notes

**Dependencies**: husky, lint-staged
**Effort**: Small (~30 minutes)
**Priority**: Low (CI already catches failures)

**Implementation Details**:
- husky v9.1.7 manages git hooks
- lint-staged runs tests only on changed TypeScript files
- Pre-commit hook runs `pnpm lint-staged` which executes `jest --findRelatedTests`
- GitHub Actions verifies hooks are installed and configured correctly
