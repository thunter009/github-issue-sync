# npm Link Development Guide

## Overview

Use `npm link` to test the GitHub Issue Sync package locally before publishing to npm.

## Step-by-Step Setup

### 1. Build and Link the Package

From the github-issue-sync directory:

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Create global symlink
npm link
```

This creates a symlink in your global node_modules pointing to this package.

### 2. Verify Installation

```bash
# Check if command is available
which github-issue-sync

# Test the command
github-issue-sync --help
```

### 3. Use in Another Project

In your target project directory:

```bash
# Option 1: Link globally installed package
npm link @noticewise/github-issue-sync

# Option 2: Use directly if linked globally
github-issue-sync sync
```

### 4. Development Workflow

While developing:

```bash
# Watch for changes (in github-issue-sync dir)
npm run dev

# Changes are immediately available in linked projects
# No need to re-link after rebuilds
```

### 5. Unlinking

When done testing:

```bash
# In target project
npm unlink @noticewise/github-issue-sync

# In github-issue-sync directory
npm unlink
```

## Troubleshooting

### Command not found

```bash
# Check npm global bin directory
npm config get prefix
# Add {prefix}/bin to your PATH
```

### Permission errors

```bash
# May need sudo on some systems
sudo npm link
```

### Changes not reflecting

```bash
# Ensure TypeScript is compiled
npm run build

# Or use watch mode
npm run dev
```

## Alternative: Direct Execution

For quick testing without linking:

```bash
# From github-issue-sync directory
node dist/cli.js sync

# Or with ts-node (install first)
npx ts-node src/cli.ts sync
```