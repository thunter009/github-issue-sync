import { FieldMapper } from '../../src/lib/field-mapper';
import { TaskDocument, GitHubIssueData, TaskFrontmatter } from '../../src/lib/types';

describe('FieldMapper', () => {
  let mapper: FieldMapper;

  beforeEach(() => {
    mapper = new FieldMapper();
  });

  describe('taskToGitHub', () => {
    it('should convert task to GitHub issue format', () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test-task.md',
        filepath: '/path/to/active/001-test-task.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          reporter: 'thom',
          title: 'Test Task',
          severity: 'P2',
          priority: 'high',
          type: 'feature',
          component: ['auth', 'api'],
          labels: ['review:needed'],
          assignee: 'thom',
          status: 'active',
        },
        body: 'Task body content',
      };

      const result = mapper.taskToGitHub(task);

      expect(result.title).toBe('Test Task');
      expect(result.state).toBe('open');
      expect(result.assignee).toBe('thunter009'); // Mapped username
      expect(result.labels).toContain('review:needed');
      expect(result.labels).toContain('component:auth');
      expect(result.labels).toContain('component:api');
      expect(result.labels).toContain('priority:high');
      expect(result.labels).toContain('severity:P2');
      expect(result.labels).toContain('type:feature');
      expect(result.labels).toContain('status:active');
      expect(result.body).toContain('Task body content');
    });

    it('should set state to closed for completed tasks', () => {
      const task: TaskDocument = {
        issueNumber: 2,
        filename: '002-completed.md',
        filepath: '/path/to/completed/002-completed.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          completed_utc: '2025-01-11T00:00:00Z',
          reporter: 'thom',
          title: 'Completed Task',
          severity: 'P3',
          priority: 'low',
          component: [],
          labels: [],
          status: 'completed',
        },
        body: 'Done!',
      };

      const result = mapper.taskToGitHub(task);
      expect(result.state).toBe('closed');
    });

    it('should handle unassigned tasks', () => {
      const task: TaskDocument = {
        issueNumber: 3,
        filename: '003-unassigned.md',
        filepath: '/path/to/active/003-unassigned.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          reporter: 'thom',
          title: 'Unassigned Task',
          severity: 'P2',
          priority: 'medium',
          component: [],
          labels: [],
          assignee: 'unassigned',
        },
        body: 'No one assigned',
      };

      const result = mapper.taskToGitHub(task);
      expect(result.assignee).toBeUndefined();
    });

    it('should filter out invalid assignee values', () => {
      const invalidValues = ['completed', 'active', 'backlog', 'none', '', 'UNASSIGNED'];

      invalidValues.forEach(value => {
        const task: TaskDocument = {
          issueNumber: 3,
          filename: '003-task.md',
          filepath: '/path/to/active/003-task.md',
          lastModified: new Date(),
          folderLastModified: new Date(),
          frontmatter: {
            created_utc: '2025-01-10T00:00:00Z',
            reporter: 'thom',
            title: 'Task',
            severity: 'P2',
            priority: 'medium',
            component: [],
            labels: [],
            assignee: value,
          },
          body: 'Content',
        };

        const result = mapper.taskToGitHub(task);
        expect(result.assignee).toBeUndefined();
      });
    });

    it('should remove duplicate labels', () => {
      const task: TaskDocument = {
        issueNumber: 4,
        filename: '004-duplicates.md',
        filepath: '/path/to/active/004-duplicates.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          reporter: 'thom',
          title: 'Task with Duplicates',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: ['type:bug', 'type:bug'], // Duplicate
        },
        body: 'Content',
      };

      const result = mapper.taskToGitHub(task);
      const bugLabels = result.labels.filter(l => l === 'type:bug');
      expect(bugLabels.length).toBe(1);
    });

    it('should clean [#NNN] prefix from title by default', () => {
      const task: TaskDocument = {
        issueNumber: 5,
        filename: '005-prefixed.md',
        filepath: '/path/to/active/005-prefixed.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          reporter: 'thom',
          title: '[#005] Task with prefix',
          severity: 'P2',
          priority: 'medium',
          component: [],
          labels: [],
        },
        body: 'Content',
      };

      const result = mapper.taskToGitHub(task);
      expect(result.title).toBe('Task with prefix');
    });

    it('should clean various [#NNN] prefix formats', () => {
      const testCases = [
        { input: '[#1] Single digit', expected: 'Single digit' },
        { input: '[#123] Three digits', expected: 'Three digits' },
        { input: '[#0001] Leading zeros', expected: 'Leading zeros' },
        { input: '[#999]No space after', expected: 'No space after' },
        { input: '[#42]  Multiple spaces', expected: 'Multiple spaces' },
      ];

      testCases.forEach(({ input, expected }) => {
        const task: TaskDocument = {
          issueNumber: 1,
          filename: '001-test.md',
          filepath: '/path/to/active/001-test.md',
          lastModified: new Date(),
          folderLastModified: new Date(),
          frontmatter: {
            created_utc: '2025-01-10T00:00:00Z',
            reporter: 'thom',
            title: input,
            severity: 'P2',
            priority: 'medium',
            component: [],
            labels: [],
          },
          body: 'Content',
        };

        const result = mapper.taskToGitHub(task);
        expect(result.title).toBe(expected);
      });
    });

    it('should keep title prefix when keepTitlePrefixes is true', () => {
      const mapperWithFlag = new FieldMapper({ keepTitlePrefixes: true });

      const task: TaskDocument = {
        issueNumber: 5,
        filename: '005-prefixed.md',
        filepath: '/path/to/active/005-prefixed.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          reporter: 'thom',
          title: '[#005] Task with prefix',
          severity: 'P2',
          priority: 'medium',
          component: [],
          labels: [],
        },
        body: 'Content',
      };

      const result = mapperWithFlag.taskToGitHub(task);
      expect(result.title).toBe('[#005] Task with prefix');
    });

    it('should not modify titles without [#NNN] prefix', () => {
      const task: TaskDocument = {
        issueNumber: 6,
        filename: '006-normal.md',
        filepath: '/path/to/active/006-normal.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          reporter: 'thom',
          title: 'Normal task title',
          severity: 'P2',
          priority: 'medium',
          component: [],
          labels: [],
        },
        body: 'Content',
      };

      const result = mapper.taskToGitHub(task);
      expect(result.title).toBe('Normal task title');
    });
  });

  describe('githubToTask', () => {
    it('should convert GitHub issue to task format', () => {
      const issue: GitHubIssueData = {
        number: 1,
        title: 'GitHub Issue',
        body: 'Issue body',
        state: 'open',
        labels: ['priority:high', 'severity:P1', 'component:ui', 'type:bug', 'triage:needed'],
        assignee: 'john',
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: null,
      };

      const result = mapper.githubToTask(issue);

      expect(result.frontmatter.title).toBe('GitHub Issue');
      expect(result.frontmatter.priority).toBe('high');
      expect(result.frontmatter.severity).toBe('P1');
      expect(result.frontmatter.component).toEqual(['ui']);
      expect(result.frontmatter.type).toBe('bug');
      expect(result.frontmatter.labels).toEqual(['triage:needed']);
      expect(result.frontmatter.assignee).toBe('john');
      expect(result.body).toBe('Issue body');
    });

    it('should set status to completed for closed issues', () => {
      const issue: GitHubIssueData = {
        number: 2,
        title: 'Closed Issue',
        body: 'Done',
        state: 'closed',
        labels: ['priority:low', 'severity:P3'],
        assignee: null,
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: '2025-01-11T00:00:00Z',
      };

      const result = mapper.githubToTask(issue);

      expect(result.frontmatter.status).toBe('completed');
      expect(result.frontmatter.completed_utc).toBe('2025-01-11T00:00:00Z');
    });

    it('should preserve existing task fields', () => {
      const issue: GitHubIssueData = {
        number: 3,
        title: 'Updated Issue',
        body: 'New body',
        state: 'open',
        labels: ['priority:medium', 'severity:P2'],
        assignee: null,
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: null,
      };

      const existingTask: TaskDocument = {
        issueNumber: 3,
        filename: '003-existing.md',
        filepath: '/path/to/active/003-existing.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2024-12-01T00:00:00Z',
          reporter: 'alice',
          title: 'Old Title',
          severity: 'P1',
          priority: 'high',
          component: [],
          labels: [],
          parent_epic: 'EPIC-123',
          due_date: '2025-02-01',
          commit: 'abc123',
          commit_url: 'https://github.com/repo/commit/abc123',
        },
        body: 'Old body',
      };

      const result = mapper.githubToTask(issue, existingTask);

      expect(result.frontmatter.created_utc).toBe('2024-12-01T00:00:00Z');
      expect(result.frontmatter.reporter).toBe('alice');
      expect(result.frontmatter.parent_epic).toBe('EPIC-123');
      expect(result.frontmatter.due_date).toBe('2025-02-01');
      expect(result.frontmatter.commit).toBe('abc123');
      expect(result.frontmatter.commit_url).toBe('https://github.com/repo/commit/abc123');
    });

    it('should use defaults for missing fields', () => {
      const issue: GitHubIssueData = {
        number: 4,
        title: 'Minimal Issue',
        body: null,
        state: 'open',
        labels: [],
        assignee: null,
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: null,
      };

      const result = mapper.githubToTask(issue);

      expect(result.frontmatter.priority).toBe('medium');
      expect(result.frontmatter.severity).toBe('P2');
      expect(result.frontmatter.component).toEqual([]);
      expect(result.frontmatter.assignee).toBeUndefined(); // No assignee = undefined, not 'unassigned'
      expect(result.frontmatter.reporter).toBe('System');
      expect(result.body).toBe('');
    });
  });

  describe('parseLabels', () => {
    it('should parse prefixed labels correctly', () => {
      const mapper = new FieldMapper();
      const labels = [
        'priority:high',
        'severity:P1',
        'type:bug',
        'component:auth',
        'component:api',
        'status:active',
        'review:needed',
        'triage:needed',
      ];

      const result = (mapper as any).parseLabels(labels);

      expect(result.priority).toBe('high');
      expect(result.severity).toBe('P1');
      expect(result.type).toBe('bug');
      expect(result.component).toEqual(['auth', 'api']);
      expect(result.status).toBe('active');
      expect(result.labels).toEqual(['review:needed', 'triage:needed']);
    });
  });

  describe('parseIssueBody', () => {
    it('should extract metadata from issue body', () => {
      const body = `<!-- metadata
**Reporter:** alice
**Due Date:** 2025-02-01
**Epic:** EPIC-123
-->

Issue content here

---

*Synced from local task: Test Task*`;

      const result = (mapper as any).parseIssueBody(body);

      expect(result.metadata.reporter).toBe('alice');
      expect(result.metadata['due date']).toBe('2025-02-01');
      expect(result.metadata.epic).toBe('EPIC-123');
      expect(result.body).toBe('Issue content here');
    });

    it('should handle body without metadata', () => {
      const body = 'Simple issue body';

      const result = (mapper as any).parseIssueBody(body);

      expect(result.metadata).toEqual({});
      expect(result.body).toBe('Simple issue body');
    });
  });

  describe('buildIssueBody', () => {
    it('should build issue body with metadata', () => {
      const frontmatter: TaskFrontmatter = {
        created_utc: '2025-01-10T00:00:00Z',
        reporter: 'alice',
        title: 'Test Task',
        severity: 'P1',
        priority: 'high',
        component: ['auth'],
        labels: [],
        due_date: '2025-02-01',
        parent_epic: 'EPIC-123',
      };

      const body = 'Task content';

      const result = (mapper as any).buildIssueBody(frontmatter, body);

      expect(result).toContain('**Reporter:** alice');
      expect(result).toContain('**Due Date:** 2025-02-01');
      expect(result).toContain('**Epic:** EPIC-123');
      expect(result).toContain('Task content');
      expect(result).toContain('*Synced from local task: Test Task*');
    });

    it('should handle minimal frontmatter', () => {
      const frontmatter: TaskFrontmatter = {
        created_utc: '2025-01-10T00:00:00Z',
        reporter: 'bob',
        title: 'Simple Task',
        severity: 'P2',
        priority: 'medium',
        component: [],
        labels: [],
      };

      const body = 'Simple content';

      const result = (mapper as any).buildIssueBody(frontmatter, body);

      expect(result).toContain('**Reporter:** bob');
      expect(result).toContain('Simple content');
      expect(result).toContain('*Synced from local task: Simple Task*');
    });
  });

  describe('generateHash', () => {
    it('should generate consistent hash for same content', () => {
      const content = 'test content';
      const hash1 = mapper.generateHash(content);
      const hash2 = mapper.generateHash(content);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = mapper.generateHash('content1');
      const hash2 = mapper.generateHash('content2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashTask', () => {
    it('should generate hash for task document', () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/active/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          reporter: 'thom',
          title: 'Test',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
        },
        body: 'Content',
      };

      const hash = mapper.hashTask(task);

      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });

    it('should normalize title with [#NNN] prefix in hash calculation', () => {
      const taskWithPrefix: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/active/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          reporter: 'thom',
          title: '[#001] Test Title',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
        },
        body: 'Content',
      };

      const taskWithoutPrefix: TaskDocument = {
        ...taskWithPrefix,
        frontmatter: {
          ...taskWithPrefix.frontmatter,
          title: 'Test Title',
        },
      };

      const hashWithPrefix = mapper.hashTask(taskWithPrefix);
      const hashWithoutPrefix = mapper.hashTask(taskWithoutPrefix);

      // Hashes should be the same because prefix is cleaned before hashing
      expect(hashWithPrefix).toBe(hashWithoutPrefix);
    });

    it('should preserve title prefix in hash when keepTitlePrefixes is true', () => {
      const mapperWithFlag = new FieldMapper({ keepTitlePrefixes: true });

      const taskWithPrefix: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/active/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          reporter: 'thom',
          title: '[#001] Test Title',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
        },
        body: 'Content',
      };

      const taskWithoutPrefix: TaskDocument = {
        ...taskWithPrefix,
        frontmatter: {
          ...taskWithPrefix.frontmatter,
          title: 'Test Title',
        },
      };

      const hashWithPrefix = mapperWithFlag.hashTask(taskWithPrefix);
      const hashWithoutPrefix = mapperWithFlag.hashTask(taskWithoutPrefix);

      // Hashes should be different when keepTitlePrefixes is true
      expect(hashWithPrefix).not.toBe(hashWithoutPrefix);
    });
  });

  describe('folder-based state mapping', () => {
    it('should map completed folder to closed state', () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/completed/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Completed Task',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
          status: 'completed',
        },
        body: 'Done',
      };

      const result = mapper.taskToGitHub(task);

      expect(result.state).toBe('closed');
    });

    it('should map active folder to open state', () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/active/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Active Task',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
          status: 'active',
        },
        body: 'In progress',
      };

      const result = mapper.taskToGitHub(task);

      expect(result.state).toBe('open');
    });

    it('should map backlog folder to open state', () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/backlog/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Backlog Task',
          severity: 'P2',
          priority: 'low',
          component: [],
          labels: [],
          reporter: 'thom',
          status: 'backlog',
        },
        body: 'Future work',
      };

      const result = mapper.taskToGitHub(task);

      expect(result.state).toBe('open');
    });

    it('should use folder for state even when status field differs', () => {
      const task: TaskDocument = {
        issueNumber: 1,
        filename: '001-test.md',
        filepath: '/path/to/active/001-test.md',
        lastModified: new Date(),
        folderLastModified: new Date(),
        frontmatter: {
          created_utc: '2025-01-10T00:00:00Z',
          title: 'Task',
          severity: 'P2',
          priority: 'high',
          component: [],
          labels: [],
          reporter: 'thom',
          status: 'completed', // Says completed but in active/ folder
        },
        body: 'Body',
      };

      const result = mapper.taskToGitHub(task);

      expect(result.state).toBe('open'); // Folder wins (active/)
      expect(result.labels).toContain('status:completed'); // But status still in labels
    });
  });

  describe('hashIssue', () => {
    it('should generate hash for GitHub issue', () => {
      const issue: GitHubIssueData = {
        number: 1,
        title: 'Test Issue',
        body: 'Body',
        state: 'open',
        labels: ['bug', 'high'],
        assignee: 'john',
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: null,
      };

      const hash = mapper.hashIssue(issue);

      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });

    it('should sort labels for consistent hashing', () => {
      const issue1: GitHubIssueData = {
        number: 1,
        title: 'Test',
        body: 'Body',
        state: 'open',
        labels: ['bug', 'high'],
        assignee: null,
        created_at: '2025-01-10T00:00:00Z',
        updated_at: '2025-01-11T00:00:00Z',
        closed_at: null,
      };

      const issue2: GitHubIssueData = {
        ...issue1,
        labels: ['high', 'bug'], // Different order
      };

      const hash1 = mapper.hashIssue(issue1);
      const hash2 = mapper.hashIssue(issue2);

      expect(hash1).toBe(hash2); // Should be same due to sorting
    });
  });
});
