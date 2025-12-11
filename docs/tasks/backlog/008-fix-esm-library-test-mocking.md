---
created_utc: 2025-01-13T00:00:00.000Z
title: Fix ESM Library Test Mocking
severity: P3
priority: low
type: enhancement
component: []
labels: []
reporter: thom
status: backlog
---
# Fix ESM Library Test Mocking

## Summary

GitHubClient and ConflictResolver tests exist but are excluded from CI due to TypeScript/ESM mocking issues with external libraries (Octokit, inquirer). These tests compile but can't run due to Jest's ESM transformation limitations.

## Problem

- **GitHubClient tests**: Octokit v22 is ESM-only, Jest struggles to transform/mock it
- **ConflictResolver tests**: inquirer v9 is ESM-only, similar issues
- Current workaround: Tests excluded via 

## Action Items

- [ ] Research ESM mocking solutions for Jest + TypeScript
  - [ ] Try jest.unstable_mockModule (experimental)
  - [ ] Consider upgrading to Vitest (native ESM support)
  - [ ] Investigate jest-mock-extended for better TypeScript mocks
- [ ] Alternative: Refactor to use dependency injection
  - [ ] Extract Octokit calls behind interface
  - [ ] Extract inquirer calls behind interface
  - [ ] Mock interfaces instead of libraries
- [ ] Alternative: E2E tests instead of unit tests
  - [ ] Use real Octokit with test repo
  - [ ] Skip inquirer tests (UI tested manually)
- [ ] Update jest.config.js to remove exclusions once fixed

## Technical Notes

**Current State**:
- Tests written: ✅
- Tests compile with mocks: ❌
- Excluded in 

**Effort**: Medium (2-4 hours)
**Priority**: Low (business logic well-tested, these are integration tests for external libs)
