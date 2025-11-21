import fs from 'fs';
import { SyncEngine } from '../../src/lib/sync-engine';
import { GitHubClient } from '../../src/lib/github-client';
import { MarkdownParser } from '../../src/lib/markdown-parser';
import { FieldMapper } from '../../src/lib/field-mapper';
import { TaskDocument, GitHubIssueData } from '../../src/lib/types';

// Mock dependencies
jest.mock('fs');
jest.mock('../../src/lib/github-client');
jest.mock('../../src/lib/markdown-parser');

describe('SyncEngine', () => {
  let engine: SyncEngine;
  let mockGitHub: jest.Mocked<GitHubClient>;
  let mockParser: jest.Mocked<MarkdownParser>;
  let mapper: FieldMapper;
  const projectRoot = '/test/project';

  beforeEach(() => {
    mockGitHub = {
      getIssues: jest.fn(),
      updateIssue: jest.fn(),
      ensureLabels: jest.fn(),
    } as any;

    mockParser = {
      discoverTasks: jest.fn(),
      writeTask: jest.fn(),
      resolveStatusConflict: jest.fn().mockImplementation((task) => task.frontmatter.status || 'backlog'),
      renameTask: jest.fn().mockImplementation(async (filepath, _issueNum) => filepath),
      moveTask: jest.fn().mockImplementation(async (task, _status) => task),
    } as any;

    mapper = new FieldMapper();

    engine = new SyncEngine(mockGitHub, mockParser, mapper, projectRoot, 'owner/repo');

    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
  });

  describe('sync', () => {
    it('should skip orphaned local tasks when GitHub issue does not exist', async () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/001-test.md',
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Test Task',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
        },
        body: 'Task body',
        lastModified: new Date('2025-01-10T12:00:00Z'),
        folderLastModified: new Date('2025-01-10T11:00:00Z'),
      };

      mockParser.discoverTasks.mockResolvedValue([task]);
      mockGitHub.getIssues.mockResolvedValue(new Map()); // No GitHub issues

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await engine.sync();

      // Changed behavior: orphaned tasks (where GitHub issue doesn't exist) are now skipped
      // to prevent accidentally recreating deleted issues. Use sync --clean to remove them.
      expect(result.skipped).toContain(1);
      expect(result.pushed).toHaveLength(0);
      expect(result.pulled).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);

      consoleSpy.mockRestore();
    });

    it('should pull changes when only remote modified', async () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/001-test.md',
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Old Title',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
        },
        body: 'Old body',
        lastModified: new Date('2025-01-10T12:00:00Z'),
        folderLastModified: new Date('2025-01-10T11:00:00Z'),
      };

      const issue: GitHubIssueData = {
        number: 1,
        title: 'Updated Title',
        body: 'Updated body',
        state: 'open',
        labels: ['priority:high', 'severity:P2'],
        assignee: null,
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: null,
      };

      mockParser.discoverTasks.mockResolvedValue([task]);
      mockGitHub.getIssues.mockResolvedValue(new Map([[1, issue]]));

      // Mock state file to simulate previous sync
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
        lastSync: '2025-01-10T12:00:00Z',
        issues: {
          1: {
            localHash: mapper.hashTask(task),
            remoteHash: 'old-remote-hash', // Old hash - remote has changed
            lastSyncedAt: '2025-01-10T12:00:00Z',
          },
        },
      }));

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await engine.sync();

      // Should pull changes
      expect(mockParser.writeTask).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should detect conflicts when both local and remote modified', async () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/001-test.md',
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Local Title',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
        },
        body: 'Local body',
        lastModified: new Date('2025-01-11T14:00:00Z'),
        folderLastModified: new Date('2025-01-11T13:00:00Z'),
      };

      const issue: GitHubIssueData = {
        number: 1,
        title: 'Remote Title',
        body: 'Remote body',
        state: 'open',
        labels: ['priority:high', 'severity:P2'],
        assignee: null,
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T13:00:00Z',
        closed_at: null,
      };

      mockParser.discoverTasks.mockResolvedValue([task]);
      mockGitHub.getIssues.mockResolvedValue(new Map([[1, issue]]));

      // Mock state with different hashes
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
        lastSync: '2025-01-10T00:00:00Z',
        issues: {
          1: {
            localHash: 'old-hash-1',
            remoteHash: 'old-hash-2',
            lastSyncedAt: '2025-01-10T00:00:00Z',
          },
        },
      }));

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await engine.sync();

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].issueNumber).toBe(1);
      expect(result.conflicts[0].localData.frontmatter.title).toBe('Local Title');
      expect(result.conflicts[0].remoteData.title).toBe('Remote Title');

      consoleSpy.mockRestore();
    });

    it('should skip when neither local nor remote modified', async () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/001-test.md',
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Test Task',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
        },
        body: 'Task body',
        lastModified: new Date('2025-01-10T12:00:00Z'),
        folderLastModified: new Date('2025-01-10T11:00:00Z'),
      };

      const issue: GitHubIssueData = {
        number: 1,
        title: 'Test Task',
        body: 'Task body',
        state: 'open',
        labels: ['priority:high', 'severity:P2'],
        assignee: null,
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-10T12:00:00Z',
        closed_at: null,
      };

      mockParser.discoverTasks.mockResolvedValue([task]);
      mockGitHub.getIssues.mockResolvedValue(new Map([[1, issue]]));

      const currentLocalHash = mapper.hashTask(task);
      const currentRemoteHash = mapper.hashIssue(issue);

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
        lastSync: '2025-01-10T00:00:00Z',
        issues: {
          1: {
            localHash: currentLocalHash,
            remoteHash: currentRemoteHash,
            lastSyncedAt: '2025-01-10T00:00:00Z',
          },
        },
      }));

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await engine.sync();

      expect(result.skipped).toContain(1);
      expect(result.pushed).toHaveLength(0);
      expect(result.pulled).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);

      consoleSpy.mockRestore();
    });
  });

  describe('ensureStatusSync', () => {
    it('should resolve conflict and update file', async () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/active/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Test',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
          status: 'backlog', // Conflict with active/ folder
        },
        body: 'Body',
      };

      mockParser.resolveStatusConflict.mockReturnValue('active');

      const result = await (engine as any).ensureStatusSync(task);

      expect(mockParser.writeTask).toHaveBeenCalled();
      expect(result.frontmatter.status).toBe('active');
      expect(result.frontmatter.status_last_modified).toBeTruthy();
    });

    it('should auto-fill missing status and write', async () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/backlog/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Test',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
          // status missing
        },
        body: 'Body',
      };

      mockParser.resolveStatusConflict.mockReturnValue('backlog');

      const result = await (engine as any).ensureStatusSync(task);

      expect(mockParser.writeTask).toHaveBeenCalled();
      expect(result.frontmatter.status).toBe('backlog');
      expect(result.frontmatter.status_last_modified).toBeTruthy();
    });

    it('should not update when already synced', async () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/active/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Test',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
          status: 'active', // Matches folder
        },
        body: 'Body',
      };

      mockParser.resolveStatusConflict.mockReturnValue('active');

      const result = await (engine as any).ensureStatusSync(task);

      expect(mockParser.writeTask).not.toHaveBeenCalled();
      expect(result).toBe(task); // Unchanged
    });

    it('should set status_last_modified timestamp', async () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/completed/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Test',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
          status: 'active',
        },
        body: 'Body',
      };

      mockParser.resolveStatusConflict.mockReturnValue('completed');

      const result = await (engine as any).ensureStatusSync(task);

      expect(result.frontmatter.status_last_modified).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
      const timestamp = new Date(result.frontmatter.status_last_modified);
      expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 5000); // Recent
    });
  });

  describe('pullIssue', () => {
    it('should regenerate slug from GitHub title', async () => {
      const task: TaskDocument = {
        issueNumber: 3,
        filename: '003-old-name.md',
        filepath: '/path/to/active/003-old-name.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Old Name',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
        },
        body: 'Body',
      };

      const issue: GitHubIssueData = {
        number: 3,
        title: 'New Feature Title',
        body: 'Updated body',
        state: 'open',
        labels: ['priority:high', 'severity:P2'],
        assignee: null,
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: null,
      };

      mockParser.renameTask.mockResolvedValue('/path/to/active/003-new-feature-title.md');

      await (engine as any).pullIssue(issue, task);

      expect(mockParser.renameTask).toHaveBeenCalledWith(
        '/path/to/active/003-old-name.md',
        3,
        'New Feature Title'
      );
      expect(mockParser.writeTask).toHaveBeenCalled();
    });

    it('should handle rename failure gracefully', async () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/active/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Test',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
        },
        body: 'Body',
      };

      const issue: GitHubIssueData = {
        number: 1,
        title: 'New Title',
        body: 'Body',
        state: 'open',
        labels: [],
        assignee: null,
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: null,
      };

      mockParser.renameTask.mockRejectedValue(new Error('File exists'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await (engine as any).pullIssue(issue, task);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not rename'));
      expect(mockParser.writeTask).toHaveBeenCalled(); // Continues despite error

      warnSpy.mockRestore();
    });

    it('should move file when status changes', async () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/active/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Test',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
          status: 'active',
        },
        body: 'Body',
      };

      const issue: GitHubIssueData = {
        number: 1,
        title: 'Test',
        body: 'Body',
        state: 'closed', // Now closed
        labels: ['status:completed'],
        assignee: null,
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: '2025-01-11T00:00:00Z',
      };

      mockParser.moveTask.mockResolvedValue({
        ...task,
        filepath: '/path/to/completed/001-test.md',
      });

      await (engine as any).pullIssue(issue, task);

      expect(mockParser.moveTask).toHaveBeenCalledWith(
        expect.objectContaining({ issueNumber: 1 }),
        'completed'
      );
    });
  });

  describe('state management', () => {
    it('should load state from file', () => {
      const mockState = {
        lastSync: '2025-01-10T00:00:00Z',
        issues: {
          1: {
            localHash: 'hash1',
            remoteHash: 'hash2',
            lastSyncedAt: '2025-01-10T00:00:00Z',
          },
        },
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockState));

      const state = (engine as any).loadState();

      expect(state).toEqual(mockState);
    });

    it('should return empty state when file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const state = (engine as any).loadState();

      expect(state.issues).toEqual({});
      expect(state.lastSync).toBeTruthy();
    });

    it('should save state to file', () => {
      const state = {
        lastSync: '2025-01-10T00:00:00Z',
        issues: {
          1: {
            localHash: 'hash1',
            remoteHash: 'hash2',
            lastSyncedAt: '2025-01-10T00:00:00Z',
          },
        },
      };

      (engine as any).saveState(state);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.sync-state.json'),
        JSON.stringify(state, null, 2),
        'utf-8'
      );
    });
  });
});
