# Sync Architecture Reference

## Overview

The GitHub Issue Sync uses a content-hash-based synchronization strategy with interactive conflict resolution.

## Core Components

### 1. SyncEngine (src/lib/sync-engine.ts)

Central orchestrator that:
- Discovers local markdown files
- Fetches corresponding GitHub issues
- Compares states using content hashes
- Determines sync actions (push/pull/conflict)
- Persists sync state

### 2. Content Hashing

Simple 32-bit hash used for change detection:
- Combines title, body, and labels into single string
- Not cryptographically secure (not needed)
- Fast comparison of local vs remote state

### 3. State Tracking (.sync-state.json)

```json
{
  "lastSyncedAt": "2024-11-08T10:00:00Z",
  "issues": {
    "1": {
      "localHash": 12345678,
      "remoteHash": 12345678,
      "lastSyncedAt": "2024-11-08T10:00:00Z"
    }
  }
}
```

## Sync Decision Matrix

| Local Changed | Remote Changed | Action |
|--------------|----------------|---------|
| No | No | Skip |
| Yes | No | Push to GitHub |
| No | Yes | Pull to local |
| Yes | Yes | Conflict (prompt user) |

## Sync Flow

```
1. DISCOVERY PHASE
   ├── Scan docs/tasks/*/*.md
   ├── Parse frontmatter
   └── Extract issue numbers

2. FETCH PHASE
   ├── Get GitHub issues by number
   ├── Handle missing issues
   └── Cache labels

3. COMPARISON PHASE
   ├── Hash local content
   ├── Hash remote content
   ├── Load previous state
   └── Determine changes

4. RESOLUTION PHASE
   ├── Apply automatic syncs
   ├── Prompt for conflicts
   └── Execute user choices

5. PERSISTENCE PHASE
   ├── Update .sync-state.json
   ├── Write markdown files
   └── Update GitHub issues
```

## Field Mapping

### Markdown → GitHub

| Frontmatter | GitHub Field | Transform |
|-------------|--------------|-----------|
| title | title | Direct |
| assignee | assignees | Array wrap |
| status: completed | state | → "closed" |
| priority, severity | labels | Prefix with group |
| body content | body | Append metadata |

### GitHub → Markdown

| GitHub Field | Frontmatter | Transform |
|--------------|-------------|-----------|
| title | title | Extract issue # |
| assignees[0] | assignee | First only |
| state: closed | status | → "completed" |
| labels | various | Parse prefixes |
| body | content | Extract metadata |

## Conflict Resolution

When both sides change:

1. **Detection**: localHash ≠ saved & remoteHash ≠ saved
2. **Display**: Show side-by-side diff
3. **Options**: Use local, use remote, skip, skip all
4. **Application**: Update chosen direction immediately

## Performance Considerations

- **Label Caching**: Reduces API calls
- **Batch Requests**: 10 issues at a time
- **Lazy Loading**: Only fetch when needed
- **Hash Comparison**: O(1) change detection

## Error Handling

- **Missing Issues**: Skip with warning
- **Rate Limits**: Fail gracefully with message
- **Network Errors**: Retry with backoff
- **Parse Errors**: Report specific file/line