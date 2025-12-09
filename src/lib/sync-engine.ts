/**
 * Core sync engine with change detection and state management
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { GitHubClient } from './github-client';
import { FieldMapper } from './field-mapper';
import {
  SyncState,
  SyncConflict,
  SyncResult,
  TaskDocument,
  TaskFrontmatter,
  GitHubIssueData,
  SyncFilter,
} from './types';
import { ParserRegistry, ISourceParser, SourceType } from './parsers';

export class SyncEngine {
  private github: GitHubClient;
  private registry: ParserRegistry;
  private mapper: FieldMapper;
  private stateFile: string;
  private githubRepo: string;

  constructor(
    github: GitHubClient,
    registry: ParserRegistry,
    mapper: FieldMapper,
    projectRoot: string,
    githubRepo: string
  ) {
    this.github = github;
    this.registry = registry;
    this.mapper = mapper;
    this.stateFile = path.join(projectRoot, '.sync-state.json');
    this.githubRepo = githubRepo;
  }

  /**
   * Get parser for a task based on its sourceType
   */
  private getParserForTask(task: TaskDocument): ISourceParser {
    const sourceType = task.sourceType || 'tasks';
    const parser = this.registry.get(sourceType);
    if (!parser) {
      throw new Error(`No parser registered for source type: ${sourceType}`);
    }
    return parser;
  }

  /**
   * Discover tasks from all registered parsers (or filtered by source types)
   */
  private async discoverAllTasks(
    filter?: SyncFilter,
    sourceTypes?: (SourceType | 'all')[]
  ): Promise<TaskDocument[]> {
    const parsers = sourceTypes
      ? this.registry.getByTypes(sourceTypes)
      : this.registry.getAll();

    const allTasks: TaskDocument[] = [];

    for (const parser of parsers) {
      try {
        const tasks = await parser.discoverTasks(filter);
        allTasks.push(...tasks);
      } catch (error: any) {
        // If filtering by filepath and this parser doesn't handle it, skip
        if (filter?.filepath && error.message.includes('not found')) {
          continue;
        }
        throw error;
      }
    }

    return allTasks;
  }

  /**
   * Discover new tasks (without issue numbers) from all registered parsers
   */
  private async discoverAllNewTasks(
    sourceTypes?: (SourceType | 'all')[]
  ): Promise<TaskDocument[]> {
    const parsers = sourceTypes
      ? this.registry.getByTypes(sourceTypes)
      : this.registry.getAll();

    const allTasks: TaskDocument[] = [];

    for (const parser of parsers) {
      const tasks = await parser.discoverNewTasks();
      allTasks.push(...tasks);
    }

    return allTasks;
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
   * Detect and handle orphaned tasks (local files where GitHub issue was deleted)
   */
  private async detectOrphanedTasks(
    tasks: TaskDocument[],
    issues: Map<number, GitHubIssueData>
  ): Promise<number[]> {
    const orphaned: number[] = [];

    for (const task of tasks) {
      if (!issues.has(task.issueNumber)) {
        orphaned.push(task.issueNumber);
      }
    }

    return orphaned;
  }

  /**
   * Clean up orphaned tasks (delete local files where GitHub issue was deleted)
   */
  async cleanOrphanedTasks(sourceTypes?: (SourceType | 'all')[]): Promise<{
    deleted: string[];
    skipped: string[];
  }> {
    const tasks = await this.discoverAllTasks(undefined, sourceTypes);
    const issueNumbers = tasks.map((t) => t.issueNumber);
    const issues = await this.github.getIssues(issueNumbers);

    const orphanedNumbers = await this.detectOrphanedTasks(tasks, issues);

    if (orphanedNumbers.length === 0) {
      console.log(chalk.green('✓ No orphaned tasks found'));
      return { deleted: [], skipped: [] };
    }

    // Build map of issue number to all tasks with that number (handles duplicates)
    const orphanedTasksByNumber = new Map<number, TaskDocument[]>();
    for (const num of orphanedNumbers) {
      const matchingTasks = tasks.filter((t) => t.issueNumber === num);
      if (matchingTasks.length > 0) {
        orphanedTasksByNumber.set(num, matchingTasks);
      }
    }

    // Count unique orphaned issue numbers
    const uniqueOrphanedNumbers = Array.from(orphanedTasksByNumber.keys());

    // Show orphaned tasks (deduplicated by issue number)
    console.log(
      chalk.yellow(`\nFound ${uniqueOrphanedNumbers.length} orphaned issue(s) (GitHub issues were deleted):`)
    );
    uniqueOrphanedNumbers.forEach((num) => {
      const matchingTasks = orphanedTasksByNumber.get(num) || [];
      if (matchingTasks.length === 1) {
        console.log(chalk.yellow(`  - #${num}: ${matchingTasks[0].filename}`));
      } else {
        console.log(chalk.yellow(`  - #${num}: ${matchingTasks.length} files (duplicates)`));
        matchingTasks.forEach((task) => {
          const dirName = path.basename(path.dirname(task.filepath));
          console.log(chalk.gray(`      ${dirName}/${task.filename}`));
        });
      }
    });

    // Prompt for confirmation
    const inquirer = (await import('inquirer')).default;
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do with these orphaned files?',
        choices: [
          { name: 'Delete all orphaned files', value: 'delete_all' },
          { name: 'Review each file individually', value: 'review' },
          { name: 'Keep all files (skip cleanup)', value: 'skip' },
        ],
      },
    ]);

    const result = {
      deleted: [] as string[],
      skipped: [] as string[],
    };

    if (action === 'skip') {
      console.log(chalk.gray('Skipped cleanup'));
      uniqueOrphanedNumbers.forEach((num) => {
        const matchingTasks = orphanedTasksByNumber.get(num) || [];
        matchingTasks.forEach((task) => {
          result.skipped.push(task.filename);
        });
      });
      return result;
    }

    if (action === 'delete_all') {
      for (const num of uniqueOrphanedNumbers) {
        const matchingTasks = orphanedTasksByNumber.get(num) || [];
        for (const task of matchingTasks) {
          fs.unlinkSync(task.filepath);
          console.log(chalk.red(`✗ Deleted ${task.filename}`));
          result.deleted.push(task.filename);
        }
      }
    } else if (action === 'review') {
      for (const num of uniqueOrphanedNumbers) {
        const matchingTasks = orphanedTasksByNumber.get(num) || [];

        const displayName =
          matchingTasks.length === 1
            ? matchingTasks[0].filename
            : `issue #${num} (${matchingTasks.length} files)`;

        const { confirmDelete } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmDelete',
            message: `Delete ${displayName}?`,
            default: false,
          },
        ]);

        if (confirmDelete) {
          for (const task of matchingTasks) {
            fs.unlinkSync(task.filepath);
            console.log(chalk.red(`✗ Deleted ${task.filename}`));
            result.deleted.push(task.filename);
          }
        } else {
          for (const task of matchingTasks) {
            console.log(chalk.gray(`  Kept ${task.filename}`));
            result.skipped.push(task.filename);
          }
        }
      }
    }

    return result;
  }

  /**
   * Perform full bidirectional sync
   */
  async sync(filter?: SyncFilter, sourceTypes?: (SourceType | 'all')[]): Promise<SyncResult> {
    const state = this.loadState();
    const tasks = await this.discoverAllTasks(filter, sourceTypes);

    // Special handling for syncing an issue that doesn't have a local file yet
    if (filter?.issueNumber && tasks.length === 0) {
      const result: SyncResult = {
        pushed: [],
        pulled: [],
        conflicts: [],
        skipped: [],
        errors: [],
      };

      const issue = await this.github.getIssue(filter.issueNumber);
      if (!issue) {
        throw new Error(`Issue #${filter.issueNumber} not found on GitHub`);
      }

      // Create local file from GitHub issue
      try {
        const { frontmatter: partialFrontmatter, body } = this.mapper.githubToTask(issue);
        const status = partialFrontmatter.status || 'backlog';

        // Ensure all required fields are present
        const completeFrontmatter: TaskFrontmatter = {
          created_utc: partialFrontmatter.created_utc || new Date().toISOString(),
          reporter: partialFrontmatter.reporter || 'unknown',
          title: partialFrontmatter.title || issue.title,
          severity: partialFrontmatter.severity || 'P2',
          priority: partialFrontmatter.priority || 'medium',
          component: partialFrontmatter.component || [],
          labels: partialFrontmatter.labels || [],
          ...partialFrontmatter
        } as TaskFrontmatter;

        // Use the first registered parser (usually 'tasks') for creating new files
        const defaultParser = this.registry.getAll()[0];
        if (!defaultParser) {
          throw new Error('No parsers registered');
        }
        const task = await defaultParser.createTask(issue.number, completeFrontmatter, body, status);

        result.pulled.push(issue.number);

        // Update state
        state.issues[issue.number] = {
          localHash: this.mapper.hashTask(task),
          remoteHash: this.mapper.hashIssue(issue),
          lastSyncedAt: new Date().toISOString(),
        };
        state.lastSync = new Date().toISOString();
        this.saveState(state);
      } catch (error: any) {
        result.errors.push({
          issueNumber: filter.issueNumber,
          error: error.message,
        });
      }

      return result;
    }

    console.log(`Found ${tasks.length} local tasks`);

    // Fetch all corresponding GitHub issues
    const issueNumbers = tasks.map((t) => t.issueNumber);
    const issues = await this.github.getIssues(issueNumbers);

    console.log(`Found ${issues.size} GitHub issues`);

    // Detect orphaned tasks (where GitHub issue was deleted)
    const orphanedNumbers = await this.detectOrphanedTasks(tasks, issues);

    if (orphanedNumbers.length > 0) {
      // Deduplicate orphaned numbers and build task map
      const orphanedTasksByNumber = new Map<number, TaskDocument[]>();
      for (const num of orphanedNumbers) {
        const matchingTasks = tasks.filter((t) => t.issueNumber === num);
        if (matchingTasks.length > 0) {
          orphanedTasksByNumber.set(num, matchingTasks);
        }
      }

      const uniqueOrphanedNumbers = Array.from(orphanedTasksByNumber.keys());

      console.warn(
        chalk.yellow(`\n⚠ Warning: Found ${uniqueOrphanedNumbers.length} numbered file(s) without GitHub issues:`)
      );
      uniqueOrphanedNumbers.forEach((num) => {
        const matchingTasks = orphanedTasksByNumber.get(num) || [];
        if (matchingTasks.length === 1) {
          console.warn(chalk.yellow(`  - #${num}: ${matchingTasks[0].filename}`));
        } else {
          console.warn(chalk.yellow(`  - #${num}: ${matchingTasks.length} files (duplicates)`));
          matchingTasks.forEach((task) => {
            const dirName = path.basename(path.dirname(task.filepath));
            console.warn(chalk.gray(`      ${dirName}/${task.filename}`));
          });
        }
      });
      console.log(
        chalk.gray('\nThese files have issue numbers but no corresponding GitHub issues.')
      );
      console.log(
        chalk.gray('They will be skipped during sync. Use "sync --create" to rename and create as new issues.')
      );
      console.log('');
    }

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
          // Issue doesn't exist on GitHub - skip (was deleted or never created)
          result.skipped.push(task.issueNumber);
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
          // Only local changed - sync status before push
          const updatedTask = await this.ensureStatusSync(task);
          await this.pushTask(updatedTask, issue);
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
   * Ensure status field is synced with folder location
   * Resolves conflicts, fills missing status, updates timestamps
   * Note: Only works for parsers that support status resolution (e.g., TasksParser)
   */
  async ensureStatusSync(task: TaskDocument): Promise<TaskDocument> {
    const parser = this.getParserForTask(task);

    // Only resolve status for parsers that support it
    if (!parser.resolveStatusConflict) {
      return task;
    }

    const resolvedStatus = parser.resolveStatusConflict(task);

    // If status needs updating
    if (task.frontmatter.status !== resolvedStatus) {
      const updatedFrontmatter = {
        ...task.frontmatter,
        status: resolvedStatus,
        status_last_modified: new Date().toISOString(),
      };

      const updatedTask = {
        ...task,
        frontmatter: updatedFrontmatter,
      };

      // Write back to file
      await parser.writeTask(updatedTask);

      return updatedTask;
    }

    // If status missing but matches folder, just add it
    if (!task.frontmatter.status) {
      const updatedFrontmatter = {
        ...task.frontmatter,
        status: resolvedStatus,
        status_last_modified: new Date().toISOString(),
      };

      const updatedTask = {
        ...task,
        frontmatter: updatedFrontmatter,
      };

      await parser.writeTask(updatedTask);

      return updatedTask;
    }

    return task;
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
   * Pull GitHub issue to local task (updates slug from GitHub title)
   */
  async pullIssue(issue: GitHubIssueData, existingTask: TaskDocument): Promise<void> {
    const { frontmatter, body } = this.mapper.githubToTask(issue, existingTask);
    const parser = this.getParserForTask(existingTask);

    // Update task
    let updatedTask: TaskDocument = {
      ...existingTask,
      frontmatter: {
        ...existingTask.frontmatter,
        ...frontmatter,
      },
      body,
    };

    // Always regenerate slug from GitHub title on pull
    if (frontmatter.title) {
      try {
        const newFilepath = await parser.renameTask(
          existingTask.filepath,
          existingTask.issueNumber,
          frontmatter.title // Pass GitHub title for slug generation
        );
        updatedTask = {
          ...updatedTask,
          filepath: newFilepath,
          filename: path.basename(newFilepath),
        };
      } catch (error: any) {
        // If rename fails (e.g., file already exists), continue without renaming
        console.warn(`Could not rename ${existingTask.filename}: ${error.message}`);
      }
    }

    // Move to correct directory if status changed (only for parsers that support it)
    const newStatus = frontmatter.status || existingTask.frontmatter.status || 'backlog';
    const currentStatus = this.getTaskStatus(updatedTask.filepath);

    if (newStatus !== currentStatus && parser.moveTask) {
      const movedTask = await parser.moveTask(updatedTask, newStatus);
      await parser.writeTask(movedTask);
    } else {
      await parser.writeTask(updatedTask);
    }

    console.log(`✓ Pulled #${issue.number} from GitHub`);
  }

  /**
   * Push only - update GitHub from local
   */
  async pushOnly(filter?: SyncFilter, sourceTypes?: (SourceType | 'all')[]): Promise<SyncResult> {
    const state = this.loadState();
    const tasks = await this.discoverAllTasks(filter, sourceTypes);
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
  async pullOnly(filter?: SyncFilter, sourceTypes?: (SourceType | 'all')[]): Promise<SyncResult> {
    const state = this.loadState();
    const tasks = await this.discoverAllTasks(filter, sourceTypes);

    // Special handling for pulling an issue that doesn't have a local file yet
    if (filter?.issueNumber && tasks.length === 0) {
      const result: SyncResult = {
        pushed: [],
        pulled: [],
        conflicts: [],
        skipped: [],
        errors: [],
      };

      const issue = await this.github.getIssue(filter.issueNumber);
      if (!issue) {
        throw new Error(`Issue #${filter.issueNumber} not found on GitHub`);
      }

      // Create local file from GitHub issue
      try {
        const { frontmatter: partialFrontmatter, body } = this.mapper.githubToTask(issue);
        const status = partialFrontmatter.status || 'backlog';

        // Ensure all required fields are present
        const completeFrontmatter: TaskFrontmatter = {
          created_utc: partialFrontmatter.created_utc || new Date().toISOString(),
          reporter: partialFrontmatter.reporter || 'unknown',
          title: partialFrontmatter.title || issue.title,
          severity: partialFrontmatter.severity || 'P2',
          priority: partialFrontmatter.priority || 'medium',
          component: partialFrontmatter.component || [],
          labels: partialFrontmatter.labels || [],
          ...partialFrontmatter
        } as TaskFrontmatter;

        // Use the first registered parser (usually 'tasks') for creating new files
        const defaultParser = this.registry.getAll()[0];
        if (!defaultParser) {
          throw new Error('No parsers registered');
        }
        const task = await defaultParser.createTask(issue.number, completeFrontmatter, body, status);

        result.pulled.push(issue.number);

        // Update state
        state.issues[issue.number] = {
          localHash: this.mapper.hashTask(task),
          remoteHash: this.mapper.hashIssue(issue),
          lastSyncedAt: new Date().toISOString(),
        };
        state.lastSync = new Date().toISOString();
        this.saveState(state);
      } catch (error: any) {
        result.errors.push({
          issueNumber: filter.issueNumber,
          error: error.message,
        });
      }

      return result;
    }

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
  async status(filter?: SyncFilter, sourceTypes?: (SourceType | 'all')[]): Promise<{
    toSync: number[];
    conflicts: SyncConflict[];
  }> {
    const state = this.loadState();
    const tasks = await this.discoverAllTasks(filter, sourceTypes);

    // Special handling for checking status of an issue without a local file
    if (filter?.issueNumber && tasks.length === 0) {
      const issue = await this.github.getIssue(filter.issueNumber);
      if (!issue) {
        throw new Error(`Issue #${filter.issueNumber} not found on GitHub`);
      }
      // Issue exists on GitHub but not locally - needs sync
      return { toSync: [filter.issueNumber], conflicts: [] };
    }

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
   * Rename numbered files that don't have corresponding GitHub issues.
   * These files likely had numbers manually assigned but were never synced.
   * Removes the number prefix so they can be created as new issues.
   * Note: Only works for tasks source (docs/tasks/)
   */
  private async renameOrphanedNumberedFiles(): Promise<void> {
    const tasksParser = this.registry.get('tasks');
    if (!tasksParser) {
      return; // No tasks parser registered
    }

    const allTasks = await tasksParser.discoverTasks();

    if (allTasks.length === 0) {
      return;
    }

    // Get all issue numbers from discovered tasks
    const issueNumbers = allTasks.map(t => t.issueNumber);

    // Check which issues actually exist on GitHub
    const existingIssues = await this.github.getIssues(issueNumbers);

    // Find tasks with numbers that don't exist on GitHub
    const orphanedTasks = allTasks.filter(task => !existingIssues.has(task.issueNumber));

    if (orphanedTasks.length === 0) {
      return;
    }

    console.log(chalk.yellow(`\nFound ${orphanedTasks.length} numbered file(s) without GitHub issues.`));
    console.log(chalk.yellow('These will be renamed to remove numbers and treated as new issues.\n'));

    for (const task of orphanedTasks) {
      const oldPath = task.filepath;
      const oldFilename = task.filename;

      // Remove the number prefix (e.g., "011-foo.md" -> "foo.md")
      const newFilename = oldFilename.replace(/^\d+-/, '');
      const newPath = path.join(path.dirname(oldPath), newFilename);

      // Check if target filename already exists
      if (fs.existsSync(newPath)) {
        console.log(chalk.red(`  ✗ Cannot rename ${oldFilename} -> ${newFilename} (file already exists)`));
        continue;
      }

      try {
        fs.renameSync(oldPath, newPath);
        console.log(chalk.green(`  ✓ Renamed ${oldFilename} -> ${newFilename}`));
      } catch (error: any) {
        console.log(chalk.red(`  ✗ Failed to rename ${oldFilename}: ${error.message}`));
      }
    }

    console.log(); // Empty line for spacing
  }

  /**
   * Create new GitHub issues from local files without issue numbers
   *
   * Files are discovered (must not have NNN- prefix), issues created on GitHub,
   * then files renamed with GitHub-assigned issue number (not manual numbering).
   * This ensures local files always match GitHub's authoritative issue numbers.
   */
  async createNewIssues(): Promise<{
    created: Array<{ filename: string; issueNumber: number; newFilename: string }>;
    errors: Array<{ filename: string; error: string }>;
  }> {
    const result = {
      created: [] as Array<{ filename: string; issueNumber: number; newFilename: string }>,
      errors: [] as Array<{ filename: string; error: string }>,
    };

    // First, handle numbered files that don't have GitHub issues
    await this.renameOrphanedNumberedFiles();

    // Discover files without issue numbers (from all parsers)
    const newTasks = await this.discoverAllNewTasks();

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
          // Filter out non-conforming labels (must be key:value format)
          const validLabels = task.frontmatter.labels.filter(label =>
            label.includes(':') &&
            label.indexOf(':') > 0 &&
            label.indexOf(':') < label.length - 1
          );
          labels.push(...validLabels);
        }
        if (task.frontmatter.type) {
          labels.push(`type:${task.frontmatter.type}`);
        }

        // Ensure all labels exist on GitHub before creating issue
        await this.github.ensureLabels(labels);

        // Get GitHub-formatted issue data from mapper (includes cleaned title)
        const githubData = this.mapper.taskToGitHub(task);

        // Write body to temp file to avoid shell escaping issues
        const tempBodyFile = path.join('/tmp', `gh-body-${task.issueNumber || Date.now()}.txt`);
        fs.writeFileSync(tempBodyFile, githubData.body, 'utf-8');

        // Build gh command using temp file and cleaned title from mapper
        let ghCommand = `gh issue create --repo "${this.githubRepo}" --title "${githubData.title.replace(/"/g, '\\"')}"`;

        // Add body from temp file (avoids shell escaping hell)
        ghCommand += ` --body-file "${tempBodyFile}"`;

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

        // Clean up temp file
        fs.unlinkSync(tempBodyFile);

        // Parse issue number from output URL (e.g., https://github.com/owner/repo/issues/123)
        const urlMatch = output.match(/https:\/\/github\.com\/.+\/issues\/(\d+)/);
        if (!urlMatch) {
          throw new Error(`Failed to parse issue number from gh output: ${output}`);
        }

        const issueNumber = parseInt(urlMatch[1], 10);
        console.log(`✓ Created issue #${issueNumber}`);

        // Get the parser for this task
        const taskParser = this.getParserForTask(task);

        // Rename file with GitHub-assigned number (always use GitHub's numbering, never manual)
        const newFilepath = await taskParser.renameTask(task.filepath, issueNumber);
        const newFilename = path.basename(newFilepath);

        result.created.push({
          filename: oldFilename,
          issueNumber,
          newFilename,
        });

        // Update sync state - re-discover task to get updated state
        const updatedTasks = await taskParser.discoverTasks({ issueNumber });
        const updatedTask = updatedTasks[0];
        const issue = await this.github.getIssue(issueNumber);

        if (issue && updatedTask) {
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
