/**
 * Sidecar metadata handler for OpenSpec tasks
 * Stores GitHub issue number and sync state per change folder
 */

import fs from 'fs';
import path from 'path';

export interface OpenSpecMeta {
  github_issue?: number;
  last_synced?: string;
  local_hash?: string;
  created?: string;
}

const META_FILENAME = '.tasks-sync.json';

export class OpenSpecMetaHandler {
  /**
   * Load metadata from change folder
   */
  static load(changePath: string): OpenSpecMeta | null {
    const metaPath = this.getMetaPath(changePath);
    if (!fs.existsSync(metaPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(metaPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Save metadata to change folder
   */
  static save(changePath: string, meta: OpenSpecMeta): void {
    const metaPath = this.getMetaPath(changePath);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }

  /**
   * Get metadata file path for change folder
   */
  static getMetaPath(changePath: string): string {
    return path.join(changePath, META_FILENAME);
  }

  /**
   * Update specific field in metadata
   */
  static update(changePath: string, updates: Partial<OpenSpecMeta>): void {
    const existing = this.load(changePath) || {};
    this.save(changePath, { ...existing, ...updates });
  }
}
