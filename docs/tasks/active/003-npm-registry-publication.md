---
title: npm Registry Publication
created_utc: 2025-01-10T00:00:00.000Z
status: active
priority: medium
type: enhancement
labels: []
severity: P2
component: []
assignee: thunter009
reporter: thunter009
---
# npm Registry Publication

## Summary

After test suite completion, publish the package to npm registry as @noticewise/github-issue-sync. This involves setting up npm organization, configuring package metadata, and establishing a release process.

## Action Items

- [ ] Create @noticewise organization on npm (if not exists)
- [ ] Update package.json metadata
  - [ ] Ensure correct package name: @noticewise/github-issue-sync
  - [ ] Add keywords for discoverability
  - [ ] Verify files field includes all necessary files
  - [ ] Add repository field with GitHub URL
  - [ ] Add bugs field for issue tracking
- [ ] Create .npmignore file to exclude unnecessary files
- [ ] Test package contents with `npm pack --dry-run`
- [ ] Write CHANGELOG.md for version 1.0.0
- [ ] Test local installation from tarball
- [ ] Configure npm authentication
- [ ] Publish beta version first (1.0.0-beta.1)
- [ ] Test installation from npm registry
- [ ] Publish stable 1.0.0 release
- [ ] Update README with npm badge
- [ ] Create GitHub release with changelog
- [ ] Document release process for future versions

## Technical Details

**Package Name**: `@noticewise/github-issue-sync`

**Files to Include**:

- dist/ (compiled TypeScript)
- README.md
- LICENSE
- package.json
- CHANGELOG.md

**Files to Exclude**:

- src/ (source TypeScript)
- tests/
- .env files
- .sync-state.json
- tsconfig.json
- docs/ (except maybe quick-reference)

**Verification Commands**:

```bash
# Check what will be published
npm pack --dry-run

# Test tarball locally
npm pack
npm install -g noticewise-github-issue-sync-1.0.0.tgz

# Publish beta
npm publish --tag beta

# Publish stable
npm publish
```

**Registry URL**: <https://www.npmjs.com/package/@noticewise/github-issue-sync>
