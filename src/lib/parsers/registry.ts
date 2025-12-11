/**
 * Parser registry for managing multiple source parsers
 */

import { ISourceParser, SourceType } from './types';

export class ParserRegistry {
  private parsers = new Map<SourceType, ISourceParser>();

  /** Register a parser for a source type */
  register(parser: ISourceParser): void {
    this.parsers.set(parser.sourceType, parser);
  }

  /** Get parser by source type */
  get(type: SourceType): ISourceParser | undefined {
    return this.parsers.get(type);
  }

  /** Get all registered parsers */
  getAll(): ISourceParser[] {
    return Array.from(this.parsers.values());
  }

  /** Get parsers for specified types (or all if 'all' specified) */
  getByTypes(types: (SourceType | 'all')[]): ISourceParser[] {
    if (types.includes('all')) {
      return this.getAll();
    }
    return types
      .filter((t): t is SourceType => t !== 'all')
      .map(t => this.parsers.get(t))
      .filter((p): p is ISourceParser => p !== undefined);
  }

  /** Check if a source type is registered */
  has(type: SourceType): boolean {
    return this.parsers.has(type);
  }

  /** Get all registered source types */
  getTypes(): SourceType[] {
    return Array.from(this.parsers.keys());
  }
}
