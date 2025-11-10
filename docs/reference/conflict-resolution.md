# Conflict Resolution Reference

## Overview

Conflicts occur when both local markdown and GitHub issue have changed since last sync. The tool provides interactive resolution with visual diffs.

## Conflict Detection

A conflict is detected when:
```javascript
localHash !== syncState.localHash &&
remoteHash !== syncState.remoteHash
```

This means both sides have modifications unknown to the other.

## Resolution Interface

### 1. Diff Display

Shows side-by-side comparison:
```
Conflict for Task #1: Fix authentication bug

Title:
  Local:  [#001] Fix authentication bug in login
  Remote: [#001] Fix auth bug in login flow

Body:
  Local:  Updated description with root cause...
  Remote: Added steps to reproduce...

Labels:
  Local:  priority:high, type:bug, component:auth
  Remote: priority:critical, type:bug, component:auth, needs-review
```

### 2. User Options

Interactive prompt offers:
- **Use local version** - Overwrite GitHub with local
- **Use remote version** - Overwrite local with GitHub
- **Skip this conflict** - Leave both unchanged
- **Skip all remaining** - Skip all future conflicts

### 3. Resolution Actions

Based on choice:

#### Use Local
```javascript
await github.updateIssue(issueNumber, localData)
await updateSyncState(localHash, localHash)
```

#### Use Remote
```javascript
await parser.writeTaskFile(filepath, remoteData)
await updateSyncState(remoteHash, remoteHash)
```

#### Skip
```javascript
// No changes made
// Conflict remains for next sync
```

## Implementation Details

### ConflictResolver Class (src/lib/conflict-resolver.ts)

```typescript
class ConflictResolver {
  async resolveConflicts(conflicts: Conflict[]): Promise<Resolution[]>
  private formatDiff(local: any, remote: any): string
  private promptUser(conflict: Conflict): Promise<Choice>
  private applyResolution(conflict: Conflict, choice: Choice): Promise<void>
}
```

### Diff Generation

Uses the `diff` package for line-by-line comparison:
- Green lines: Added in this version
- Red lines: Removed from other version
- White lines: Unchanged

### State After Resolution

Successfully resolved conflicts update .sync-state.json:
```json
{
  "issues": {
    "1": {
      "localHash": 87654321,  // New hash after resolution
      "remoteHash": 87654321, // Same, now in sync
      "lastSyncedAt": "2024-11-08T11:00:00Z"
    }
  }
}
```

## Edge Cases

### Multiple Conflicts

- Process sequentially, not parallel
- "Skip all" option for bulk skipping
- Progress indicator shows X of Y

### Network Failures During Resolution

- Each resolution is atomic
- Completed resolutions are saved
- Can resume from failure point

### File System Issues

- Backup before writing
- Validate write permissions
- Rollback on write failure

## Best Practices

1. **Review diffs carefully** - Especially for destructive changes
2. **Use skip when uncertain** - Can resolve manually later
3. **Sync frequently** - Reduces conflict likelihood
4. **Communicate changes** - Coordinate with team on shared repos