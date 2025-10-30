/**
 * Core sync engine with change detection and state management
 */

import fs from 'fs';
import path from 'path';
import { GitHubClient } from './github-client';
import { MarkdownParser } from './markdown-parser';
import { FieldMapper } from './field-mapper';
import {
  SyncState,
  SyncConflict,
  SyncResult,
  TaskDocument,
  GitHubIssueData,
} from './types';

export class SyncEngine {
  private github: GitHubClient;
  private parser: MarkdownParser;
  private mapper: FieldMapper;
  private stateFile: string;

  constructor(
    github: GitHubClient,
    parser: MarkdownParser,
    mapper: FieldMapper,
    projectRoot: string
  ) {
    this.github = github;
    this.parser = parser;
    this.mapper = mapper;
    this.stateFile = path.join(projectRoot, '.sync-state.json');
  }

  /**
   * Load sync state from disk
   */
  private loadState(): SyncState {
    if (!fs.existsSync(this.stateFile)) {
      return {
        lastSync: new Date(0).toISOString(),
        issues: {},
      };
    }

    try {
      const content = fs.readFileSync(this.stateFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn('Failed to load sync state, starting fresh');
      return {
        lastSync: new Date(0).toISOString(),
        issues: {},
      };
    }
  }

  /**
   * Save sync state to disk
   */
  private saveState(state: SyncState): void {
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Perform full bidirectional sync
   */
  async sync(): Promise<SyncResult> {
    const state = this.loadState();
    const tasks = await this.parser.discoverTasks();

    console.log(`Found ${tasks.length} local tasks`);

    // Fetch all corresponding GitHub issues
    const issueNumbers = tasks.map((t) => t.issueNumber);
    const issues = await this.github.getIssues(issueNumbers);

    console.log(`Found ${issues.size} GitHub issues`);

    const result: SyncResult = {
      pushed: [],
      pulled: [],
      conflicts: [],
      skipped: [],
      errors: [],
    };

    // Analyze each task
    for (const task of tasks) {
      try {
        const issue = issues.get(task.issueNumber);

        if (!issue) {
          // Issue doesn't exist on GitHub - push local to GitHub
          await this.pushTask(task);
          result.pushed.push(task.issueNumber);
          continue;
        }

        // Check for changes
        const localHash = this.mapper.hashTask(task);
        const remoteHash = this.mapper.hashIssue(issue);
        const syncInfo = state.issues[task.issueNumber];

        const localChanged = !syncInfo || syncInfo.localHash !== localHash;
        const remoteChanged = !syncInfo || syncInfo.remoteHash !== remoteHash;

        if (!localChanged && !remoteChanged) {
          // No changes
          result.skipped.push(task.issueNumber);
          continue;
        }

        if (localChanged && remoteChanged) {
          // Conflict - both changed
          result.conflicts.push({
            issueNumber: task.issueNumber,
            filename: task.filename,
            localData: task,
            remoteData: issue,
            localModified: task.lastModified,
            remoteModified: new Date(issue.updated_at),
          });
          continue;
        }

        if (localChanged) {
          // Only local changed - push to GitHub
          await this.pushTask(task, issue);
          result.pushed.push(task.issueNumber);
        } else if (remoteChanged) {
          // Only remote changed - pull from GitHub
          await this.pullIssue(issue, task);
          result.pulled.push(task.issueNumber);
        }

        // Update state
        state.issues[task.issueNumber] = {
          localHash: this.mapper.hashTask(task),
          remoteHash: this.mapper.hashIssue(issue),
          lastSyncedAt: new Date().toISOString(),
        };
      } catch (error: any) {
        result.errors.push({
          issueNumber: task.issueNumber,
          error: error.message,
        });
      }
    }

    // Update last sync time
    state.lastSync = new Date().toISOString();
    this.saveState(state);

    return result;
  }

  /**
   * Push local task to GitHub
   */
  async pushTask(task: TaskDocument, existingIssue?: GitHubIssueData): Promise<void> {
    const issueData = this.mapper.taskToGitHub(task);

    // Ensure all labels exist with correct colors before updating
    await this.github.ensureLabels(issueData.labels);

    if (existingIssue) {
      // Update existing issue
      await this.github.updateIssue(task.issueNumber, issueData);
      console.log(`✓ Pushed #${task.issueNumber} to GitHub`);
    } else {
      // Create new issue (this shouldn't happen if issue number exists)
      console.warn(`Issue #${task.issueNumber} doesn't exist on GitHub - skipping`);
    }
  }

  /**
   * Pull GitHub issue to local task
   */
  async pullIssue(issue: GitHubIssueData, existingTask: TaskDocument): Promise<void> {
    const { frontmatter, body } = this.mapper.githubToTask(issue, existingTask);

    // Update task
    const updatedTask: TaskDocument = {
      ...existingTask,
      frontmatter: {
        ...existingTask.frontmatter,
        ...frontmatter,
      },
      body,
    };

    // Move to correct directory if status changed
    const newStatus = frontmatter.status || existingTask.frontmatter.status || 'backlog';
    const currentStatus = this.getTaskStatus(existingTask.filepath);

    if (newStatus !== currentStatus) {
      const movedTask = await this.parser.moveTask(updatedTask, newStatus);
      await this.parser.writeTask(movedTask);
    } else {
      await this.parser.writeTask(updatedTask);
    }

    console.log(`✓ Pulled #${issue.number} from GitHub`);
  }

  /**
   * Push only - update GitHub from local
   */
  async pushOnly(): Promise<SyncResult> {
    const state = this.loadState();
    const tasks = await this.parser.discoverTasks();
    const issueNumbers = tasks.map((t) => t.issueNumber);
    const issues = await this.github.getIssues(issueNumbers);

    const result: SyncResult = {
      pushed: [],
      pulled: [],
      conflicts: [],
      skipped: [],
      errors: [],
    };

    for (const task of tasks) {
      try {
        const issue = issues.get(task.issueNumber);

        if (!issue) {
          console.warn(`Issue #${task.issueNumber} not found on GitHub - skipping`);
          result.skipped.push(task.issueNumber);
          continue;
        }

        await this.pushTask(task, issue);
        result.pushed.push(task.issueNumber);

        // Update state
        state.issues[task.issueNumber] = {
          localHash: this.mapper.hashTask(task),
          remoteHash: this.mapper.hashIssue(issue),
          lastSyncedAt: new Date().toISOString(),
        };
      } catch (error: any) {
        result.errors.push({
          issueNumber: task.issueNumber,
          error: error.message,
        });
      }
    }

    state.lastSync = new Date().toISOString();
    this.saveState(state);

    return result;
  }

  /**
   * Pull only - update local from GitHub
   */
  async pullOnly(): Promise<SyncResult> {
    const state = this.loadState();
    const tasks = await this.parser.discoverTasks();
    const issueNumbers = tasks.map((t) => t.issueNumber);
    const issues = await this.github.getIssues(issueNumbers);

    const result: SyncResult = {
      pushed: [],
      pulled: [],
      conflicts: [],
      skipped: [],
      errors: [],
    };

    for (const task of tasks) {
      try {
        const issue = issues.get(task.issueNumber);

        if (!issue) {
          console.warn(`Issue #${task.issueNumber} not found on GitHub - skipping`);
          result.skipped.push(task.issueNumber);
          continue;
        }

        await this.pullIssue(issue, task);
        result.pulled.push(task.issueNumber);

        // Update state
        state.issues[task.issueNumber] = {
          localHash: this.mapper.hashTask(task),
          remoteHash: this.mapper.hashIssue(issue),
          lastSyncedAt: new Date().toISOString(),
        };
      } catch (error: any) {
        result.errors.push({
          issueNumber: task.issueNumber,
          error: error.message,
        });
      }
    }

    state.lastSync = new Date().toISOString();
    this.saveState(state);

    return result;
  }

  /**
   * Get status preview without making changes
   */
  async status(): Promise<{
    toSync: number[];
    conflicts: SyncConflict[];
  }> {
    const state = this.loadState();
    const tasks = await this.parser.discoverTasks();
    const issueNumbers = tasks.map((t) => t.issueNumber);
    const issues = await this.github.getIssues(issueNumbers);

    const toSync: number[] = [];
    const conflicts: SyncConflict[] = [];

    for (const task of tasks) {
      const issue = issues.get(task.issueNumber);

      if (!issue) {
        toSync.push(task.issueNumber);
        continue;
      }

      const localHash = this.mapper.hashTask(task);
      const remoteHash = this.mapper.hashIssue(issue);
      const syncInfo = state.issues[task.issueNumber];

      const localChanged = !syncInfo || syncInfo.localHash !== localHash;
      const remoteChanged = !syncInfo || syncInfo.remoteHash !== remoteHash;

      if (localChanged && remoteChanged) {
        conflicts.push({
          issueNumber: task.issueNumber,
          filename: task.filename,
          localData: task,
          remoteData: issue,
          localModified: task.lastModified,
          remoteModified: new Date(issue.updated_at),
        });
      } else if (localChanged || remoteChanged) {
        toSync.push(task.issueNumber);
      }
    }

    return { toSync, conflicts };
  }

  /**
   * Resolve a conflict with specified resolution
   */
  async resolveConflict(
    conflict: SyncConflict,
    resolution: 'local' | 'remote'
  ): Promise<void> {
    if (resolution === 'local') {
      // Push local to GitHub
      await this.pushTask(conflict.localData, conflict.remoteData);
    } else {
      // Pull remote to local
      await this.pullIssue(conflict.remoteData, conflict.localData);
    }

    // Update state
    const state = this.loadState();
    state.issues[conflict.issueNumber] = {
      localHash: this.mapper.hashTask(conflict.localData),
      remoteHash: this.mapper.hashIssue(conflict.remoteData),
      lastSyncedAt: new Date().toISOString(),
    };
    this.saveState(state);
  }

  /**
   * Get task status from filepath
   */
  private getTaskStatus(filepath: string): 'backlog' | 'active' | 'completed' {
    if (filepath.includes('/backlog/')) return 'backlog';
    if (filepath.includes('/active/')) return 'active';
    if (filepath.includes('/completed/')) return 'completed';
    return 'backlog';
  }
}
