/**
 * Markdown parser for task documents with YAML frontmatter
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { TaskDocument, TaskFrontmatter, SyncFilter } from './types';

export class MarkdownParser {
  private tasksDir: string;

  constructor(projectRoot: string) {
    this.tasksDir = path.join(projectRoot, 'docs', 'tasks');
  }

  /**
   * Discover all task markdown files
   */
  async discoverTasks(filter?: SyncFilter): Promise<TaskDocument[]> {
    const tasks: TaskDocument[] = [];

    // If filtering by filepath, try to load that specific file
    if (filter?.filepath) {
      // Check if file exists
      if (!fs.existsSync(filter.filepath)) {
        throw new Error(`File not found: ${filter.filepath}`);
      }

      // Extract issue number from filename
      const filename = path.basename(filter.filepath);
      const match = filename.match(/^(\d+)-/);
      if (!match) {
        throw new Error(`File does not have issue number in name: ${filename}`);
      }

      const issueNumber = parseInt(match[1], 10);

      try {
        const task = await this.parseTask(filter.filepath, issueNumber);
        tasks.push(task);
      } catch (error: any) {
        throw new Error(`Failed to parse ${filter.filepath}: ${error.message}`);
      }

      return tasks;
    }

    const subdirs = ['backlog', 'active', 'completed'];

    for (const subdir of subdirs) {
      const dirPath = path.join(this.tasksDir, subdir);

      if (!fs.existsSync(dirPath)) {
        continue;
      }

      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        if (!file.endsWith('.md') || file === 'README.md') {
          continue;
        }

        // Extract issue number from filename (NNN-slug.md)
        const match = file.match(/^(\d+)-/);
        if (!match) {
          continue; // Skip files without issue number
        }

        const issueNumber = parseInt(match[1], 10);
        const filepath = path.join(dirPath, file);

        // Apply issue number filter if specified
        if (filter?.issueNumber && filter.issueNumber !== issueNumber) {
          continue;
        }

        try {
          const task = await this.parseTask(filepath, issueNumber);
          tasks.push(task);
        } catch (error: any) {
          console.warn(`Warning: Failed to parse ${filepath}: ${error.message}`);
        }
      }
    }

    return tasks;
  }

  /**
   * Parse a single task file
   */
  async parseTask(filepath: string, issueNumber: number): Promise<TaskDocument> {
    const content = fs.readFileSync(filepath, 'utf-8');
    const { data, content: body } = matter(content);

    // Validate frontmatter
    if (!data.title || !data.created_utc) {
      throw new Error(`Missing required frontmatter fields in ${filepath}`);
    }

    const stats = fs.statSync(filepath);
    const dirPath = path.dirname(filepath);
    const dirStats = fs.statSync(dirPath);

    return {
      issueNumber,
      filename: path.basename(filepath),
      filepath,
      frontmatter: data as TaskFrontmatter,
      body: body.trim(),
      lastModified: stats.mtime,
      folderLastModified: dirStats.mtime,
    };
  }

  /**
   * Write task to markdown file
   */
  async writeTask(task: TaskDocument): Promise<void> {
    // Remove undefined values from frontmatter (gray-matter can't serialize them)
    const cleanFrontmatter = Object.fromEntries(
      Object.entries(task.frontmatter).filter(([_, v]) => v !== undefined)
    );

    const content = matter.stringify(task.body, cleanFrontmatter);
    fs.writeFileSync(task.filepath, content, 'utf-8');
  }

  /**
   * Create a new task file
   */
  async createTask(
    issueNumber: number,
    frontmatter: TaskFrontmatter,
    body: string,
    status: 'backlog' | 'active' | 'completed' = 'backlog'
  ): Promise<TaskDocument> {
    // Generate filename from issue number and title
    const slug = this.generateSlug(frontmatter.title);
    const filename = `${String(issueNumber).padStart(3, '0')}-${slug}.md`;
    const filepath = path.join(this.tasksDir, status, filename);

    // Check if file already exists
    if (fs.existsSync(filepath)) {
      throw new Error(`Task file already exists: ${filepath}`);
    }

    const dirPath = path.dirname(filepath);
    const dirStats = fs.statSync(dirPath);

    const task: TaskDocument = {
      issueNumber,
      filename,
      filepath,
      frontmatter,
      body: body.trim(),
      lastModified: new Date(),
      folderLastModified: dirStats.mtime,
    };

    await this.writeTask(task);

    return task;
  }

  /**
   * Move task to different status directory
   */
  async moveTask(
    task: TaskDocument,
    newStatus: 'backlog' | 'active' | 'completed'
  ): Promise<TaskDocument> {
    const newFilepath = path.join(this.tasksDir, newStatus, task.filename);

    // Check if already in correct directory
    if (task.filepath === newFilepath) {
      return task;
    }

    // Move file
    fs.renameSync(task.filepath, newFilepath);

    return {
      ...task,
      filepath: newFilepath,
    };
  }

  /**
   * Resolve status conflicts between frontmatter and folder location
   * Returns the winning status based on modification times
   */
  resolveStatusConflict(task: TaskDocument): 'backlog' | 'active' | 'completed' {
    const folderStatus = this.getStatusFromPath(task.filepath);
    const frontmatterStatus = task.frontmatter.status;

    // If frontmatter missing, use folder
    if (!frontmatterStatus) {
      return folderStatus;
    }

    // If they agree, no conflict
    if (frontmatterStatus === folderStatus) {
      return frontmatterStatus;
    }

    // Conflict detected - compare timestamps
    const statusTimestamp = task.frontmatter.status_last_modified
      ? new Date(task.frontmatter.status_last_modified)
      : new Date(0); // If missing, folder wins

    // Most recent change wins
    if (task.folderLastModified > statusTimestamp) {
      return folderStatus;
    } else {
      return frontmatterStatus;
    }
  }

  /**
   * Get status from filepath
   */
  private getStatusFromPath(filepath: string): 'backlog' | 'active' | 'completed' {
    if (filepath.includes('/backlog/')) return 'backlog';
    if (filepath.includes('/active/')) return 'active';
    if (filepath.includes('/completed/')) return 'completed';
    return 'backlog';
  }

  /**
   * Generate URL-friendly slug from title
   */
  private generateSlug(title: string): string {
    // Remove [#NNN] prefix if present
    let slug = title.replace(/^\[#\d+\]\s*/, '');

    // Convert to lowercase and replace spaces/special chars with hyphens
    slug = slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Limit length
    return slug.substring(0, 80);
  }

  /**
   * Get task directory for status
   */
  getTaskDir(status: 'backlog' | 'active' | 'completed'): string {
    return path.join(this.tasksDir, status);
  }

  /**
   * Check if task file exists
   */
  taskExists(issueNumber: number): boolean {
    const subdirs = ['backlog', 'active', 'completed'];

    for (const subdir of subdirs) {
      const dirPath = path.join(this.tasksDir, subdir);

      if (!fs.existsSync(dirPath)) {
        continue;
      }

      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const match = file.match(/^(\d+)-/);
        if (match && parseInt(match[1], 10) === issueNumber) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Discover markdown files without issue numbers (for creation)
   */
  async discoverNewTasks(): Promise<TaskDocument[]> {
    const tasks: TaskDocument[] = [];

    const subdirs = ['backlog', 'active', 'completed'];

    for (const subdir of subdirs) {
      const dirPath = path.join(this.tasksDir, subdir);

      if (!fs.existsSync(dirPath)) {
        continue;
      }

      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        if (!file.endsWith('.md') || file === 'README.md') {
          continue;
        }

        // Skip files that already have issue numbers
        const match = file.match(/^(\d+)-/);
        if (match) {
          continue;
        }

        const filepath = path.join(dirPath, file);

        try {
          // Parse without issue number (use -1 as placeholder)
          const task = await this.parseTask(filepath, -1);
          tasks.push(task);
        } catch (error: any) {
          console.warn(`Warning: Failed to parse ${filepath}: ${error.message}`);
        }
      }
    }

    return tasks;
  }

  /**
   * Rename task file with new issue number and optionally new title
   */
  async renameTask(oldFilepath: string, issueNumber: number, newTitle?: string): Promise<string> {
    const dir = path.dirname(oldFilepath);
    const oldFilename = path.basename(oldFilepath);

    // Generate new filename with issue number
    let slug: string;

    if (newTitle) {
      // Use provided title to generate slug (e.g., from GitHub)
      slug = this.generateSlug(newTitle);
    } else {
      // Try to preserve existing slug if it looks reasonable
      const slugMatch = oldFilename.match(/^(?:\d+-)?(.+)\.md$/);
      if (slugMatch) {
        slug = slugMatch[1];
      } else {
        // Fall back to generating from title
        const content = fs.readFileSync(oldFilepath, 'utf-8');
        const { data } = matter(content);
        slug = this.generateSlug(data.title || 'untitled');
      }
    }

    const newFilename = `${String(issueNumber).padStart(3, '0')}-${slug}.md`;
    const newFilepath = path.join(dir, newFilename);

    // If filename is already correct, no need to rename
    if (oldFilepath === newFilepath) {
      return oldFilepath;
    }

    // Check if target file already exists
    if (fs.existsSync(newFilepath)) {
      throw new Error(`Cannot rename: file already exists at ${newFilepath}`);
    }

    // Rename the file
    fs.renameSync(oldFilepath, newFilepath);

    return newFilepath;
  }
}
