---
created_utc: '2025-11-13T00:00:00.000Z'
reporter: thunter009
title: Support running CLI from any directory
severity: P2
priority: medium
type: bug
component:
  - cli
labels:
  - 'test:label'
status: backlog
---
# Support running CLI from any directory

## Summary

`github-issue-sync` currently fails when run outside the project root directory because it cannot locate `.env.local` or `.env` files containing `GITHUB_TOKEN`. Users expect globally-installed CLI tools to work from any directory.

## Impact

- Severity: P2
- Affected users: Anyone using `github-issue-sync` as a global CLI tool across multiple projects
- Business impact: Poor UX, forces users to `cd` to project root or re-export env vars
- Workarounds: Run from project root or manually export `GITHUB_TOKEN` before each command

## Environment

- App/Service: github-issue-sync CLI
- Installation: `pnpm link --global`
- Observed in: `~/10-19_projects/notice-wise-ui-k1/docs/tasks/backlog`

## Steps to Reproduce

1. Install globally: `pnpm link --global` (in github-issue-sync repo)
2. Navigate to different project: `cd ~/other-project/docs/tasks/backlog`
3. Run: `github-issue-sync sync --create`
4. Observe error:
   ```
   Error: GITHUB_TOKEN environment variable not set
   Set it in your .env.local file or export it:
     export GITHUB_TOKEN=ghp_your_token_here
   ```

## Expected vs Actual

- **Expected**: Tool reads config from target project's root (walk up to find `.env*` or `GITHUB_REPO` indicator) OR reads from global config location
- **Actual**: Tool fails with env var error when `.env.local` not in current working directory

## Evidence

Error output from command run in `~/10-19_projects/notice-wise-ui-k1/docs/tasks/backlog`:
```
github-issue-sync sync --create
Error: GITHUB_TOKEN environment variable not set
```

## Acceptance Criteria

- [ ] CLI discovers config by walking up directory tree to find `.env.local`, `.env`, or `package.json` with `GITHUB_REPO` field
- [ ] OR CLI supports global config file (e.g., `~/.config/github-issue-sync/config`)
- [ ] Tool works when run from any subdirectory of a project
- [ ] Error messages guide users to set up config in correct location
- [ ] Add tests for config discovery from subdirectories

## Technical Approaches

**Option 1**: Walk up directory tree to find project root
- Look for `.env.local`, `.env`, or `package.json` with `GITHUB_REPO`
- Use `find-up` or similar library
- Cache discovered root for session

**Option 2**: Global config file
- Support `~/.config/github-issue-sync/config` or `~/.github-issue-sync.json`
- Override with project-local config if found

**Option 3**: Require explicit project path
- Add `--project-root` or `--config` flag
- Less convenient but explicit

## Risks/Notes

- Security: Ensure we don't accidentally read `.env` from parent directories outside intended project
- Precedence: Project-local config should override global config
- Performance: Directory walking should be fast/cached

## Next Actions

- Owner: unassigned
- Priority: medium (usability issue but workaround exists)
