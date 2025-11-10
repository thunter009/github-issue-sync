# Task Management System

This directory organizes development tasks and technical improvements for the GitHub Issue Sync repository.

## Directory Structure

### `active/`
Current high-priority tasks that need to be completed in sequence. Files are prefixed with numbers (01-, 02-, etc.) to indicate order.

### `backlog/`
Tasks that should be done but have no specific timeline or order. Includes performance improvements, technical debt, and nice-to-have features.

### `completed/`
Archive of completed tasks. Move files here when done to maintain history of what's been accomplished.

## File Naming Conventions

**Active tasks:** `01-description.md`, `02-description.md`
**Backlog tasks:** `descriptive-name.md`
**Completed tasks:** Keep original name, optionally add completion date

## Task Format

Each task file should include the following, in this order:
- **Summary**: 2-3 sentences describing the issue/improvement
- **Action Items**: Specific steps to complete as md checkboxes, with short notes about the task (if it's stalled, if there are important details or caveats, etc.)
- **Technical Details**: Relevant code locations, dependencies, etc.

## Usage

1. Check `active/` for next priority task
2. Create new tasks in appropriate directory
3. Move completed tasks to `completed/`
4. Review `backlog/` during planning sessions