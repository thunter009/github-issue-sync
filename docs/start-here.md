# START HERE - GitHub Issue Sync Development

## 🎯 What You're Building
**GitHub Issue Sync** - A bidirectional sync tool that keeps local markdown task files in perfect sync with GitHub issues, with smart conflict resolution.

**Current Status**: Core sync engine complete, ready for test suite and npm publication
**Your Mission**: Add comprehensive tests, publish to npm registry, integrate GitHub Actions

## 🚀 Quick Start (5 minutes)

### 1. Get the Code Running
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Link for local testing
npm link

# Set up environment (.env.local)
echo "GITHUB_TOKEN=your_github_token" > .env.local
echo "GITHUB_REPO=owner/repo" >> .env.local

# Test the sync
github-issue-sync status  # Dry run
github-issue-sync sync    # Full sync
```

### 2. Your Roadmap
Work through these in order:
1. ✅ **[Phase 1: Core Sync Engine](reference/sync-architecture.md)** - COMPLETED
2. ✅ **[Phase 1A: Conflict Resolution](reference/conflict-resolution.md)** - COMPLETED (Nov 2024)
3. 🚨 **[Phase 2: Test Suite](tasks/active/01-test-suite-implementation.md)** ← **DO THIS NEXT**
4. **[Phase 3: npm Publication](tasks/active/02-npm-publication.md)**
5. **[Phase 4: GitHub Actions](tasks/backlog/github-actions-integration.md)**
6. **[Phase 5: Create Issues Feature](tasks/backlog/create-new-issues.md)**

## 📚 Documentation Structure

### When You Need Help
- **[quick-reference.md](quick-reference.md)** - Commands, URLs, and common fixes
- **[tasks/](tasks/)** - Step-by-step implementation task lists -- your checklist for getting things done
- **[reference/](reference/)** - Deep technical documentation (read only if needed)
- **[how-to-guides/](how-to-guides/)** - Project-specific walkthroughs (e.g. npm link setup)

### Key Principle
**Read docs just-in-time**. Start with the next task that needs to be done (which you get from a mixture of reading this doc and verifying in tasks/ dir files), and reference other docs only when you need specific information. It's important to work on the correct next thing, so take a small amount of extra time in the beginning to make sure you're looking at the next tasks.

## ✅ Success Criteria Examples
MVP is complete when:
- Test coverage > 80% for core sync logic
- Published to npm registry as @noticewise/github-issue-sync
- GitHub Actions workflow for automated testing
- Can create new issues (not just sync existing)
- Documentation complete with video tutorials

## 🎯 **Ready? Go look for the next task to do, then create a plan, and get to work →**