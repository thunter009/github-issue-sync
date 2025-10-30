/**
 * GitHub API client wrapper using Octokit
 */

import { Octokit } from '@octokit/rest';
import { GitHubIssueData } from './types';

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private labelCache: Map<string, { color: string }> | null = null;

  // Label color scheme - consistent colors for grouped labels
  private labelColors: Record<string, string> = {
    // Priority labels - shades of red/orange
    'priority:blocker': 'b60205',   // dark red
    'priority:critical': 'd93f0b',  // red-orange
    'priority:high': 'fbca04',      // orange
    'priority:medium': 'fef2c0',    // light orange
    'priority:low': 'e4e4e4',       // light gray

    // Severity labels - shades of purple
    'severity:P0': '5319e7',        // dark purple
    'severity:P1': '7057ff',        // purple
    'severity:P2': '9d84ff',        // light purple
    'severity:P3': 'd4c5f9',        // pale purple

    // Status labels - shades of blue/green
    'status:backlog': 'ededed',     // light gray
    'status:active': '0075ca',      // blue
    'status:completed': '0e8a16',   // green

    // Type labels - varied colors
    'type:epic': 'b60205',          // dark red
    'type:feature': '1d76db',       // blue
    'type:bug': 'd93f0b',           // red-orange
    'type:enhancement': 'a2eeef',   // light blue

    // Component labels - shades of teal/cyan
    'component:frontend': '006b75', // dark teal
    'component:backend': '0e8a16',  // green
    'component:ui': '1d76db',       // blue
    'component:api': '5319e7',      // purple
    'component:database': 'd93f0b', // orange
    'component:docs': 'c5def5',     // pale blue
    'component:tests': 'fbca04',    // yellow
  };

  constructor(token: string, repoFullName: string) {
    this.octokit = new Octokit({
      auth: token,
      log: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: console.error,
      },
    });

    // Parse owner/repo from full name (e.g., "thunter009/notice-wise-ui-k1")
    const parts = repoFullName.split('/');
    if (parts.length !== 2) {
      throw new Error(`Invalid repo format: ${repoFullName}. Expected "owner/repo"`);
    }
    this.owner = parts[0];
    this.repo = parts[1];
  }

  /**
   * Get a single issue by number
   */
  async getIssue(issueNumber: number): Promise<GitHubIssueData | null> {
    try {
      const { data } = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
      });

      // Skip pull requests (they can't be updated via issues API)
      if (data.pull_request) {
        return null;
      }

      return {
        number: data.number,
        title: data.title,
        body: data.body || null,
        state: data.state as 'open' | 'closed',
        labels: data.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
        assignee: data.assignee?.login || null,
        created_at: data.created_at,
        updated_at: data.updated_at,
        closed_at: data.closed_at || null,
      };
    } catch (error: any) {
      if (error.status === 404) {
        return null; // Issue doesn't exist
      }
      throw error;
    }
  }

  /**
   * Get multiple issues by numbers
   */
  async getIssues(issueNumbers: number[]): Promise<Map<number, GitHubIssueData>> {
    const results = new Map<number, GitHubIssueData>();

    // Fetch in parallel with rate limit consideration
    const chunks = this.chunkArray(issueNumbers, 10);

    for (const chunk of chunks) {
      const promises = chunk.map((num) => this.getIssue(num));
      const issues = await Promise.all(promises);

      issues.forEach((issue, idx) => {
        if (issue) {
          results.set(chunk[idx], issue);
        }
      });
    }

    return results;
  }

  /**
   * Create a new issue
   */
  async createIssue(
    title: string,
    body: string,
    labels: string[],
    assignee?: string
  ): Promise<GitHubIssueData> {
    const { data } = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      labels,
      assignee,
    });

    return {
      number: data.number,
      title: data.title,
      body: data.body || null,
      state: data.state as 'open' | 'closed',
      labels: data.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
      assignee: data.assignee?.login || null,
      created_at: data.created_at,
      updated_at: data.updated_at,
      closed_at: data.closed_at || null,
    };
  }

  /**
   * Update an existing issue
   */
  async updateIssue(
    issueNumber: number,
    updates: {
      title?: string;
      body?: string;
      labels?: string[];
      assignee?: string;
      state?: 'open' | 'closed';
    }
  ): Promise<GitHubIssueData> {
    const { data } = await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      ...updates,
    });

    return {
      number: data.number,
      title: data.title,
      body: data.body || null,
      state: data.state as 'open' | 'closed',
      labels: data.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
      assignee: data.assignee?.login || null,
      created_at: data.created_at,
      updated_at: data.updated_at,
      closed_at: data.closed_at || null,
    };
  }

  /**
   * Close an issue
   */
  async closeIssue(issueNumber: number): Promise<void> {
    await this.updateIssue(issueNumber, { state: 'closed' });
  }

  /**
   * Reopen an issue
   */
  async reopenIssue(issueNumber: number): Promise<void> {
    await this.updateIssue(issueNumber, { state: 'open' });
  }

  /**
   * Verify GitHub token has correct permissions
   */
  async verifyAccess(): Promise<boolean> {
    try {
      await this.octokit.repos.get({
        owner: this.owner,
        repo: this.repo,
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fetch all labels and populate cache
   */
  private async fetchLabelCache(): Promise<void> {
    if (this.labelCache) return; // Already cached

    this.labelCache = new Map();

    try {
      const { data } = await this.octokit.issues.listLabelsForRepo({
        owner: this.owner,
        repo: this.repo,
        per_page: 100,
      });

      for (const label of data) {
        this.labelCache.set(label.name, { color: label.color });
      }
    } catch (error) {
      // If we can't fetch labels, start with empty cache
      this.labelCache = new Map();
    }
  }

  /**
   * Ensure label exists with correct color
   */
  private async ensureLabel(name: string, color?: string): Promise<void> {
    const labelColor = color || this.labelColors[name] || this.getDefaultColorForLabel(name);

    // Check cache
    const cached = this.labelCache?.get(name);

    if (cached) {
      // Label exists, update color if different
      if (cached.color !== labelColor) {
        await this.octokit.issues.updateLabel({
          owner: this.owner,
          repo: this.repo,
          name,
          color: labelColor,
        });
        cached.color = labelColor; // Update cache
      }
    } else {
      // Label doesn't exist, create it
      await this.octokit.issues.createLabel({
        owner: this.owner,
        repo: this.repo,
        name,
        color: labelColor,
      });
      // Add to cache
      this.labelCache?.set(name, { color: labelColor });
    }
  }

  /**
   * Get default color for a label based on prefix
   */
  private getDefaultColorForLabel(name: string): string {
    // Match prefix patterns and assign group colors
    if (name.startsWith('priority:')) return 'fbca04'; // orange
    if (name.startsWith('severity:')) return '9d84ff'; // light purple
    if (name.startsWith('status:')) return '0075ca';   // blue
    if (name.startsWith('type:')) return '1d76db';     // blue
    if (name.startsWith('component:')) return '006b75'; // teal

    // Default gray for unrecognized labels
    return 'ededed';
  }

  /**
   * Ensure all labels in a list exist with correct colors
   */
  async ensureLabels(labels: string[]): Promise<void> {
    // Fetch label cache once before processing all labels
    await this.fetchLabelCache();

    // Process all labels
    for (const label of labels) {
      await this.ensureLabel(label);
    }
  }

  /**
   * Helper to chunk array for rate limiting
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
