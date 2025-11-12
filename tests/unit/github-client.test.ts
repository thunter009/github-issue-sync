import { GitHubClient } from '../../src/lib/github-client';
import { Octokit } from '@octokit/rest';

// Mock Octokit
jest.mock('@octokit/rest');

describe('GitHubClient', () => {
  let client: GitHubClient;
  let mockOctokit: jest.Mocked<Octokit>;

  beforeEach(() => {
    mockOctokit = {
      issues: {
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        listLabelsForRepo: jest.fn(),
        createLabel: jest.fn(),
        updateLabel: jest.fn(),
      },
      repos: {
        get: jest.fn(),
      },
    } as any;

    (Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(() => mockOctokit);

    client = new GitHubClient('test-token', 'owner/repo');
  });

  describe('constructor', () => {
    it('should parse repo full name correctly', () => {
      expect(() => new GitHubClient('token', 'owner/repo')).not.toThrow();
    });

    it('should throw error for invalid repo format', () => {
      expect(() => new GitHubClient('token', 'invalid')).toThrow(
        'Invalid repo format: invalid. Expected "owner/repo"'
      );
    });
  });

  describe('getIssue', () => {
    it('should fetch and return issue data', async () => {
      const mockIssue = {
        number: 1,
        title: 'Test Issue',
        body: 'Issue body',
        state: 'open',
        labels: [{ name: 'bug' }, { name: 'priority:high' }],
        assignee: { login: 'john' },
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: null,
      };

      (mockOctokit.issues.get as jest.Mock).mockResolvedValue({ data: mockIssue } as any);

      const issue = await client.getIssue(1);

      expect(issue).toEqual({
        number: 1,
        title: 'Test Issue',
        body: 'Issue body',
        state: 'open',
        labels: ['bug', 'priority:high'],
        assignee: 'john',
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: null,
      });

      expect(mockOctokit.issues.get).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
      });
    });

    it('should return null for pull requests', async () => {
      const mockPR = {
        number: 1,
        title: 'Test PR',
        body: 'PR body',
        state: 'open',
        labels: [],
        assignee: null,
        pull_request: { url: 'https://...' },
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: null,
      };

      mockOctokit.issues.get.mockResolvedValue({ data: mockPR } as any);

      const issue = await client.getIssue(1);

      expect(issue).toBeNull();
    });

    it('should return null for 404 errors', async () => {
      (mockOctokit.issues.get as jest.Mock).mockRejectedValue({ status: 404 });

      const issue = await client.getIssue(999);

      expect(issue).toBeNull();
    });

    it('should throw for other errors', async () => {
      (mockOctokit.issues.get as jest.Mock).mockRejectedValue(new Error('API Error'));

      await expect(client.getIssue(1)).rejects.toThrow('API Error');
    });

    it('should handle null body', async () => {
      const mockIssue = {
        number: 1,
        title: 'Test',
        body: null,
        state: 'open',
        labels: [],
        assignee: null,
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: null,
      };

      (mockOctokit.issues.get as jest.Mock).mockResolvedValue({ data: mockIssue } as any);

      const issue = await client.getIssue(1);

      expect(issue?.body).toBeNull();
    });
  });

  describe('getIssues', () => {
    it('should fetch multiple issues in chunks', async () => {
      (mockOctokit.issues.get as jest.Mock).mockImplementation(async ({ issue_number }: any) => {
        return {
          data: {
            number: issue_number,
            title: `Issue ${issue_number}`,
            body: 'Body',
            state: 'open',
            labels: [],
            assignee: null,
            created_at: '2025-01-10T00:00:00Z',
            updated_at: '2025-01-11T00:00:00Z',
            closed_at: null,
          },
        } as any;
      });

      const issueNumbers = [1, 2, 3, 4, 5];
      const issues = await client.getIssues(issueNumbers);

      expect(issues.size).toBe(5);
      expect(issues.get(1)?.title).toBe('Issue 1');
      expect(issues.get(5)?.title).toBe('Issue 5');
    });

    it('should handle mixed success and failures', async () => {
      (mockOctokit.issues.get as jest.Mock).mockImplementation(async ({ issue_number }: any) => {
        if (issue_number === 2) {
          throw { status: 404 };
        }
        return {
          data: {
            number: issue_number,
            title: `Issue ${issue_number}`,
            body: 'Body',
            state: 'open',
            labels: [],
            assignee: null,
            created_at: '2025-01-10T00:00:00Z',
            updated_at: '2025-01-11T00:00:00Z',
            closed_at: null,
          },
        } as any;
      });

      const issues = await client.getIssues([1, 2, 3]);

      expect(issues.size).toBe(2);
      expect(issues.has(1)).toBe(true);
      expect(issues.has(2)).toBe(false); // Failed to fetch
      expect(issues.has(3)).toBe(true);
    });
  });

  describe('createIssue', () => {
    it('should create new issue with all fields', async () => {
      const mockCreated = {
        number: 10,
        title: 'New Issue',
        body: 'Issue body',
        state: 'open',
        labels: [{ name: 'bug' }],
        assignee: { login: 'alice' },
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-10T00:00:00Z',
        closed_at: null,
      };

      (mockOctokit.issues.create as jest.Mock).mockResolvedValue({ data: mockCreated } as any);

      const issue = await client.createIssue(
        'New Issue',
        'Issue body',
        ['bug'],
        'alice'
      );

      expect(issue.number).toBe(10);
      expect(issue.title).toBe('New Issue');
      expect(issue.assignee).toBe('alice');

      expect(mockOctokit.issues.create).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        title: 'New Issue',
        body: 'Issue body',
        labels: ['bug'],
        assignee: 'alice',
      });
    });
  });

  describe('updateIssue', () => {
    it('should update issue fields', async () => {
      const mockUpdated = {
        number: 1,
        title: 'Updated Title',
        body: 'Updated body',
        state: 'closed',
        labels: [{ name: 'resolved' }],
        assignee: null,
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-12T00:00:00Z',
        closed_at: '2025-01-12T00:00:00Z',
      };

      (mockOctokit.issues.update as jest.Mock).mockResolvedValue({ data: mockUpdated } as any);

      const issue = await client.updateIssue(1, {
        title: 'Updated Title',
        state: 'closed',
      });

      expect(issue.title).toBe('Updated Title');
      expect(issue.state).toBe('closed');

      expect(mockOctokit.issues.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        title: 'Updated Title',
        state: 'closed',
      });
    });
  });

  describe('closeIssue', () => {
    it('should close issue', async () => {
      mockOctokit.issues.update.mockResolvedValue({
        data: {
          number: 1,
          title: 'Test',
          body: 'Body',
          state: 'closed',
          labels: [],
          assignee: null,
          created_at: '2025-01-10T00:00:00Z',
          updated_at: '2025-01-11T00:00:00Z',
          closed_at: '2025-01-11T00:00:00Z',
        },
      } as any);

      await client.closeIssue(1);

      expect(mockOctokit.issues.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        state: 'closed',
      });
    });
  });

  describe('reopenIssue', () => {
    it('should reopen issue', async () => {
      mockOctokit.issues.update.mockResolvedValue({
        data: {
          number: 1,
          title: 'Test',
          body: 'Body',
          state: 'open',
          labels: [],
          assignee: null,
          created_at: '2025-01-10T00:00:00Z',
          updated_at: '2025-01-11T00:00:00Z',
          closed_at: null,
        },
      } as any);

      await client.reopenIssue(1);

      expect(mockOctokit.issues.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        state: 'open',
      });
    });
  });

  describe('verifyAccess', () => {
    it('should return true for successful access', async () => {
      (mockOctokit.repos.get as jest.Mock).mockResolvedValue({} as any);

      const result = await client.verifyAccess();

      expect(result).toBe(true);
      expect(mockOctokit.repos.get).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
      });
    });

    it('should return false for failed access', async () => {
      (mockOctokit.repos.get as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

      const result = await client.verifyAccess();

      expect(result).toBe(false);
    });
  });

  describe('ensureLabels', () => {
    it('should create missing labels', async () => {
      (mockOctokit.issues.listLabelsForRepo as jest.Mock).mockResolvedValue({
        data: [],
      } as any);

      (mockOctokit.issues.createLabel as jest.Mock).mockResolvedValue({} as any);

      await client.ensureLabels(['priority:high', 'severity:P1']);

      expect(mockOctokit.issues.createLabel).toHaveBeenCalledTimes(2);
      expect(mockOctokit.issues.createLabel).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        name: 'priority:high',
        color: 'fbca04',
      });
    });

    it('should update existing labels with different color', async () => {
      mockOctokit.issues.listLabelsForRepo.mockResolvedValue({
        data: [
          { name: 'priority:high', color: 'ffffff' }, // Wrong color
        ],
      } as any);

      (mockOctokit.issues.updateLabel as jest.Mock).mockResolvedValue({} as any);

      await client.ensureLabels(['priority:high']);

      expect(mockOctokit.issues.updateLabel).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        name: 'priority:high',
        color: 'fbca04',
      });
    });

    it('should skip labels with correct color', async () => {
      mockOctokit.issues.listLabelsForRepo.mockResolvedValue({
        data: [
          { name: 'priority:high', color: 'fbca04' }, // Correct color
        ],
      } as any);

      await client.ensureLabels(['priority:high']);

      expect(mockOctokit.issues.updateLabel).not.toHaveBeenCalled();
      expect(mockOctokit.issues.createLabel).not.toHaveBeenCalled();
    });

    it('should handle label fetch failure gracefully', async () => {
      (mockOctokit.issues.listLabelsForRepo as jest.Mock).mockRejectedValue(new Error('API Error'));
      (mockOctokit.issues.createLabel as jest.Mock).mockResolvedValue({} as any);

      await client.ensureLabels(['priority:high']);

      // Should still try to create labels
      expect(mockOctokit.issues.createLabel).toHaveBeenCalled();
    });

    it('should use default colors for unlabeled prefixes', async () => {
      (mockOctokit.issues.listLabelsForRepo as jest.Mock).mockResolvedValue({
        data: [],
      } as any);

      (mockOctokit.issues.createLabel as jest.Mock).mockResolvedValue({} as any);

      await client.ensureLabels(['custom-label']);

      expect(mockOctokit.issues.createLabel).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        name: 'custom-label',
        color: 'ededed', // Default gray
      });
    });
  });

  describe('chunkArray', () => {
    it('should chunk array into specified sizes', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      const chunks = (client as any).chunkArray(array, 3);

      expect(chunks).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
        [10, 11],
      ]);
    });

    it('should handle empty array', () => {
      const chunks = (client as any).chunkArray([], 5);

      expect(chunks).toEqual([]);
    });
  });

  describe('getDefaultColorForLabel', () => {
    it('should return correct colors for prefixes', () => {
      expect((client as any).getDefaultColorForLabel('priority:high')).toBe('fbca04');
      expect((client as any).getDefaultColorForLabel('severity:P1')).toBe('9d84ff');
      expect((client as any).getDefaultColorForLabel('status:active')).toBe('0075ca');
      expect((client as any).getDefaultColorForLabel('type:bug')).toBe('1d76db');
      expect((client as any).getDefaultColorForLabel('component:ui')).toBe('006b75');
      expect((client as any).getDefaultColorForLabel('unknown')).toBe('ededed');
    });
  });
});
