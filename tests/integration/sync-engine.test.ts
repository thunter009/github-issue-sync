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
    } as any;

    mapper = new FieldMapper();

    engine = new SyncEngine(mockGitHub, mockParser, mapper, projectRoot);

    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
  });

  describe('sync', () => {
    it('should push local tasks when GitHub issue does not exist', async () => {
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
      };

      mockParser.discoverTasks.mockResolvedValue([task]);
      mockGitHub.getIssues.mockResolvedValue(new Map()); // No GitHub issues

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await engine.sync();

      expect(result.pushed).toContain(1);
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
