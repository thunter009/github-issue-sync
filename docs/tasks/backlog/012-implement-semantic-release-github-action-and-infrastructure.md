---
created_utc: 2025-11-13T00:00:00.000Z
title: Implement semantic-release GitHub Action and infrastructure
severity: P1
priority: high
type: enhancement
component:
  - ci/cd
  - release-automation
labels: []
reporter: thom
status: backlog
assignee: thunter009
due_date: 2025-11-20T00:00:00.000Z
relates_to:
  - >-
    https://github.com/thunter009/notice-wise-ui-k1/blob/main/.github/workflows/release.yml
  - 'https://github.com/thunter009/notice-wise-ui-k1/blob/main/.releaserc.js'
  - '#003'
---
# Implement semantic-release GitHub Action and infrastructure

## Summary

Set up automated versioning and release management using semantic-release, mirroring the setup from the notice-wise-ui-k1 front-end repository. This will automate version bumping, changelog generation, GitHub releases, and npm publishing based on conventional commit messages.

## Impact

- Severity: P1
- Affected scope: Release and deployment workflow
- Business impact: Streamlines release process, ensures consistent versioning, automates changelog, reduces manual release errors
- Workarounds: Manual version bumping and release notes (current state)

## Dependencies

**Blocked by**: Issue #003 (npm registry publication) - npm publishing infrastructure must be implemented first

**Related**: Issue #005 (GitHub Actions Integration) - overlaps with CI/CD setup

## Environment

- Repository: @noticewise/github-issue-sync
- Current version: 1.0.0
- Package manager: pnpm@10.22.0
- Node version: >=18.0.0
- Target registry: npm (blocked, not yet configured)

## Reference Implementation

The notice-wise-ui-k1 repo provides the reference implementation at:
- Workflow: `/Users/thom/10-19_projects/notice-wise-ui-k1/.github/workflows/release.yml`
- Config: `/Users/thom/10-19_projects/notice-wise-ui-k1/.releaserc.js`

## Acceptance Criteria

- [ ] Install semantic-release dependencies and plugins
- [ ] Create `.releaserc.js` configuration file
- [ ] Create `.github/workflows/release.yml` workflow
- [ ] Configure conventional commit types → version bump mapping
- [ ] Set up automatic CHANGELOG.md generation
- [ ] Configure GitHub release creation
- [ ] Set up npm publishing step (when #003 is complete)
- [ ] Add commitizen for easier conventional commits
- [ ] Configure git plugin to commit release artifacts
- [ ] Test release workflow on main branch push
- [ ] Document release process in README or CONTRIBUTING.md

## Technical Details

### Dependencies to Install

```json
{
  "devDependencies": {
    "semantic-release": "^25.0.1",
    "@semantic-release/changelog": "^6.0.3",
    "@semantic-release/commit-analyzer": "^13.0.1",
    "@semantic-release/git": "^10.0.1",
    "@semantic-release/github": "^12.0.1",
    "@semantic-release/release-notes-generator": "^14.1.0",
    "@semantic-release/npm": "^12.0.1",
    "commitizen": "^4.3.1",
    "conventional-changelog-conventionalcommits": "^9.1.0",
    "cz-conventional-changelog": "^3.3.0"
  }
}
```

### .releaserc.js Configuration

```javascript
module.exports = {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'refactor', release: 'patch' },
          { type: 'docs', release: 'patch' },
          { type: 'style', release: 'patch' },
          { type: 'test', release: 'patch' },
          { type: 'build', release: 'patch' },
          { type: 'ci', release: 'patch' },
          { type: 'chore', release: 'patch' }
        ]
      }
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: [
            { type: 'feat', section: 'Features' },
            { type: 'fix', section: 'Bug Fixes' },
            { type: 'perf', section: 'Performance Improvements' },
            { type: 'refactor', section: 'Code Refactoring' },
            { type: 'docs', section: 'Documentation' },
            { type: 'style', section: 'Styles' },
            { type: 'test', section: 'Tests' },
            { type: 'build', section: 'Build System' },
            { type: 'ci', section: 'Continuous Integration' },
            { type: 'chore', section: 'Chores', hidden: true }
          ]
        }
      }
    ],
    '@semantic-release/changelog',
    '@semantic-release/npm',
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'pnpm-lock.yaml', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]'
      }
    ],
    '@semantic-release/github'
  ]
};
```

### GitHub Workflow Structure

**File**: `.github/workflows/release.yml`

**Key elements**:
- Trigger: Push to `main` branch only
- Permissions: `contents: write`, `pull-requests: write`, `issues: write`
- Steps:
  1. Checkout with full git history (`fetch-depth: 0`)
  2. Setup Node.js v24
  3. Install pnpm v9
  4. Setup pnpm cache
  5. Install dependencies (`pnpm install --frozen-lockfile`)
  6. Configure git user
  7. Run semantic-release
- Environment variables:
  - `GITHUB_TOKEN`: secrets.GITHUB_TOKEN
  - `NPM_TOKEN`: secrets.GITHUB_TOKEN (until separate npm token configured)

### Commitizen Setup

Add to package.json:

```json
{
  "scripts": {
    "release": "semantic-release",
    "commit": "cz"
  },
  "config": {
    "commitizen": {
      "path": "cz-conventional-changelog"
    }
  }
}
```

### Conventional Commit Types

**Version bumps**:
- `feat:` → minor version
- `fix:`, `perf:`, `refactor:`, `docs:`, `style:`, `test:`, `build:`, `ci:`, `chore:` → patch version
- `BREAKING CHANGE:` in footer or `!` after type → major version

**Examples**:
```
feat: add --dry-run flag to sync command
fix: resolve race condition in conflict detection
perf: optimize hash calculation for large files
docs: update README with release process
chore(release): 1.2.0 [skip ci]
```

## Secrets Required

**GitHub repository secrets** (Settings → Secrets and variables → Actions):
- `GITHUB_TOKEN`: Auto-provided by GitHub Actions (no setup needed)
- `NPM_TOKEN`: To be configured when #003 is complete

## Risks/Notes

**Security/Privacy**:
- GITHUB_TOKEN has write permissions to repo, issues, PRs
- NPM_TOKEN must be scoped to this package only

**Rollout/Backout**:
- Test workflow on feature branch first before merging to main
- Release workflow only runs on main to prevent accidental releases
- `[skip ci]` in commit message prevents infinite release loops

**Dependencies/Blocked by**:
- npm registry publication (#003) must be complete for npm publishing step
- Can implement GitHub releases independently while npm publishing is blocked

**Considerations**:
- Requires team adoption of conventional commit messages
- Commitizen (`pnpm run commit`) helps enforce format
- May want to add commit linting (commitlint) in future
- Consider adding husky hook to validate commit messages

## Next Actions

- Owner: @thunter009
- First triage by: 2025-11-14
- Due: 2025-11-20
- Implementation order:
  1. Install dependencies
  2. Create `.releaserc.js` config
  3. Create GitHub workflow
  4. Test on feature branch
  5. Merge to main
  6. Monitor first release
  7. Document process
