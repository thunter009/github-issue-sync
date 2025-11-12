/**
 * Core sync engine with change detection and state management
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
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
  private githubRepo: string;

  constructor(
    github: GitHubClient,
    parser: MarkdownParser,
    mapper: FieldMapper,
    projectRoot: string,
    githubRepo: string
  ) {
    this.github = github;
    this.parser = parser;
    this.mapper = mapper;
    this.stateFile = path.join(projectRoot, '.sync-state.json');
    this.githubRepo = githubRepo;
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
      // Issue number exists locally but not on GitHub - can't create with specific number
      console.warn(`Issue #${task.issueNumber} doesn't exist on GitHub - skipping (GitHub auto-assigns numbers)`);
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

  /**
   * Create new GitHub issues from local files without issue numbers
   */
  async createNewIssues(): Promise<{
    created: Array<{ filename: string; issueNumber: number; newFilename: string }>;
    errors: Array<{ filename: string; error: string }>;
  }> {
    const result = {
      created: [] as Array<{ filename: string; issueNumber: number; newFilename: string }>,
      errors: [] as Array<{ filename: string; error: string }>,
    };

    // Discover files without issue numbers
    const newTasks = await this.parser.discoverNewTasks();

    if (newTasks.length === 0) {
      console.log('No new tasks to create');
      return result;
    }

    console.log(`Found ${newTasks.length} new tasks to create on GitHub`);

    const state = this.loadState();

    for (const task of newTasks) {
      const oldFilename = task.filename;

      try {
        console.log(`Creating issue for ${oldFilename}...`);

        // Build labels array from frontmatter
        const labels: string[] = [];

        if (task.frontmatter.priority) {
          labels.push(`priority:${task.frontmatter.priority}`);
        }
        if (task.frontmatter.severity) {
          labels.push(`severity:${task.frontmatter.severity}`);
        }
        if (task.frontmatter.component) {
          const components = Array.isArray(task.frontmatter.component)
            ? task.frontmatter.component
            : [task.frontmatter.component];
          components.forEach((c) => labels.push(`component:${c}`));
        }
        if (task.frontmatter.labels) {
          labels.push(...task.frontmatter.labels);
        }
        if (task.frontmatter.type) {
          labels.push(`type:${task.frontmatter.type}`);
        }

        // Build gh command
        let ghCommand = `gh issue create --repo "${this.githubRepo}" --title "${task.frontmatter.title.replace(/"/g, '\\"')}"`;

        // Add body from file
        ghCommand += ` --body "$(cat "${task.filepath}")"`;

        // Add labels if any
        if (labels.length > 0) {
          ghCommand += ` --label "${labels.join(',')}"`;
        }

        // Add assignee if present
        if (task.frontmatter.assignee) {
          ghCommand += ` --assignee "${task.frontmatter.assignee}"`;
        }

        // Execute gh command and capture output
        const output = execSync(ghCommand, { encoding: 'utf-8' });

        // Parse issue number from output URL (e.g., https://github.com/owner/repo/issues/123)
        const urlMatch = output.match(/https:\/\/github\.com\/.+\/issues\/(\d+)/);
        if (!urlMatch) {
          throw new Error(`Failed to parse issue number from gh output: ${output}`);
        }

        const issueNumber = parseInt(urlMatch[1], 10);
        console.log(`✓ Created issue #${issueNumber}`);

        // Rename the file with the new issue number
        const newFilepath = await this.parser.renameTask(task.filepath, issueNumber);
        const newFilename = path.basename(newFilepath);

        result.created.push({
          filename: oldFilename,
          issueNumber,
          newFilename,
        });

        // Update sync state
        const updatedTask = await this.parser.parseTask(newFilepath, issueNumber);
        const issue = await this.github.getIssue(issueNumber);

        if (issue) {
          state.issues[issueNumber] = {
            localHash: this.mapper.hashTask(updatedTask),
            remoteHash: this.mapper.hashIssue(issue),
            lastSyncedAt: new Date().toISOString(),
          };
        }

        console.log(`✓ Renamed ${oldFilename} → ${newFilename}`);
      } catch (error: any) {
        console.error(`✗ Failed to create issue for ${oldFilename}: ${error.message}`);
        result.errors.push({
          filename: oldFilename,
          error: error.message,
        });
      }
    }

    // Save updated state
    this.saveState(state);

    return result;
  }
}
