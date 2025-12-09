/**
 * Parser interface types for multi-source support
 */

import { TaskDocument, TaskFrontmatter, SyncFilter } from '../types';

export type SourceType = 'tasks' | 'openspec';

export type TaskStatus = 'backlog' | 'active' | 'completed';

/**
 * Common interface for all source parsers
 */
export interface ISourceParser {
  /** Unique identifier for this source type */
  readonly sourceType: SourceType;

  /** Discover all tasks from this source */
  discoverTasks(filter?: SyncFilter): Promise<TaskDocument[]>;

  /** Discover new tasks without issue numbers (for creation) */
  discoverNewTasks(): Promise<TaskDocument[]>;

  /** Write task back to source */
  writeTask(task: TaskDocument): Promise<void>;

  /** Create new task file */
  createTask(
    issueNumber: number,
    frontmatter: TaskFrontmatter,
    body: string,
    status?: TaskStatus
  ): Promise<TaskDocument>;

  /** Check if task with issue number exists */
  taskExists(issueNumber: number): boolean;

  /** Rename task file with new issue number */
  renameTask(oldPath: string, issueNumber: number, newTitle?: string): Promise<string>;

  /** Move task to different status (optional - not all sources support this) */
  moveTask?(task: TaskDocument, newStatus: TaskStatus): Promise<TaskDocument>;

  /** Resolve status conflicts (optional - not all sources have status folders) */
  resolveStatusConflict?(task: TaskDocument): TaskStatus;

  /** Get task directory for status (optional) */
  getTaskDir?(status: TaskStatus): string;
}
