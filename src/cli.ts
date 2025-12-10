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
import fs from 'fs';
import { config } from 'dotenv';
import { execSync } from 'child_process';
import { GitHubClient } from './lib/github-client';
import { FieldMapper } from './lib/field-mapper';
import { SyncEngine } from './lib/sync-engine';
import { ConflictResolver } from './lib/conflict-resolver';
import { SyncFilter } from './lib/types';
import { ParserRegistry, TasksParser, OpenSpecParser, SourceType } from './lib/parsers';

// Load environment variables from target project directory
config({ path: path.join(process.cwd(), '.env.local') });
config({ path: path.join(process.cwd(), '.env') });

// Use current working directory as project root (where command is run)
const PROJECT_ROOT = process.cwd();

/**
 * Detect GitHub repo from git remote URL
 */
function detectGitHubRepo(): string | null {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    }).trim();

    // Parse owner/repo from URL formats:
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    return match ? match[1].replace(/\.git$/, '') : null;
  } catch {
    return null;
  }
}

// Get environment variables
const GITHUB_REPO = process.env.GITHUB_REPO || detectGitHubRepo();

/**
 * Get GitHub token from gh CLI or env var
 */
function getGitHubToken(): string | null {
  // Try gh CLI first (uses keyring)
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (token) return token;
  } catch {
    // gh CLI not available or not authenticated
  }

  // Fall back to env var (for CI/CD)
  return process.env.GITHUB_TOKEN || null;
}
const IGNORED_DIRS_ENV = process.env.SYNC_IGNORE_DIRS?.split(',').map(d => d.trim()) || [];

/**
 * Parse source types from CLI option
 */
function parseSourceTypes(sources?: string[]): (SourceType | 'all')[] {
  if (!sources || sources.length === 0 || sources.includes('all')) {
    return ['all'];
  }
  return sources.filter((s): s is SourceType | 'all' =>
    s === 'tasks' || s === 'openspec' || s === 'all'
  );
}

/**
 * Initialize sync components
 */
function initializeSync(
  ignoredDirs: string[] = [],
  keepTitlePrefixes: boolean = false,
  sources: (SourceType | 'all')[] = ['all']
): {
  github: GitHubClient;
  registry: ParserRegistry;
  mapper: FieldMapper;
  engine: SyncEngine;
  resolver: ConflictResolver;
} {
  const token = getGitHubToken();
  if (!token) {
    console.error(chalk.red('Error: No GitHub authentication found'));
    console.error(chalk.gray('Either run:'));
    console.error(chalk.gray('  gh auth login'));
    console.error(chalk.gray('Or set GITHUB_TOKEN env var (for CI/CD)'));
    process.exit(1);
  }

  if (!GITHUB_REPO) {
    console.error(chalk.red('Error: Could not determine GitHub repository'));
    console.error(chalk.gray('No git remote found and GITHUB_REPO not set.'));
    console.error(chalk.gray('Either:'));
    console.error(chalk.gray('  1. Add a GitHub remote: git remote add origin https://github.com/owner/repo'));
    console.error(chalk.gray('  2. Set GITHUB_REPO in .env.local: GITHUB_REPO=owner/repo-name'));
    process.exit(1);
  }

  const github = new GitHubClient(token, GITHUB_REPO);
  const mapper = new FieldMapper({ keepTitlePrefixes });

  // Create parser registry and register enabled parsers
  const registry = new ParserRegistry();
  const includeAll = sources.includes('all');

  // Register tasks parser if enabled
  if (includeAll || sources.includes('tasks')) {
    registry.register(new TasksParser(PROJECT_ROOT, ignoredDirs));
  }

  // Register openspec parser if enabled and openspec directory exists
  if (includeAll || sources.includes('openspec')) {
    const openspecDir = path.join(PROJECT_ROOT, 'openspec', 'changes');
    if (fs.existsSync(openspecDir)) {
      registry.register(new OpenSpecParser(PROJECT_ROOT));
    }
  }

  // Ensure at least one parser is registered
  if (registry.getAll().length === 0) {
    console.error(chalk.red('Error: No sources available to sync'));
    console.error(chalk.gray('No tasks directory or openspec/changes directory found.'));
    process.exit(1);
  }

  const engine = new SyncEngine(github, registry, mapper, PROJECT_ROOT, GITHUB_REPO);
  const resolver = new ConflictResolver(mapper);

  return { github, registry, mapper, engine, resolver };
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
      console.error(chalk.gray('Check your gh auth or GITHUB_TOKEN permissions'));
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
  .option('--create', 'Create new GitHub issues from files without issue numbers')
  .option('--clean', 'Clean up orphaned local files (where GitHub issues were deleted)')
  .option('--strip-orphans', 'Strip issue numbers from files without corresponding GitHub issues')
  .option('--file <path>', 'Sync only the specified file')
  .option('--issue <number>', 'Sync only the specified issue number', parseInt)
  .option('--source <types...>', 'Source types to sync (tasks|openspec|all)', ['all'])
  .option('--ignore-dir <dirs...>', 'Directories to ignore (e.g., completed active)')
  .option('--keep-title-prefixes', 'Keep [#NNN] prefixes in GitHub issue titles')
  .action(async (options) => {
    // Combine ignored directories from environment and CLI
    const ignoredDirs = [...IGNORED_DIRS_ENV, ...(options.ignoreDir || [])];
    if (ignoredDirs.length > 0) {
      console.log(chalk.gray(`Ignoring directories: ${ignoredDirs.join(', ')}`));
    }

    const sourceTypes = parseSourceTypes(options.source);
    const { github, engine, resolver } = initializeSync(ignoredDirs, options.keepTitlePrefixes, sourceTypes);

    await verifyAccess(github);

    // Validate filter options
    if (options.file && options.issue) {
      console.error(chalk.red('Error: Cannot specify both --file and --issue'));
      process.exit(1);
    }

    let filter: SyncFilter | undefined;
    if (options.file) {
      filter = { filepath: path.resolve(PROJECT_ROOT, options.file) };
    }
    if (options.issue) {
      filter = { issueNumber: options.issue };
    }

    // Handle cleanup first if flag is set
    if (options.clean) {
      try {
        const cleanResult = await engine.cleanOrphanedTasks();

        if (cleanResult.deleted.length > 0) {
          console.log(chalk.bold.red('\n✗ Deleted Files:'));
          for (const filename of cleanResult.deleted) {
            console.log(chalk.red(`  ${filename}`));
          }
        }

        if (cleanResult.skipped.length > 0) {
          console.log(chalk.bold.gray('\n○ Skipped Files:'));
          for (const filename of cleanResult.skipped) {
            console.log(chalk.gray(`  ${filename}`));
          }
        }

        console.log();
      } catch (error: any) {
        console.error(chalk.red(`\nCleanup failed: ${error.message}`));
        process.exit(1);
      }
    }

    // Handle stripping orphaned issue numbers if flag is set
    if (options.stripOrphans) {
      const stripSpinner = ora('Checking for orphaned numbered files...').start();

      try {
        stripSpinner.stop();
        const stripResult = await engine.stripOrphanedFiles();

        if (stripResult.stripped.length > 0) {
          console.log(chalk.bold.cyan('\n✓ Stripped issue numbers:'));
          for (const item of stripResult.stripped) {
            console.log(chalk.green(`  ${item.oldFilename} → ${item.newFilename}`));
          }
        }

        if (stripResult.errors.length > 0) {
          console.log(chalk.bold.red('\n✗ Failed to strip:'));
          for (const err of stripResult.errors) {
            console.log(chalk.red(`  ${err.filename}: ${err.error}`));
          }
        }

        if (stripResult.stripped.length === 0 && stripResult.errors.length === 0) {
          console.log(chalk.gray('No orphaned numbered files to strip'));
        }

        console.log();
      } catch (error: any) {
        stripSpinner.fail('Strip orphans failed');
        console.error(chalk.red(`\nError: ${error.message}`));
        process.exit(1);
      }
    }

    // Handle issue creation if flag is set
    if (options.create) {
      const createSpinner = ora('Creating new issues...').start();

      try {
        const createResult = await engine.createNewIssues();

        createSpinner.stop();

        if (createResult.created.length > 0) {
          console.log(chalk.bold.cyan('\n✓ Created Issues:'));
          for (const item of createResult.created) {
            console.log(
              chalk.green(
                `  ${item.filename} → #${item.issueNumber} (${item.newFilename})`
              )
            );
          }
        }

        if (createResult.errors.length > 0) {
          console.log(chalk.bold.red('\n✗ Failed to create:'));
          for (const err of createResult.errors) {
            console.log(chalk.red(`  ${err.filename}: ${err.error}`));
          }
        }

        if (createResult.created.length === 0 && createResult.errors.length === 0) {
          console.log(chalk.gray('No new issues to create'));
        }

        console.log();
      } catch (error: any) {
        createSpinner.fail('Issue creation failed');
        console.error(chalk.red(`\nError: ${error.message}`));
        process.exit(1);
      }
    }

    const spinner = ora('Syncing issues...').start();

    try {
      const result = await engine.sync(filter);

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
  .option('--file <path>', 'Push only the specified file')
  .option('--issue <number>', 'Push only the specified issue number', parseInt)
  .option('--source <types...>', 'Source types to sync (tasks|openspec|all)', ['all'])
  .option('--ignore-dir <dirs...>', 'Directories to ignore (e.g., completed active)')
  .option('--keep-title-prefixes', 'Keep [#NNN] prefixes in GitHub issue titles')
  .action(async (options) => {
    const ignoredDirs = [...IGNORED_DIRS_ENV, ...(options.ignoreDir || [])];
    const sourceTypes = parseSourceTypes(options.source);
    const { github, engine } = initializeSync(ignoredDirs, options.keepTitlePrefixes, sourceTypes);

    await verifyAccess(github);

    // Validate filter options
    if (options.file && options.issue) {
      console.error(chalk.red('Error: Cannot specify both --file and --issue'));
      process.exit(1);
    }

    let filter: SyncFilter | undefined;
    if (options.file) {
      filter = { filepath: path.resolve(PROJECT_ROOT, options.file) };
    }
    if (options.issue) {
      filter = { issueNumber: options.issue };
    }

    const spinner = ora('Pushing to GitHub...').start();

    try {
      const result = await engine.pushOnly(filter);
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
  .option('--file <path>', 'Pull only the specified file')
  .option('--issue <number>', 'Pull only the specified issue number', parseInt)
  .option('--source <types...>', 'Source types to sync (tasks|openspec|all)', ['all'])
  .option('--ignore-dir <dirs...>', 'Directories to ignore (e.g., completed active)')
  .action(async (options) => {
    const ignoredDirs = [...IGNORED_DIRS_ENV, ...(options.ignoreDir || [])];
    const sourceTypes = parseSourceTypes(options.source);
    const { github, engine } = initializeSync(ignoredDirs, false, sourceTypes);

    await verifyAccess(github);

    // Validate filter options
    if (options.file && options.issue) {
      console.error(chalk.red('Error: Cannot specify both --file and --issue'));
      process.exit(1);
    }

    let filter: SyncFilter | undefined;
    if (options.file) {
      filter = { filepath: path.resolve(PROJECT_ROOT, options.file) };
    }
    if (options.issue) {
      filter = { issueNumber: options.issue };
    }

    const spinner = ora('Pulling from GitHub...').start();

    try {
      const result = await engine.pullOnly(filter);
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
  .option('--file <path>', 'Check status of only the specified file')
  .option('--issue <number>', 'Check status of only the specified issue number', parseInt)
  .option('--source <types...>', 'Source types to sync (tasks|openspec|all)', ['all'])
  .option('--ignore-dir <dirs...>', 'Directories to ignore (e.g., completed active)')
  .option('--strip-orphans', 'Show which files would have issue numbers stripped')
  .action(async (options) => {
    const ignoredDirs = [...IGNORED_DIRS_ENV, ...(options.ignoreDir || [])];
    const sourceTypes = parseSourceTypes(options.source);
    const { github, engine } = initializeSync(ignoredDirs, false, sourceTypes);

    await verifyAccess(github);

    // Validate filter options
    if (options.file && options.issue) {
      console.error(chalk.red('Error: Cannot specify both --file and --issue'));
      process.exit(1);
    }

    let filter: SyncFilter | undefined;
    if (options.file) {
      filter = { filepath: path.resolve(PROJECT_ROOT, options.file) };
    }
    if (options.issue) {
      filter = { issueNumber: options.issue };
    }

    const spinner = ora('Checking status...').start();

    try {
      // Check for orphaned files if --strip-orphans flag is set
      let orphanedFiles: Array<{ issueNumber: number; filename: string; filepath: string }> = [];
      if (options.stripOrphans) {
        orphanedFiles = await engine.previewStripOrphanedFiles();
      }

      const { toSync, conflicts } = await engine.status(filter);

      spinner.succeed('Status check complete');

      console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.bold.cyan('Sync Status'));
      console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

      // Show orphaned files that would be stripped
      if (options.stripOrphans) {
        if (orphanedFiles.length > 0) {
          console.log(chalk.yellow(`${orphanedFiles.length} file(s) would have numbers stripped:`));
          for (const file of orphanedFiles) {
            const newFilename = file.filename.replace(/^\d+-/, '');
            console.log(chalk.gray(`  #${file.issueNumber}: ${file.filename} → ${newFilename}`));
          }
          console.log(chalk.gray('\nRun "sync --strip-orphans" to strip these numbers'));
          console.log(chalk.gray('Run "sync --strip-orphans --create" to strip and create new issues\n'));
        } else {
          console.log(chalk.green('✓ No orphaned numbered files found\n'));
        }
      }

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

// Create command
program
  .command('create')
  .description('Create new GitHub issues from files without issue numbers')
  .option('--source <types...>', 'Source types to create from (tasks|openspec|all)', ['all'])
  .action(async (options) => {
    const sourceTypes = parseSourceTypes(options.source);
    const { github, engine } = initializeSync([], false, sourceTypes);

    await verifyAccess(github);

    const spinner = ora('Creating new issues...').start();

    try {
      const result = await engine.createNewIssues();

      spinner.stop();

      console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.bold.cyan('Issue Creation Results'));
      console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

      if (result.created.length > 0) {
        console.log(chalk.green(`✓ Created ${result.created.length} issue(s):`));
        for (const item of result.created) {
          console.log(
            chalk.gray(
              `  ${item.filename} → #${item.issueNumber} (${item.newFilename})`
            )
          );
        }
      }

      if (result.errors.length > 0) {
        console.log(chalk.red(`\n✗ Failed ${result.errors.length} issue(s):`));
        for (const err of result.errors) {
          console.log(chalk.red(`  ${err.filename}: ${err.error}`));
        }
      }

      if (result.created.length === 0 && result.errors.length === 0) {
        console.log(chalk.gray('No new issues to create'));
      }

      console.log();
    } catch (error: any) {
      spinner.fail('Issue creation failed');
      console.error(chalk.red(`\nError: ${error.message}`));
      process.exit(1);
    }
  });

// Parse and execute
program.parse();
