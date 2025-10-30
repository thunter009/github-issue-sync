/**
 * Markdown parser for task documents with YAML frontmatter
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { TaskDocument, TaskFrontmatter } from './types';

export class MarkdownParser {
  private tasksDir: string;

  constructor(projectRoot: string) {
    this.tasksDir = path.join(projectRoot, 'docs', 'tasks');
  }

  /**
   * Discover all task markdown files
   */
  async discoverTasks(): Promise<TaskDocument[]> {
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

        // Extract issue number from filename (NNN-slug.md)
        const match = file.match(/^(\d+)-/);
        if (!match) {
          continue; // Skip files without issue number
        }

        const issueNumber = parseInt(match[1], 10);
        const filepath = path.join(dirPath, file);

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

    return {
      issueNumber,
      filename: path.basename(filepath),
      filepath,
      frontmatter: data as TaskFrontmatter,
      body: body.trim(),
      lastModified: stats.mtime,
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

    const task: TaskDocument = {
      issueNumber,
      filename,
      filepath,
      frontmatter,
      body: body.trim(),
      lastModified: new Date(),
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
}
