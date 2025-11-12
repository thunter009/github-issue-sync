import inquirer from 'inquirer';
import { ConflictResolver } from '../../src/lib/conflict-resolver';
import { FieldMapper } from '../../src/lib/field-mapper';
import { SyncConflict } from '../../src/lib/types';

// Mock inquirer
jest.mock('inquirer');

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;
  let mapper: FieldMapper;

  beforeEach(() => {
    mapper = new FieldMapper();
    resolver = new ConflictResolver(mapper);
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('resolveConflicts', () => {
    it('should resolve single conflict with local choice', async () => {
      const conflict: SyncConflict = {
        issueNumber: 1,
        filename: '001-test.md',
        localData: {
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
        },
        remoteData: {
          number: 1,
          title: 'Remote Title',
          body: 'Remote body',
          state: 'open',
          labels: ['priority:high', 'severity:P2'],
          assignee: null,
          created_at: '2025-01-10T00:00:00Z',
          updated_at: '2025-01-11T13:00:00Z',
          closed_at: null,
        },
        localModified: new Date('2025-01-11T14:00:00Z'),
        remoteModified: new Date('2025-01-11T13:00:00Z'),
      };

      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ resolution: 'local' });

      const resolutions = await resolver.resolveConflicts([conflict]);

      expect(resolutions.get(1)).toBe('local');
      expect(inquirer.prompt).toHaveBeenCalledTimes(1);
    });

    it('should resolve single conflict with remote choice', async () => {
      const conflict: SyncConflict = {
        issueNumber: 2,
        filename: '002-test.md',
        localData: {
          issueNumber: 2,
          filename: '002-test.md',
          filepath: '/path/to/002-test.md',
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
        },
        remoteData: {
          number: 2,
          title: 'Remote Title',
          body: 'Remote body',
          state: 'open',
          labels: ['priority:high', 'severity:P2'],
          assignee: null,
          created_at: '2025-01-10T00:00:00Z',
          updated_at: '2025-01-11T13:00:00Z',
          closed_at: null,
        },
        localModified: new Date('2025-01-11T14:00:00Z'),
        remoteModified: new Date('2025-01-11T13:00:00Z'),
      };

      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ resolution: 'remote' });

      const resolutions = await resolver.resolveConflicts([conflict]);

      expect(resolutions.get(2)).toBe('remote');
    });

    it('should resolve single conflict with skip choice', async () => {
      const conflict: SyncConflict = {
        issueNumber: 3,
        filename: '003-test.md',
        localData: {
          issueNumber: 3,
          filename: '003-test.md',
          filepath: '/path/to/003-test.md',
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
        },
        remoteData: {
          number: 3,
          title: 'Remote Title',
          body: 'Remote body',
          state: 'open',
          labels: ['priority:high', 'severity:P2'],
          assignee: null,
          created_at: '2025-01-10T00:00:00Z',
          updated_at: '2025-01-11T13:00:00Z',
          closed_at: null,
        },
        localModified: new Date('2025-01-11T14:00:00Z'),
        remoteModified: new Date('2025-01-11T13:00:00Z'),
      };

      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ resolution: 'skip' });

      const resolutions = await resolver.resolveConflicts([conflict]);

      expect(resolutions.get(3)).toBe('skip');
    });

    it('should handle multiple conflicts', async () => {
      const conflicts: SyncConflict[] = [
        {
          issueNumber: 1,
          filename: '001-test.md',
          localData: {
            issueNumber: 1,
            filename: '001-test.md',
            filepath: '/path/to/001-test.md',
            frontmatter: {
              created_utc: '2025-01-10T00:00:00Z',
              title: 'Task 1',
              severity: 'P2',
              priority: 'high',
              component: [],
              labels: [],
              reporter: 'thom',
            },
            body: 'Body 1',
            lastModified: new Date(),
          },
          remoteData: {
            number: 1,
            title: 'Remote Task 1',
            body: 'Remote Body 1',
            state: 'open',
            labels: [],
            assignee: null,
            created_at: '2025-01-10T00:00:00Z',
            updated_at: '2025-01-11T00:00:00Z',
            closed_at: null,
          },
          localModified: new Date(),
          remoteModified: new Date(),
        },
        {
          issueNumber: 2,
          filename: '002-test.md',
          localData: {
            issueNumber: 2,
            filename: '002-test.md',
            filepath: '/path/to/002-test.md',
            frontmatter: {
              created_utc: '2025-01-10T00:00:00Z',
              title: 'Task 2',
              severity: 'P2',
              priority: 'medium',
              component: [],
              labels: [],
              reporter: 'thom',
            },
            body: 'Body 2',
            lastModified: new Date(),
          },
          remoteData: {
            number: 2,
            title: 'Remote Task 2',
            body: 'Remote Body 2',
            state: 'open',
            labels: [],
            assignee: null,
            created_at: '2025-01-10T00:00:00Z',
            updated_at: '2025-01-11T00:00:00Z',
            closed_at: null,
          },
          localModified: new Date(),
          remoteModified: new Date(),
        },
      ];

      (inquirer.prompt as unknown as jest.Mock)
        .mockResolvedValueOnce({ resolution: 'local' })
        .mockResolvedValueOnce({ resolution: 'remote' });

      const resolutions = await resolver.resolveConflicts(conflicts);

      expect(resolutions.size).toBe(2);
      expect(resolutions.get(1)).toBe('local');
      expect(resolutions.get(2)).toBe('remote');
      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
    });

    it('should handle skip-all option', async () => {
      const conflicts: SyncConflict[] = [
        {
          issueNumber: 1,
          filename: '001-test.md',
          localData: {
            issueNumber: 1,
            filename: '001-test.md',
            filepath: '/path/to/001-test.md',
            frontmatter: {
              created_utc: '2025-01-10T00:00:00Z',
              title: 'Task 1',
              severity: 'P2',
              priority: 'high',
              component: [],
              labels: [],
              reporter: 'thom',
            },
            body: 'Body 1',
            lastModified: new Date(),
          },
          remoteData: {
            number: 1,
            title: 'Remote Task 1',
            body: 'Remote Body 1',
            state: 'open',
            labels: [],
            assignee: null,
            created_at: '2025-01-10T00:00:00Z',
            updated_at: '2025-01-11T00:00:00Z',
            closed_at: null,
          },
          localModified: new Date(),
          remoteModified: new Date(),
        },
        {
          issueNumber: 2,
          filename: '002-test.md',
          localData: {
            issueNumber: 2,
            filename: '002-test.md',
            filepath: '/path/to/002-test.md',
            frontmatter: {
              created_utc: '2025-01-10T00:00:00Z',
              title: 'Task 2',
              severity: 'P2',
              priority: 'medium',
              component: [],
              labels: [],
              reporter: 'thom',
            },
            body: 'Body 2',
            lastModified: new Date(),
          },
          remoteData: {
            number: 2,
            title: 'Remote Task 2',
            body: 'Remote Body 2',
            state: 'open',
            labels: [],
            assignee: null,
            created_at: '2025-01-10T00:00:00Z',
            updated_at: '2025-01-11T00:00:00Z',
            closed_at: null,
          },
          localModified: new Date(),
          remoteModified: new Date(),
        },
      ];

      (inquirer.prompt as unknown as jest.Mock).mockResolvedValueOnce({ resolution: 'skip-all' });

      const resolutions = await resolver.resolveConflicts(conflicts);

      expect(resolutions.size).toBe(2);
      expect(resolutions.get(1)).toBe('skip');
      expect(resolutions.get(2)).toBe('skip');
      expect(inquirer.prompt).toHaveBeenCalledTimes(1); // Only once due to skip-all
    });
  });
});
