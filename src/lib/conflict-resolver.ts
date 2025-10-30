/**
 * Interactive conflict resolver with diff display
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { diffLines } from 'diff';
import { SyncConflict, ConflictResolution } from './types';
import { FieldMapper } from './field-mapper';

export class ConflictResolver {
  private mapper: FieldMapper;

  constructor(mapper: FieldMapper) {
    this.mapper = mapper;
  }

  /**
   * Resolve conflicts interactively
   */
  async resolveConflicts(conflicts: SyncConflict[]): Promise<Map<number, ConflictResolution>> {
    const resolutions = new Map<number, ConflictResolution>();

    console.log(chalk.yellow(`\n⚠️  Found ${conflicts.length} conflict(s)\n`));

    let skipAll = false;

    for (let i = 0; i < conflicts.length; i++) {
      const conflict = conflicts[i];

      if (skipAll) {
        resolutions.set(conflict.issueNumber, 'skip');
        continue;
      }

      const resolution = await this.resolveConflict(conflict, i + 1, conflicts.length);

      if (resolution === 'skip-all') {
        skipAll = true;
        resolutions.set(conflict.issueNumber, 'skip');
      } else {
        resolutions.set(conflict.issueNumber, resolution);
      }
    }

    return resolutions;
  }

  /**
   * Resolve a single conflict
   */
  private async resolveConflict(conflict: SyncConflict, index: number, total: number): Promise<ConflictResolution | 'skip-all'> {
    console.log(chalk.bold(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
    console.log(chalk.bold.cyan(`Conflict ${index}/${total}: Issue #${conflict.issueNumber}`));
    console.log(chalk.bold(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`));

    console.log(chalk.gray(`File: ${conflict.filename}`));
    console.log(
      chalk.gray(
        `Local modified: ${conflict.localModified.toLocaleString()}`
      )
    );
    console.log(
      chalk.gray(
        `Remote modified: ${conflict.remoteModified.toLocaleString()}`
      )
    );
    console.log();

    // Show title diff
    this.showTitleDiff(conflict);

    // Show body diff
    this.showBodyDiff(conflict);

    // Show labels diff
    this.showLabelsDiff(conflict);

    // Ask for resolution
    const choices = [
      {
        name: chalk.red('Use local version (keep markdown, update GitHub)'),
        value: 'local',
      },
      {
        name: chalk.green('Use remote version (keep GitHub, update markdown)'),
        value: 'remote',
      },
      {
        name: chalk.yellow('Skip this conflict for now'),
        value: 'skip',
      },
    ];

    // Add "skip all" option if there are multiple conflicts remaining
    if (total > 1 && index < total) {
      choices.push({
        name: chalk.gray('Skip all remaining conflicts'),
        value: 'skip-all',
      });
    }

    const answer = await inquirer.prompt<{ action: string }>([
      {
        type: 'list',
        name: 'action',
        message: 'How do you want to resolve this conflict?',
        choices,
      },
    ]);

    return answer.action as ConflictResolution | 'skip-all';
  }

  /**
   * Show title diff
   */
  private showTitleDiff(conflict: SyncConflict): void {
    const localTitle = conflict.localData.frontmatter.title;
    const remoteTitle = conflict.remoteData.title;

    if (localTitle !== remoteTitle) {
      console.log(chalk.bold('Title:'));
      console.log(chalk.red(`  Local:  ${localTitle}`));
      console.log(chalk.green(`  Remote: ${remoteTitle}`));
      console.log();
    }
  }

  /**
   * Show body diff with line-by-line comparison
   */
  private showBodyDiff(conflict: SyncConflict): void {
    const localBody = conflict.localData.body;
    const remoteBody = conflict.remoteData.body || '';

    // Parse remote body to remove metadata
    const { body: cleanRemoteBody } = this.parseRemoteBody(remoteBody);

    if (localBody !== cleanRemoteBody) {
      console.log(chalk.bold('Body:'));

      const diff = diffLines(localBody, cleanRemoteBody);
      let hasChanges = false;

      for (const part of diff) {
        if (part.added) {
          console.log(chalk.green('  + ' + part.value.replace(/\n/g, '\n  + ')));
          hasChanges = true;
        } else if (part.removed) {
          console.log(chalk.red('  - ' + part.value.replace(/\n/g, '\n  - ')));
          hasChanges = true;
        }
      }

      if (!hasChanges) {
        console.log(chalk.gray('  (No significant changes)'));
      }
      console.log();
    }
  }

  /**
   * Show labels diff
   */
  private showLabelsDiff(conflict: SyncConflict): void {
    const localData = this.mapper.taskToGitHub(conflict.localData);
    const localLabels = new Set(localData.labels);
    const remoteLabels = new Set(conflict.remoteData.labels);

    const added = [...remoteLabels].filter((l) => !localLabels.has(l));
    const removed = [...localLabels].filter((l) => !remoteLabels.has(l));

    if (added.length > 0 || removed.length > 0) {
      console.log(chalk.bold('Labels:'));

      if (added.length > 0) {
        console.log(chalk.green(`  + ${added.join(', ')}`));
      }

      if (removed.length > 0) {
        console.log(chalk.red(`  - ${removed.join(', ')}`));
      }

      console.log();
    }
  }

  /**
   * Parse remote body to extract clean content
   */
  private parseRemoteBody(body: string): { body: string } {
    // Remove metadata comment
    body = body.replace(/<!-- metadata\n[\s\S]*?\n-->\n\n/, '');

    // Remove sync footer
    body = body.replace(/\n\n---\n\n\*Synced from local task:.*?\*\s*$/, '');

    return { body: body.trim() };
  }

  /**
   * Show summary of resolutions
   */
  showSummary(resolutions: Map<number, ConflictResolution>): void {
    console.log(chalk.bold(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
    console.log(chalk.bold.cyan(`Resolution Summary`));
    console.log(chalk.bold(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`));

    const byType = {
      local: [] as number[],
      remote: [] as number[],
      skip: [] as number[],
    };

    for (const [issueNumber, resolution] of resolutions) {
      byType[resolution].push(issueNumber);
    }

    if (byType.local.length > 0) {
      console.log(chalk.red(`✓ Using local version: #${byType.local.join(', #')}`));
    }

    if (byType.remote.length > 0) {
      console.log(chalk.green(`✓ Using remote version: #${byType.remote.join(', #')}`));
    }

    if (byType.skip.length > 0) {
      console.log(chalk.yellow(`⊘ Skipped: #${byType.skip.join(', #')}`));
    }

    console.log();
  }
}
