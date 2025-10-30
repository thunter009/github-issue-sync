#!/usr/bin/env node

/**
 * GitHub Issue Sync CLI
 *
 * Bidirectional sync between local markdown tasks and GitHub issues
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { config } from 'dotenv';
import { GitHubClient } from './lib/github-client';
import { MarkdownParser } from './lib/markdown-parser';
import { FieldMapper } from './lib/field-mapper';
import { SyncEngine } from './lib/sync-engine';
import { ConflictResolver } from './lib/conflict-resolver';

// Load environment variables from target project directory
config({ path: path.join(process.cwd(), '.env.local') });
config({ path: path.join(process.cwd(), '.env') });

// Get environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

// Use current working directory as project root (where command is run)
const PROJECT_ROOT = process.cwd();

/**
 * Initialize sync components
 */
function initializeSync(): {
  github: GitHubClient;
  parser: MarkdownParser;
  mapper: FieldMapper;
  engine: SyncEngine;
  resolver: ConflictResolver;
} {
  if (!GITHUB_TOKEN) {
    console.error(chalk.red('Error: GITHUB_TOKEN environment variable not set'));
    console.error(chalk.gray('Set it in your .env.local file or export it:'));
    console.error(chalk.gray('  export GITHUB_TOKEN=ghp_your_token_here'));
    process.exit(1);
  }

  if (!GITHUB_REPO) {
    console.error(chalk.red('Error: GITHUB_REPO environment variable not set'));
    console.error(chalk.gray('Set it in your .env.local file or export it:'));
    console.error(chalk.gray('  export GITHUB_REPO=owner/repo-name'));
    process.exit(1);
  }

  const github = new GitHubClient(GITHUB_TOKEN, GITHUB_REPO);
  const parser = new MarkdownParser(PROJECT_ROOT);
  const mapper = new FieldMapper();
  const engine = new SyncEngine(github, parser, mapper, PROJECT_ROOT);
  const resolver = new ConflictResolver(mapper);

  return { github, parser, mapper, engine, resolver };
}

/**
 * Verify GitHub access
 */
async function verifyAccess(github: GitHubClient): Promise<void> {
  const spinner = ora('Verifying GitHub access...').start();

  try {
    const hasAccess = await github.verifyAccess();

    if (!hasAccess) {
      spinner.fail('GitHub access verification failed');
      console.error(chalk.red('\nError: Unable to access repository'));
      console.error(chalk.gray(`Repo: ${GITHUB_REPO}`));
      console.error(chalk.gray('Check your GITHUB_TOKEN permissions'));
      process.exit(1);
    }

    spinner.succeed('GitHub access verified');
  } catch (error: any) {
    spinner.fail('GitHub access verification failed');
    console.error(chalk.red(`\nError: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Print sync result summary
 */
function printSyncResult(result: {
  pushed: number[];
  pulled: number[];
  conflicts: any[];
  skipped: number[];
  errors: Array<{ issueNumber: number; error: string }>;
}): void {
  console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.cyan('Sync Results'));
  console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

  if (result.pushed.length > 0) {
    console.log(chalk.green(`✓ Pushed to GitHub: ${result.pushed.length} issue(s)`));
    console.log(chalk.gray(`  #${result.pushed.join(', #')}`));
  }

  if (result.pulled.length > 0) {
    console.log(chalk.blue(`✓ Pulled from GitHub: ${result.pulled.length} issue(s)`));
    console.log(chalk.gray(`  #${result.pulled.join(', #')}`));
  }

  if (result.conflicts.length > 0) {
    console.log(chalk.yellow(`⚠ Conflicts: ${result.conflicts.length} issue(s)`));
    console.log(chalk.gray(`  #${result.conflicts.map((c) => c.issueNumber).join(', #')}`));
  }

  if (result.skipped.length > 0) {
    console.log(chalk.gray(`⊘ Skipped: ${result.skipped.length} issue(s)`));
  }

  if (result.errors.length > 0) {
    console.log(chalk.red(`✗ Errors: ${result.errors.length} issue(s)`));
    for (const err of result.errors) {
      console.log(chalk.red(`  #${err.issueNumber}: ${err.error}`));
    }
  }

  console.log();
}

// Create CLI
const program = new Command();

program
  .name('sync-issues')
  .description('Sync local markdown tasks with GitHub issues')
  .version('1.0.0');

// Sync command (default bidirectional)
program
  .command('sync', { isDefault: true })
  .description('Bidirectional sync between local and GitHub')
  .action(async () => {
    const { github, engine, resolver } = initializeSync();

    await verifyAccess(github);

    const spinner = ora('Syncing issues...').start();

    try {
      const result = await engine.sync();

      spinner.stop();

      // Handle conflicts interactively
      if (result.conflicts.length > 0) {
        const resolutions = await resolver.resolveConflicts(result.conflicts);

        // Apply resolutions
        for (const [issueNumber, resolution] of resolutions) {
          if (resolution === 'skip') {
            continue;
          }

          const conflict = result.conflicts.find((c) => c.issueNumber === issueNumber);
          if (!conflict) continue;

          await engine.resolveConflict(conflict, resolution);

          if (resolution === 'local') {
            result.pushed.push(issueNumber);
          } else {
            result.pulled.push(issueNumber);
          }
        }

        // Remove resolved conflicts
        result.conflicts = result.conflicts.filter((c) =>
          resolutions.get(c.issueNumber) === 'skip'
        );

        resolver.showSummary(resolutions);
      }

      printSyncResult(result);
    } catch (error: any) {
      spinner.fail('Sync failed');
      console.error(chalk.red(`\nError: ${error.message}`));
      process.exit(1);
    }
  });

// Push command
program
  .command('push')
  .description('Push local changes to GitHub (one-way)')
  .action(async () => {
    const { github, engine } = initializeSync();

    await verifyAccess(github);

    const spinner = ora('Pushing to GitHub...').start();

    try {
      const result = await engine.pushOnly();
      spinner.succeed('Push complete');

      printSyncResult(result);
    } catch (error: any) {
      spinner.fail('Push failed');
      console.error(chalk.red(`\nError: ${error.message}`));
      process.exit(1);
    }
  });

// Pull command
program
  .command('pull')
  .description('Pull changes from GitHub (one-way)')
  .action(async () => {
    const { github, engine } = initializeSync();

    await verifyAccess(github);

    const spinner = ora('Pulling from GitHub...').start();

    try {
      const result = await engine.pullOnly();
      spinner.succeed('Pull complete');

      printSyncResult(result);
    } catch (error: any) {
      spinner.fail('Pull failed');
      console.error(chalk.red(`\nError: ${error.message}`));
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show sync status without making changes')
  .action(async () => {
    const { github, engine } = initializeSync();

    await verifyAccess(github);

    const spinner = ora('Checking status...').start();

    try {
      const { toSync, conflicts } = await engine.status();

      spinner.succeed('Status check complete');

      console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.bold.cyan('Sync Status'));
      console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

      if (toSync.length === 0 && conflicts.length === 0) {
        console.log(chalk.green('✓ Everything is in sync'));
      } else {
        if (toSync.length > 0) {
          console.log(chalk.yellow(`${toSync.length} issue(s) need syncing:`));
          console.log(chalk.gray(`  #${toSync.join(', #')}`));
        }

        if (conflicts.length > 0) {
          console.log(
            chalk.red(`${conflicts.length} conflict(s) need resolution:`)
          );
          console.log(
            chalk.gray(
              `  #${conflicts.map((c) => c.issueNumber).join(', #')}`
            )
          );
        }
      }

      console.log();
    } catch (error: any) {
      spinner.fail('Status check failed');
      console.error(chalk.red(`\nError: ${error.message}`));
      process.exit(1);
    }
  });

// Parse and execute
program.parse();
