/**
 * OpenSpec parser for openspec/changes/{name}/tasks.md files
 * Syncs each change folder as a single GitHub issue with checklist body
 */

import fs from 'fs';
import path from 'path';
import { TaskDocument, TaskFrontmatter, SyncFilter } from '../types';
import { ISourceParser, SourceType, TaskStatus } from './types';
import { OpenSpecMetaHandler, OpenSpecMeta } from './openspec-meta';

export class OpenSpecParser implements ISourceParser {
  readonly sourceType: SourceType = 'openspec';
  private changesDir: string;
  private taskFileName: string;

  constructor(projectRoot: string, taskFileName: string = 'tasks.md') {
    this.changesDir = path.join(projectRoot, 'openspec', 'changes');
    this.taskFileName = taskFileName;
  }

  /**
   * Discover all OpenSpec tasks (one per change folder)
   */
  async discoverTasks(filter?: SyncFilter): Promise<TaskDocument[]> {
    const tasks: TaskDocument[] = [];

    if (!fs.existsSync(this.changesDir)) {
      return tasks;
    }

    // If filtering by filepath, check if it's an openspec path
    if (filter?.filepath) {
      if (!filter.filepath.includes('openspec/changes/')) {
        return tasks; // Not an openspec file
      }

      const changePath = this.getChangePathFromFilepath(filter.filepath);
      if (!changePath) {
        throw new Error(`Invalid OpenSpec path: ${filter.filepath}`);
      }

      const task = await this.parseChangeFolder(changePath);
      if (task) {
        tasks.push(task);
      }
      return tasks;
    }

    // Discover all change folders
    const changeFolders = fs.readdirSync(this.changesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const folder of changeFolders) {
      const changePath = path.join(this.changesDir, folder);
      const tasksFile = path.join(changePath, this.taskFileName);

      if (!fs.existsSync(tasksFile)) {
        continue; // Skip folders without tasks.md
      }

      try {
        const task = await this.parseChangeFolder(changePath);
        if (task) {
          // Apply issue number filter if specified
          if (filter?.issueNumber && task.issueNumber !== filter.issueNumber) {
            continue;
          }
          tasks.push(task);
        }
      } catch (error: any) {
        console.warn(`Warning: Failed to parse ${changePath}: ${error.message}`);
      }
    }

    return tasks;
  }

  /**
   * Discover change folders without GitHub issues
   */
  async discoverNewTasks(): Promise<TaskDocument[]> {
    const tasks: TaskDocument[] = [];

    if (!fs.existsSync(this.changesDir)) {
      return tasks;
    }

    const changeFolders = fs.readdirSync(this.changesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const folder of changeFolders) {
      const changePath = path.join(this.changesDir, folder);
      const tasksFile = path.join(changePath, this.taskFileName);

      if (!fs.existsSync(tasksFile)) {
        continue;
      }

      // Check if already has GitHub issue
      const meta = OpenSpecMetaHandler.load(changePath);
      if (meta?.github_issue) {
        continue; // Already has issue
      }

      try {
        const task = await this.parseChangeFolder(changePath);
        if (task) {
          tasks.push(task);
        }
      } catch (error: any) {
        console.warn(`Warning: Failed to parse ${changePath}: ${error.message}`);
      }
    }

    return tasks;
  }

  /**
   * Parse a change folder into TaskDocument
   */
  private async parseChangeFolder(changePath: string): Promise<TaskDocument | null> {
    const tasksFile = path.join(changePath, this.taskFileName);

    if (!fs.existsSync(tasksFile)) {
      return null;
    }

    const changeName = path.basename(changePath);
    const content = fs.readFileSync(tasksFile, 'utf-8');
    const meta = OpenSpecMetaHandler.load(changePath);

    const stats = fs.statSync(tasksFile);
    const dirStats = fs.statSync(changePath);

    // Parse proposal.md for additional context if exists
    const proposalPath = path.join(changePath, 'proposal.md');
    let description = '';
    if (fs.existsSync(proposalPath)) {
      const proposalContent = fs.readFileSync(proposalPath, 'utf-8');
      // Extract first paragraph as description
      const match = proposalContent.match(/^#[^\n]*\n+([^\n]+)/);
      if (match) {
        description = match[1].trim();
      }
    }

    // Generate synthetic frontmatter
    const frontmatter: TaskFrontmatter = {
      title: this.formatTitle(changeName),
      created_utc: meta?.created || dirStats.birthtime.toISOString(),
      reporter: 'openspec',
      severity: 'P2',
      priority: 'medium',
      component: ['openspec'],
      labels: ['source:openspec', `change:${changeName}`],
      status: this.inferStatus(changePath, content),
    };

    // Build body with description and tasks
    let body = '';
    if (description) {
      body = `${description}\n\n---\n\n`;
    }
    body += content;

    return {
      issueNumber: meta?.github_issue || -1,
      filename: this.taskFileName,
      filepath: tasksFile,
      frontmatter,
      body: body.trim(),
      lastModified: stats.mtime,
      folderLastModified: dirStats.mtime,
      sourceType: 'openspec',
    };
  }

  /**
   * Write task back to source (update tasks.md from GitHub)
   */
  async writeTask(task: TaskDocument): Promise<void> {
    const changePath = path.dirname(task.filepath);

    // Extract just the tasks content (strip description prefix if present)
    let content = task.body;
    const separatorMatch = content.match(/^[^\n]*\n*---\n\n/);
    if (separatorMatch) {
      content = content.substring(separatorMatch[0].length);
    }

    fs.writeFileSync(task.filepath, content, 'utf-8');

    // Update metadata
    OpenSpecMetaHandler.update(changePath, {
      github_issue: task.issueNumber,
      last_synced: new Date().toISOString(),
    });
  }

  /**
   * Create a new task (creates change folder with tasks.md)
   */
  async createTask(
    issueNumber: number,
    frontmatter: TaskFrontmatter,
    body: string,
    _status?: TaskStatus
  ): Promise<TaskDocument> {
    const slug = this.generateSlug(frontmatter.title);
    const changePath = path.join(this.changesDir, slug);
    const tasksFile = path.join(changePath, this.taskFileName);

    // Create change folder if doesn't exist
    if (!fs.existsSync(changePath)) {
      fs.mkdirSync(changePath, { recursive: true });
    }

    // Write tasks.md
    fs.writeFileSync(tasksFile, body, 'utf-8');

    // Save metadata
    OpenSpecMetaHandler.save(changePath, {
      github_issue: issueNumber,
      created: new Date().toISOString(),
      last_synced: new Date().toISOString(),
    });

    const stats = fs.statSync(tasksFile);
    const dirStats = fs.statSync(changePath);

    return {
      issueNumber,
      filename: this.taskFileName,
      filepath: tasksFile,
      frontmatter,
      body: body.trim(),
      lastModified: stats.mtime,
      folderLastModified: dirStats.mtime,
      sourceType: 'openspec',
    };
  }

  /**
   * Check if task exists for issue number
   */
  taskExists(issueNumber: number): boolean {
    if (!fs.existsSync(this.changesDir)) {
      return false;
    }

    const changeFolders = fs.readdirSync(this.changesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const folder of changeFolders) {
      const changePath = path.join(this.changesDir, folder);
      const meta = OpenSpecMetaHandler.load(changePath);
      if (meta?.github_issue === issueNumber) {
        return true;
      }
    }

    return false;
  }

  /**
   * Rename task (update metadata with issue number)
   */
  async renameTask(oldFilepath: string, issueNumber: number, _newTitle?: string): Promise<string> {
    const changePath = path.dirname(oldFilepath);

    // Just update the metadata, don't rename the folder
    OpenSpecMetaHandler.update(changePath, {
      github_issue: issueNumber,
      last_synced: new Date().toISOString(),
    });

    return oldFilepath;
  }

  /**
   * Get change folder path from a filepath inside it
   */
  private getChangePathFromFilepath(filepath: string): string | null {
    // Find the openspec/changes/xxx part
    const match = filepath.match(/openspec\/changes\/([^/]+)/);
    if (!match) {
      return null;
    }
    return path.join(this.changesDir, match[1]);
  }

  /**
   * Format change folder name as title
   */
  private formatTitle(changeName: string): string {
    // Convert kebab-case to Title Case
    return changeName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Infer status from content (all checkboxes checked = completed)
   */
  private inferStatus(changePath: string, content: string): TaskStatus {
    // Check for archived marker
    const archivedPath = path.join(changePath, '.archived');
    if (fs.existsSync(archivedPath)) {
      return 'completed';
    }

    // Count checkboxes
    const checked = (content.match(/- \[x\]/gi) || []).length;
    const unchecked = (content.match(/- \[ \]/g) || []).length;
    const total = checked + unchecked;

    if (total === 0) {
      return 'backlog';
    }

    if (checked === total) {
      return 'completed';
    }

    if (checked > 0) {
      return 'active';
    }

    return 'backlog';
  }

  /**
   * Generate URL-friendly slug from title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80);
  }
}
