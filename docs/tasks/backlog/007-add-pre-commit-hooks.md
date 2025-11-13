---
created_utc: 2025-01-13T00:00:00Z
title: Add Pre-Commit Hooks for Tests
severity: P3
priority: low
type: enhancement
component: []
labels:
  - developer-experience
  - quality
reporter: thom
status: backlog
---

# Add Pre-Commit Hooks for Tests

## Summary

Add git pre-commit hooks to automatically run tests before commits, preventing broken code from being committed.

## Action Items

- [ ] Install husky for git hook management
  - [ ] `pnpm add -D husky`
  - [ ] `pnpm exec husky init`
- [ ] Create `.husky/pre-commit` script
  - [ ] Run `pnpm test` before commit
  - [ ] Exit 1 if tests fail
- [ ] Optional: Add lint-staged for faster checks
  - [ ] Only run tests for changed files
  - [ ] Skip if no relevant changes
- [ ] Document in README and CLAUDE.md
  - [ ] How to bypass hook: `git commit --no-verify`
  - [ ] How to disable hooks if needed
- [ ] Update GitHub Actions to verify hooks work

## Technical Notes

**Dependencies**: husky, optionally lint-staged
**Effort**: Small (~30 minutes)
**Priority**: Low (CI already catches failures)
