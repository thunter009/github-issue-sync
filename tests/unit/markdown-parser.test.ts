import fs from 'fs';
import path from 'path';
import { MarkdownParser } from '../../src/lib/markdown-parser';
import { TaskFrontmatter } from '../../src/lib/types';

// Mock fs module
jest.mock('fs');

describe('MarkdownParser', () => {
  let parser: MarkdownParser;
  const projectRoot = '/test/project';
  const tasksDir = path.join(projectRoot, 'docs', 'tasks');

  beforeEach(() => {
    parser = new MarkdownParser(projectRoot);
    jest.clearAllMocks();
  });

  describe('discoverTasks', () => {
    it('should discover task files from all subdirectories', async () => {
      const mockFiles = {
        backlog: ['001-backlog-task.md', 'README.md', 'no-number.md'],
        active: ['002-active-task.md'],
        completed: ['003-completed-task.md'],
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir.includes('backlog')) return mockFiles.backlog;
        if (dir.includes('active')) return mockFiles.active;
        if (dir.includes('completed')) return mockFiles.completed;
        return [];
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(`---
created_utc: 2025-01-10T00:00:00Z
title: Test Task
severity: P2
priority: high
component: []
labels: []
reporter: thom
---

Task body`);

      (fs.statSync as jest.Mock).mockReturnValue({
        mtime: new Date('2025-01-10T12:00:00Z'),
      });

      const tasks = await parser.discoverTasks();

      expect(tasks).toHaveLength(3); // Only numbered files
      expect(tasks[0].issueNumber).toBe(1);
      expect(tasks[1].issueNumber).toBe(2);
      expect(tasks[2].issueNumber).toBe(3);
    });

    it('should skip non-markdown files and README', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        // Only return files for one subdirectory to avoid duplication
        if (dir.includes('backlog')) {
          return ['001-task.md', '002-task.txt', 'README.md', '.DS_Store'];
        }
        return [];
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(`---
created_utc: 2025-01-10T00:00:00Z
title: Test
severity: P2
priority: high
component: []
labels: []
reporter: thom
---

Body`);

      (fs.statSync as jest.Mock).mockReturnValue({
        mtime: new Date(),
      });

      const tasks = await parser.discoverTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].filename).toBe('001-task.md');
    });

    it('should handle missing directories gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const tasks = await parser.discoverTasks();

      expect(tasks).toHaveLength(0);
    });
  });

  describe('parseTask', () => {
    it('should parse task file with frontmatter', async () => {
      const filepath = path.join(tasksDir, 'active', '001-test.md');
      const content = `---
created_utc: 2025-01-10T00:00:00Z
title: Test Task
severity: P1
priority: high
type: bug
component:
  - auth
labels:
  - urgent
reporter: alice
assignee: bob
status: active
---

# Test Task

Task description here.`;

      (fs.readFileSync as jest.Mock).mockReturnValue(content);
      (fs.statSync as jest.Mock).mockReturnValue({
        mtime: new Date('2025-01-10T12:00:00Z'),
      });

      const task = await parser.parseTask(filepath, 1);

      expect(task.issueNumber).toBe(1);
      expect(task.filename).toBe('001-test.md');
      expect(task.filepath).toBe(filepath);
      expect(task.frontmatter.title).toBe('Test Task');
      expect(task.frontmatter.severity).toBe('P1');
      expect(task.frontmatter.priority).toBe('high');
      expect(task.frontmatter.type).toBe('bug');
      expect(task.frontmatter.component).toEqual(['auth']);
      expect(task.frontmatter.labels).toEqual(['urgent']);
      expect(task.body).toBe('# Test Task\n\nTask description here.');
    });

    it('should throw error for missing required fields', async () => {
      const filepath = path.join(tasksDir, 'active', '001-invalid.md');
      const content = `---
severity: P2
priority: high
---

Body`;

      (fs.readFileSync as jest.Mock).mockReturnValue(content);

      await expect(parser.parseTask(filepath, 1)).rejects.toThrow(
        'Missing required frontmatter fields'
      );
    });
  });

  describe('writeTask', () => {
    it('should write task to file', async () => {
      const task = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: path.join(tasksDir, 'active', '001-test.md'),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Test Task',
          severity: 'P2' as const,
          priority: 'high' as const,
          component: ['auth'],
          labels: ['urgent'],
          reporter: 'alice',
        },
        body: 'Task body',
        lastModified: new Date(),
      };

      await parser.writeTask(task);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        task.filepath,
        expect.stringContaining('title: Test Task'),
        'utf-8'
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        task.filepath,
        expect.stringContaining('Task body'),
        'utf-8'
      );
    });

    it('should filter out undefined frontmatter values', async () => {
      const task = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: path.join(tasksDir, 'active', '001-test.md'),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Test',
          severity: 'P2' as const,
          priority: 'high' as const,
          component: [],
          labels: [],
          reporter: 'alice',
          assignee: undefined,
          completed_utc: undefined,
        },
        body: 'Body',
        lastModified: new Date(),
      };

      await parser.writeTask(task);

      const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
      expect(writtenContent).not.toContain('assignee');
      expect(writtenContent).not.toContain('completed_utc');
    });
  });

  describe('createTask', () => {
    it('should create new task file', async () => {
      const frontmatter: TaskFrontmatter = {
        created_utc: '2025-01-10T00:00:00Z',
        title: 'New Feature Request',
        severity: 'P2',
        priority: 'medium',
        component: ['ui'],
        labels: [],
        reporter: 'alice',
      };

      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const task = await parser.createTask(5, frontmatter, 'Feature body', 'backlog');

      expect(task.issueNumber).toBe(5);
      expect(task.filename).toBe('005-new-feature-request.md');
      expect(task.filepath).toBe(path.join(tasksDir, 'backlog', '005-new-feature-request.md'));
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should throw error if file already exists', async () => {
      const frontmatter: TaskFrontmatter = {
        created_utc: '2025-01-10T00:00:00Z',
        title: 'Existing Task',
        severity: 'P2',
        priority: 'medium',
        component: [],
        labels: [],
        reporter: 'alice',
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await expect(
        parser.createTask(1, frontmatter, 'Body')
      ).rejects.toThrow('Task file already exists');
    });
  });

  describe('moveTask', () => {
    it('should move task to different status directory', async () => {
      const task = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: path.join(tasksDir, 'active', '001-test.md'),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Test',
          severity: 'P2' as const,
          priority: 'high' as const,
          component: [],
          labels: [],
          reporter: 'alice',
        },
        body: 'Body',
        lastModified: new Date(),
      };

      const movedTask = await parser.moveTask(task, 'completed');

      expect(fs.renameSync).toHaveBeenCalledWith(
        path.join(tasksDir, 'active', '001-test.md'),
        path.join(tasksDir, 'completed', '001-test.md')
      );
      expect(movedTask.filepath).toBe(path.join(tasksDir, 'completed', '001-test.md'));
    });

    it('should not move if already in correct directory', async () => {
      const task = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: path.join(tasksDir, 'active', '001-test.md'),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Test',
          severity: 'P2' as const,
          priority: 'high' as const,
          component: [],
          labels: [],
          reporter: 'alice',
        },
        body: 'Body',
        lastModified: new Date(),
      };

      const result = await parser.moveTask(task, 'active');

      expect(fs.renameSync).not.toHaveBeenCalled();
      expect(result).toBe(task);
    });
  });

  describe('generateSlug', () => {
    it('should generate URL-friendly slug', () => {
      const slug = (parser as any).generateSlug('Test Feature: User Authentication');

      expect(slug).toBe('test-feature-user-authentication');
    });

    it('should handle special characters', () => {
      const slug = (parser as any).generateSlug('Fix bug with @mentions & #hashtags!');

      expect(slug).toBe('fix-bug-with-mentions-hashtags');
    });

    it('should limit slug length', () => {
      const longTitle = 'A'.repeat(100);
      const slug = (parser as any).generateSlug(longTitle);

      expect(slug.length).toBeLessThanOrEqual(80);
    });

    it('should remove issue number prefix', () => {
      const slug = (parser as any).generateSlug('[#123] Fix authentication bug');

      expect(slug).toBe('fix-authentication-bug');
      expect(slug).not.toContain('123');
    });
  });

  describe('taskExists', () => {
    it('should return true if task file exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['001-test.md', '002-another.md']);

      const exists = parser.taskExists(1);

      expect(exists).toBe(true);
    });

    it('should return false if task file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['001-test.md', '002-another.md']);

      const exists = parser.taskExists(99);

      expect(exists).toBe(false);
    });

    it('should search across all subdirectories', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir.includes('completed')) return ['003-done.md'];
        return [];
      });

      const exists = parser.taskExists(3);

      expect(exists).toBe(true);
    });
  });

  describe('discoverNewTasks', () => {
    it('should discover files without issue numbers', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        // Only return files for one subdirectory
        if (dir.includes('backlog')) {
          return ['001-existing.md', 'new-task.md', 'another-new-task.md'];
        }
        return [];
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(`---
created_utc: 2025-01-10T00:00:00Z
title: New Task
severity: P2
priority: medium
component: []
labels: []
reporter: thom
---

Body`);

      (fs.statSync as jest.Mock).mockReturnValue({
        mtime: new Date(),
      });

      const tasks = await parser.discoverNewTasks();

      expect(tasks).toHaveLength(2);
      expect(tasks.every(t => t.issueNumber === -1)).toBe(true);
    });
  });

  describe('renameTask', () => {
    it('should rename task file with issue number', async () => {
      const oldFilepath = path.join(tasksDir, 'active', 'new-feature.md');
      const content = `---
created_utc: 2025-01-10T00:00:00Z
title: New Feature
severity: P2
priority: high
component: []
labels: []
reporter: alice
---

Feature description`;

      (fs.readFileSync as jest.Mock).mockReturnValue(content);
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const newFilepath = await parser.renameTask(oldFilepath, 10);

      expect(fs.renameSync).toHaveBeenCalledWith(
        oldFilepath,
        path.join(tasksDir, 'active', '010-new-feature.md')
      );
      expect(newFilepath).toBe(path.join(tasksDir, 'active', '010-new-feature.md'));
    });

    it('should preserve existing slug', async () => {
      const oldFilepath = path.join(tasksDir, 'active', 'my-custom-slug.md');

      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const newFilepath = await parser.renameTask(oldFilepath, 5);

      expect(newFilepath).toBe(path.join(tasksDir, 'active', '005-my-custom-slug.md'));
    });

    it('should throw error if target file exists', async () => {
      const oldFilepath = path.join(tasksDir, 'active', 'task.md');

      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await expect(parser.renameTask(oldFilepath, 1)).rejects.toThrow(
        'Cannot rename: file already exists'
      );
    });
  });

  describe('getTaskDir', () => {
    it('should return correct directory path', () => {
      expect(parser.getTaskDir('active')).toBe(path.join(tasksDir, 'active'));
      expect(parser.getTaskDir('backlog')).toBe(path.join(tasksDir, 'backlog'));
      expect(parser.getTaskDir('completed')).toBe(path.join(tasksDir, 'completed'));
    });
  });
});
