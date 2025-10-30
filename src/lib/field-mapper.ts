/**
 * Bidirectional field mapper between markdown frontmatter and GitHub issues
 */

import { TaskDocument, TaskFrontmatter, GitHubIssueData } from './types';

export class FieldMapper {
  // Map local assignee names to GitHub usernames
  private readonly assigneeMap: Record<string, string> = {
    thom: 'thunter009',
  };

  /**
   * Convert task document to GitHub issue format
   */
  taskToGitHub(task: TaskDocument): {
    title: string;
    body: string;
    labels: string[];
    assignee?: string;
    state: 'open' | 'closed';
  } {
    const { frontmatter, body } = task;

    // Combine all labels
    const labels = [
      ...frontmatter.labels,
      ...frontmatter.component.map((c) => `component:${c}`),
      `priority:${frontmatter.priority}`,
      `severity:${frontmatter.severity}`,
    ];

    if (frontmatter.type) {
      labels.push(`type:${frontmatter.type}`);
    }

    if (frontmatter.status) {
      labels.push(`status:${frontmatter.status}`);
    }

    // Determine state
    const state = frontmatter.status === 'completed' ? 'closed' : 'open';

    // Map assignee to GitHub username
    let assignee: string | undefined = undefined;
    if (frontmatter.assignee && frontmatter.assignee !== 'unassigned') {
      assignee = this.assigneeMap[frontmatter.assignee] || frontmatter.assignee;
    }

    return {
      title: frontmatter.title,
      body: this.buildIssueBody(frontmatter, body),
      labels: [...new Set(labels)], // Remove duplicates
      assignee,
      state,
    };
  }

  /**
   * Convert GitHub issue to task document format
   */
  githubToTask(issue: GitHubIssueData, existingTask?: TaskDocument): {
    frontmatter: Partial<TaskFrontmatter>;
    body: string;
  } {
    // Parse labels
    const { labels, priority, severity, type, component, status } = this.parseLabels(issue.labels);

    // Extract body and metadata from issue body
    const { body, metadata } = this.parseIssueBody(issue.body || '');

    const frontmatter: Partial<TaskFrontmatter> = {
      title: issue.title,
      labels,
      priority: priority || 'medium',
      severity: severity || 'P2',
      component: component,
      assignee: issue.assignee || 'unassigned',
      created_utc: existingTask?.frontmatter.created_utc || issue.created_at,
      reporter: existingTask?.frontmatter.reporter || 'System',
    };

    // Add optional fields
    if (type) frontmatter.type = type;

    // Determine status from issue state and labels
    if (issue.state === 'closed') {
      frontmatter.status = 'completed';
      frontmatter.completed_utc = issue.closed_at || new Date().toISOString();
    } else if (status) {
      frontmatter.status = status;
    }

    // Preserve existing fields if updating
    if (existingTask) {
      frontmatter.parent_epic = existingTask.frontmatter.parent_epic;
      frontmatter.epic_progress = existingTask.frontmatter.epic_progress;
      frontmatter.commit = existingTask.frontmatter.commit;
      frontmatter.commit_url = existingTask.frontmatter.commit_url;
      frontmatter.relates_to = existingTask.frontmatter.relates_to;
      frontmatter.due_date = existingTask.frontmatter.due_date;
    }

    return {
      frontmatter,
      body: body || '',
    };
  }

  /**
   * Build issue body with metadata section
   */
  private buildIssueBody(frontmatter: TaskFrontmatter, body: string): string {
    const metadata: string[] = [];

    if (frontmatter.reporter) {
      metadata.push(`**Reporter:** ${frontmatter.reporter}`);
    }

    if (frontmatter.due_date) {
      metadata.push(`**Due Date:** ${frontmatter.due_date}`);
    }

    if (frontmatter.parent_epic) {
      metadata.push(`**Epic:** ${frontmatter.parent_epic}`);
    }

    if (frontmatter.epic_progress) {
      metadata.push(`**Progress:** ${frontmatter.epic_progress}`);
    }

    if (frontmatter.relates_to && frontmatter.relates_to.length > 0) {
      metadata.push(`**Related:** ${frontmatter.relates_to.join(', ')}`);
    }

    if (frontmatter.commit_url) {
      metadata.push(`**Commit:** ${frontmatter.commit_url}`);
    }

    let issueBody = body;

    if (metadata.length > 0) {
      issueBody = `<!-- metadata\n${metadata.join('\n')}\n-->\n\n${body}`;
    }

    // Add sync footer
    issueBody += `\n\n---\n\n*Synced from local task: ${frontmatter.title}*`;

    return issueBody;
  }

  /**
   * Parse issue body to extract metadata and content
   */
  private parseIssueBody(body: string): { body: string; metadata: Record<string, string> } {
    const metadata: Record<string, string> = {};

    // Extract metadata comment
    const metadataMatch = body.match(/<!-- metadata\n([\s\S]*?)\n-->/);

    if (metadataMatch) {
      const metadataText = metadataMatch[1];
      const lines = metadataText.split('\n');

      for (const line of lines) {
        const match = line.match(/\*\*(.+?):\*\*\s*(.+)/);
        if (match) {
          metadata[match[1].toLowerCase()] = match[2];
        }
      }

      // Remove metadata from body
      body = body.replace(/<!-- metadata\n[\s\S]*?\n-->\n\n/, '');
    }

    // Remove sync footer
    body = body.replace(/\n\n---\n\n\*Synced from local task:.*?\*\s*$/, '');

    return { body: body.trim(), metadata };
  }

  /**
   * Parse GitHub labels into structured fields
   */
  private parseLabels(labels: string[]): {
    labels: string[];
    priority?: TaskFrontmatter['priority'];
    severity?: TaskFrontmatter['severity'];
    type?: TaskFrontmatter['type'];
    component: string[];
    status?: TaskFrontmatter['status'];
  } {
    const result = {
      labels: [] as string[],
      priority: undefined as TaskFrontmatter['priority'] | undefined,
      severity: undefined as TaskFrontmatter['severity'] | undefined,
      type: undefined as TaskFrontmatter['type'] | undefined,
      component: [] as string[],
      status: undefined as TaskFrontmatter['status'] | undefined,
    };

    for (const label of labels) {
      if (label.startsWith('priority:')) {
        result.priority = label.replace('priority:', '') as TaskFrontmatter['priority'];
      } else if (label.startsWith('severity:')) {
        result.severity = label.replace('severity:', '') as TaskFrontmatter['severity'];
      } else if (label.startsWith('type:')) {
        result.type = label.replace('type:', '') as TaskFrontmatter['type'];
      } else if (label.startsWith('component:')) {
        result.component.push(label.replace('component:', ''));
      } else if (label.startsWith('status:')) {
        result.status = label.replace('status:', '') as TaskFrontmatter['status'];
      } else {
        result.labels.push(label);
      }
    }

    return result;
  }

  /**
   * Generate a hash for content comparison
   */
  generateHash(content: string): string {
    // Simple hash for content comparison
    // In production, use crypto.createHash('sha256')
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Generate hash for task document
   */
  hashTask(task: TaskDocument): string {
    const content = JSON.stringify({
      frontmatter: task.frontmatter,
      body: task.body,
    });
    return this.generateHash(content);
  }

  /**
   * Generate hash for GitHub issue
   */
  hashIssue(issue: GitHubIssueData): string {
    const content = JSON.stringify({
      title: issue.title,
      body: issue.body,
      labels: issue.labels.sort(),
      assignee: issue.assignee,
      state: issue.state,
    });
    return this.generateHash(content);
  }
}
