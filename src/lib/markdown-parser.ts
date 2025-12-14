/**
 * Backward-compatible re-export of TasksParser as MarkdownParser
 */

import { TasksParser } from './parsers/tasks-parser';

// Re-export TasksParser as MarkdownParser for backward compatibility
export { TasksParser as MarkdownParser } from './parsers/tasks-parser';

// Also export as default for existing imports
export default TasksParser;
