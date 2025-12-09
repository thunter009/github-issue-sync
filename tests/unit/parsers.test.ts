import fs from 'fs';
import path from 'path';
import { ParserRegistry, TasksParser, OpenSpecParser, OpenSpecMetaHandler, ISourceParser } from '../../src/lib/parsers';
import { TaskDocument } from '../../src/lib/types';

// Mock fs module
jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('ParserRegistry', () => {
  let registry: ParserRegistry;
  let mockParser: ISourceParser;

  beforeEach(() => {
    registry = new ParserRegistry();
    mockParser = {
      sourceType: 'tasks',
      discoverTasks: jest.fn(),
      discoverNewTasks: jest.fn(),
      writeTask: jest.fn(),
      createTask: jest.fn(),
      taskExists: jest.fn(),
      renameTask: jest.fn(),
    };
  });

  describe('register', () => {
    it('should register a parser', () => {
      registry.register(mockParser);
      expect(registry.has('tasks')).toBe(true);
    });
  });

  describe('get', () => {
    it('should return registered parser', () => {
      registry.register(mockParser);
      expect(registry.get('tasks')).toBe(mockParser);
    });

    it('should return undefined for unregistered type', () => {
      expect(registry.get('openspec')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all registered parsers', () => {
      const mockParser2: ISourceParser = { ...mockParser, sourceType: 'openspec' };
      registry.register(mockParser);
      registry.register(mockParser2);
      expect(registry.getAll()).toHaveLength(2);
    });

    it('should return empty array when no parsers registered', () => {
      expect(registry.getAll()).toHaveLength(0);
    });
  });

  describe('getByTypes', () => {
    beforeEach(() => {
      const mockParser2: ISourceParser = { ...mockParser, sourceType: 'openspec' };
      registry.register(mockParser);
      registry.register(mockParser2);
    });

    it('should return all parsers when "all" is specified', () => {
      expect(registry.getByTypes(['all'])).toHaveLength(2);
    });

    it('should return specific parser types', () => {
      const result = registry.getByTypes(['tasks']);
      expect(result).toHaveLength(1);
      expect(result[0].sourceType).toBe('tasks');
    });

    it('should filter out non-existent types', () => {
      registry = new ParserRegistry();
      registry.register(mockParser);
      const result = registry.getByTypes(['tasks', 'openspec']);
      expect(result).toHaveLength(1);
    });
  });

  describe('has', () => {
    it('should return true for registered type', () => {
      registry.register(mockParser);
      expect(registry.has('tasks')).toBe(true);
    });

    it('should return false for unregistered type', () => {
      expect(registry.has('tasks')).toBe(false);
    });
  });

  describe('getTypes', () => {
    it('should return all registered types', () => {
      const mockParser2: ISourceParser = { ...mockParser, sourceType: 'openspec' };
      registry.register(mockParser);
      registry.register(mockParser2);
      expect(registry.getTypes()).toEqual(['tasks', 'openspec']);
    });
  });
});

describe('OpenSpecMetaHandler', () => {
  const changePath = '/project/openspec/changes/add-feature';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMetaPath', () => {
    it('should return correct meta file path', () => {
      const metaPath = OpenSpecMetaHandler.getMetaPath(changePath);
      expect(metaPath).toBe(path.join(changePath, '.tasks-sync.json'));
    });
  });

  describe('load', () => {
    it('should return null when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(OpenSpecMetaHandler.load(changePath)).toBeNull();
    });

    it('should load and parse metadata', () => {
      const meta = { github_issue: 42, last_synced: '2025-01-10T00:00:00Z' };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(meta));

      const result = OpenSpecMetaHandler.load(changePath);
      expect(result).toEqual(meta);
    });

    it('should return null on parse error', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      expect(OpenSpecMetaHandler.load(changePath)).toBeNull();
    });
  });

  describe('save', () => {
    it('should save metadata to file', () => {
      const meta = { github_issue: 42 };
      OpenSpecMetaHandler.save(changePath, meta);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(changePath, '.tasks-sync.json'),
        JSON.stringify(meta, null, 2),
        'utf-8'
      );
    });
  });

  describe('update', () => {
    it('should merge updates with existing metadata', () => {
      const existing = { github_issue: 42, created: '2025-01-10T00:00:00Z' };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existing));

      OpenSpecMetaHandler.update(changePath, { last_synced: '2025-01-11T00:00:00Z' });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"github_issue": 42'),
        'utf-8'
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"last_synced": "2025-01-11T00:00:00Z"'),
        'utf-8'
      );
    });

    it('should create new metadata if none exists', () => {
      mockFs.existsSync.mockReturnValue(false);

      OpenSpecMetaHandler.update(changePath, { github_issue: 123 });

      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });
});

describe('OpenSpecParser', () => {
  const projectRoot = '/project';
  let parser: OpenSpecParser;

  beforeEach(() => {
    jest.clearAllMocks();
    parser = new OpenSpecParser(projectRoot);
  });

  describe('sourceType', () => {
    it('should be openspec', () => {
      expect(parser.sourceType).toBe('openspec');
    });
  });

  describe('discoverTasks', () => {
    it('should return empty array when changes dir does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);
      const tasks = await parser.discoverTasks();
      expect(tasks).toEqual([]);
    });

    it('should discover change folders with tasks.md', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.includes('openspec/changes')) return true;
        if (pathStr.includes('tasks.md')) return true;
        if (pathStr.includes('proposal.md')) return false;
        if (pathStr.includes('.archived')) return false;
        return false;
      });

      mockFs.readdirSync.mockReturnValue([
        { name: 'add-feature', isDirectory: () => true },
        { name: 'fix-bug', isDirectory: () => true },
      ] as any);

      mockFs.readFileSync.mockReturnValue('# Tasks\n\n- [ ] Task 1\n- [x] Task 2');
      mockFs.statSync.mockReturnValue({
        mtime: new Date('2025-01-10'),
        birthtime: new Date('2025-01-09'),
      } as any);

      const tasks = await parser.discoverTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks[0].sourceType).toBe('openspec');
    });

    it('should filter by filepath', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('# Tasks\n- [ ] Task 1');
      mockFs.statSync.mockReturnValue({
        mtime: new Date(),
        birthtime: new Date(),
      } as any);

      const tasks = await parser.discoverTasks({
        filepath: '/project/openspec/changes/add-feature/tasks.md',
      });

      expect(tasks.length).toBeLessThanOrEqual(1);
    });

    it('should return empty when filepath is not openspec path', async () => {
      const tasks = await parser.discoverTasks({
        filepath: '/project/docs/tasks/001-test.md',
      });
      expect(tasks).toEqual([]);
    });

    it('should filter by issue number', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        return pathStr.includes('openspec/changes') || pathStr.includes('tasks.md');
      });

      mockFs.readdirSync.mockReturnValue([
        { name: 'add-feature', isDirectory: () => true },
      ] as any);

      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (p.toString().includes('.tasks-sync.json')) {
          return JSON.stringify({ github_issue: 42 });
        }
        return '# Tasks\n- [ ] Task 1';
      });

      mockFs.statSync.mockReturnValue({
        mtime: new Date(),
        birthtime: new Date(),
      } as any);

      const tasks = await parser.discoverTasks({ issueNumber: 99 });
      expect(tasks).toHaveLength(0);
    });
  });

  describe('discoverNewTasks', () => {
    it('should return empty when changes dir does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);
      const tasks = await parser.discoverNewTasks();
      expect(tasks).toEqual([]);
    });

    it('should discover folders without github_issue', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.includes('.tasks-sync.json')) return false;
        return pathStr.includes('openspec/changes') || pathStr.includes('tasks.md');
      });

      mockFs.readdirSync.mockReturnValue([
        { name: 'new-feature', isDirectory: () => true },
      ] as any);

      mockFs.readFileSync.mockReturnValue('# Tasks\n- [ ] New task');
      mockFs.statSync.mockReturnValue({
        mtime: new Date(),
        birthtime: new Date(),
      } as any);

      const tasks = await parser.discoverNewTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].issueNumber).toBe(-1);
    });
  });

  describe('taskExists', () => {
    it('should return false when changes dir does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(parser.taskExists(42)).toBe(false);
    });

    it('should return true when issue exists in metadata', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'add-feature', isDirectory: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ github_issue: 42 }));

      expect(parser.taskExists(42)).toBe(true);
    });

    it('should return false when issue not found', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'add-feature', isDirectory: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ github_issue: 99 }));

      expect(parser.taskExists(42)).toBe(false);
    });
  });

  describe('writeTask', () => {
    it('should write task content and update metadata', async () => {
      const task: TaskDocument = {
        issueNumber: 42,
        filename: 'tasks.md',
        filepath: '/project/openspec/changes/add-feature/tasks.md',
        frontmatter: {
          title: 'Add Feature',
          created_utc: '2025-01-10T00:00:00Z',
          reporter: 'openspec',
          severity: 'P2',
          priority: 'medium',
          component: ['openspec'],
          labels: [],
        },
        body: '# Tasks\n- [x] Done',
        lastModified: new Date(),
        folderLastModified: new Date(),
        sourceType: 'openspec',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({}));

      await parser.writeTask(task);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        task.filepath,
        expect.any(String),
        'utf-8'
      );
    });

    it('should strip description prefix from body', async () => {
      const task: TaskDocument = {
        issueNumber: 42,
        filename: 'tasks.md',
        filepath: '/project/openspec/changes/add-feature/tasks.md',
        frontmatter: {
          title: 'Add Feature',
          created_utc: '2025-01-10T00:00:00Z',
          reporter: 'openspec',
          severity: 'P2',
          priority: 'medium',
          component: [],
          labels: [],
        },
        body: 'Description here\n\n---\n\n# Tasks\n- [ ] Task 1',
        lastModified: new Date(),
        folderLastModified: new Date(),
        sourceType: 'openspec',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({}));

      await parser.writeTask(task);

      // Should strip "Description here\n\n---\n\n" prefix
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        task.filepath,
        '# Tasks\n- [ ] Task 1',
        'utf-8'
      );
    });
  });

  describe('createTask', () => {
    it('should create change folder and tasks.md', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => undefined);
      mockFs.statSync.mockReturnValue({
        mtime: new Date(),
        birthtime: new Date(),
      } as any);

      const task = await parser.createTask(
        42,
        {
          title: 'New Feature',
          created_utc: '2025-01-10T00:00:00Z',
          reporter: 'openspec',
          severity: 'P2',
          priority: 'medium',
          component: [],
          labels: [],
        },
        '# Tasks\n- [ ] Task 1'
      );

      expect(mockFs.mkdirSync).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2); // tasks.md + .tasks-sync.json
      expect(task.issueNumber).toBe(42);
      expect(task.sourceType).toBe('openspec');
    });
  });

  describe('renameTask', () => {
    it('should update metadata with issue number', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({}));

      const result = await parser.renameTask(
        '/project/openspec/changes/add-feature/tasks.md',
        42
      );

      expect(result).toBe('/project/openspec/changes/add-feature/tasks.md');
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('inferStatus', () => {
    it('should return completed when all checkboxes checked', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.includes('.archived')) return false;
        return true;
      });

      mockFs.readdirSync.mockReturnValue([
        { name: 'done-feature', isDirectory: () => true },
      ] as any);

      mockFs.readFileSync.mockReturnValue('# Tasks\n- [x] Task 1\n- [x] Task 2');
      mockFs.statSync.mockReturnValue({
        mtime: new Date(),
        birthtime: new Date(),
      } as any);

      const tasks = await parser.discoverTasks();
      expect(tasks[0].frontmatter.status).toBe('completed');
    });

    it('should return active when some checkboxes checked', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.includes('.archived')) return false;
        return true;
      });

      mockFs.readdirSync.mockReturnValue([
        { name: 'in-progress', isDirectory: () => true },
      ] as any);

      mockFs.readFileSync.mockReturnValue('# Tasks\n- [x] Task 1\n- [ ] Task 2');
      mockFs.statSync.mockReturnValue({
        mtime: new Date(),
        birthtime: new Date(),
      } as any);

      const tasks = await parser.discoverTasks();
      expect(tasks[0].frontmatter.status).toBe('active');
    });

    it('should return backlog when no checkboxes checked', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.includes('.archived')) return false;
        return true;
      });

      mockFs.readdirSync.mockReturnValue([
        { name: 'new-feature', isDirectory: () => true },
      ] as any);

      mockFs.readFileSync.mockReturnValue('# Tasks\n- [ ] Task 1\n- [ ] Task 2');
      mockFs.statSync.mockReturnValue({
        mtime: new Date(),
        birthtime: new Date(),
      } as any);

      const tasks = await parser.discoverTasks();
      expect(tasks[0].frontmatter.status).toBe('backlog');
    });

    it('should return completed when .archived file exists', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockReturnValue([
        { name: 'archived-feature', isDirectory: () => true },
      ] as any);

      mockFs.readFileSync.mockReturnValue('# Tasks\n- [ ] Task 1');
      mockFs.statSync.mockReturnValue({
        mtime: new Date(),
        birthtime: new Date(),
      } as any);

      const tasks = await parser.discoverTasks();
      expect(tasks[0].frontmatter.status).toBe('completed');
    });
  });

  describe('formatTitle', () => {
    it('should convert kebab-case to Title Case', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = p.toString();
        if (pathStr.includes('.archived')) return false;
        return true;
      });

      mockFs.readdirSync.mockReturnValue([
        { name: 'add-user-authentication', isDirectory: () => true },
      ] as any);

      mockFs.readFileSync.mockReturnValue('# Tasks\n- [ ] Task 1');
      mockFs.statSync.mockReturnValue({
        mtime: new Date(),
        birthtime: new Date(),
      } as any);

      const tasks = await parser.discoverTasks();
      expect(tasks[0].frontmatter.title).toBe('Add User Authentication');
    });
  });

  describe('parseChangeFolder with proposal.md', () => {
    it('should extract description from proposal.md', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockReturnValue([
        { name: 'feature-with-proposal', isDirectory: () => true },
      ] as any);

      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const pathStr = p.toString();
        if (pathStr.includes('proposal.md')) {
          return '# Feature Proposal\n\nThis is the description paragraph.\n\n## Details';
        }
        if (pathStr.includes('.tasks-sync.json')) {
          return JSON.stringify({});
        }
        return '# Tasks\n- [ ] Task 1';
      });

      mockFs.statSync.mockReturnValue({
        mtime: new Date(),
        birthtime: new Date(),
      } as any);

      const tasks = await parser.discoverTasks();
      expect(tasks[0].body).toContain('This is the description paragraph.');
      expect(tasks[0].body).toContain('---');
    });
  });
});
