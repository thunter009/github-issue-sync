/**
 * Shared types for issue sync system
 */

export interface TaskFrontmatter {
  created_utc: string;
  completed_utc?: string;
  reporter: string;
  title: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  priority: 'blocker' | 'critical' | 'high' | 'medium' | 'low';
  type?: 'epic' | 'feature' | 'bug' | 'enhancement';
  component: string[];
  labels: string[];
  assignee?: string;
  status?: 'backlog' | 'active' | 'completed';
  status_last_modified?: string; // ISO timestamp of last status field change
  parent_epic?: string;
  epic_progress?: string;
  commit?: string;
  commit_url?: string;
  relates_to?: string[];
  due_date?: string;
}

export interface TaskDocument {
  issueNumber: number;
  filename: string;
  filepath: string;
  frontmatter: TaskFrontmatter;
  body: string;
  lastModified: Date;
  folderLastModified: Date; // Parent directory modification time
}

export interface GitHubIssueData {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: string[];
  assignee: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface SyncState {
  lastSync: string;
  issues: Record<number, {
    localHash: string;
    remoteHash: string;
    lastSyncedAt: string;
  }>;
}

export interface SyncConflict {
  issueNumber: number;
  filename: string;
  localData: TaskDocument;
  remoteData: GitHubIssueData;
  localModified: Date;
  remoteModified: Date;
}

export interface SyncResult {
  pushed: number[];
  pulled: number[];
  conflicts: SyncConflict[];
  skipped: number[];
  errors: Array<{ issueNumber: number; error: string }>;
}

export type ConflictResolution = 'local' | 'remote' | 'skip';
