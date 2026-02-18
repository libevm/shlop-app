/**
 * Asset index database — Maps type/id/section to storage location/hash.
 *
 * Phase 3, Step 18.
 *
 * In-memory index with serialization support.
 * Includes reverse lookup and integrity checking.
 */

import type { BlobRef } from "./blob-store.ts";

// ─── Types ──────────────────────────────────────────────────────────

export interface IndexEntry {
  type: string;
  id: string;
  section: string;
  blobHash: string;
  blobSize: number;
  contentType: string;
  /** ISO timestamp when this entry was last updated */
  updatedAt: string;
}

export interface IndexStats {
  totalEntries: number;
  uniqueTypes: number;
  uniqueIds: number;
  entriesByType: Record<string, number>;
}

export interface IndexIntegrityResult {
  totalEntries: number;
  validEntries: number;
  missingBlobs: Array<{ key: string; hash: string }>;
  ok: boolean;
}

// ─── Index ──────────────────────────────────────────────────────────

export class AssetIndex {
  private entries = new Map<string, IndexEntry>();

  /**
   * Create a canonical key for an index entry.
   */
  static key(type: string, id: string, section: string): string {
    return `${type}:${id}:${section}`;
  }

  /**
   * Add or update an index entry.
   */
  set(type: string, id: string, section: string, blobRef: BlobRef): void {
    const key = AssetIndex.key(type, id, section);
    this.entries.set(key, {
      type,
      id,
      section,
      blobHash: blobRef.hash,
      blobSize: blobRef.size,
      contentType: blobRef.contentType,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Look up an entry by type/id/section.
   */
  get(type: string, id: string, section: string): IndexEntry | null {
    return this.entries.get(AssetIndex.key(type, id, section)) ?? null;
  }

  /**
   * Check if an entry exists.
   */
  has(type: string, id: string, section: string): boolean {
    return this.entries.has(AssetIndex.key(type, id, section));
  }

  /**
   * Remove an entry.
   */
  delete(type: string, id: string, section: string): boolean {
    return this.entries.delete(AssetIndex.key(type, id, section));
  }

  /**
   * Get all entries for a given type and id.
   */
  getSections(type: string, id: string): IndexEntry[] {
    const prefix = `${type}:${id}:`;
    const results: IndexEntry[] = [];
    for (const [key, entry] of this.entries) {
      if (key.startsWith(prefix)) {
        results.push(entry);
      }
    }
    return results;
  }

  /**
   * Reverse lookup: find all entries referencing a given blob hash.
   */
  findByBlobHash(hash: string): IndexEntry[] {
    const results: IndexEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.blobHash === hash) {
        results.push(entry);
      }
    }
    return results;
  }

  /**
   * Get index statistics.
   */
  stats(): IndexStats {
    const types = new Set<string>();
    const ids = new Set<string>();
    const entriesByType: Record<string, number> = {};

    for (const entry of this.entries.values()) {
      types.add(entry.type);
      ids.add(`${entry.type}:${entry.id}`);
      entriesByType[entry.type] = (entriesByType[entry.type] ?? 0) + 1;
    }

    return {
      totalEntries: this.entries.size,
      uniqueTypes: types.size,
      uniqueIds: ids.size,
      entriesByType,
    };
  }

  /**
   * Check integrity: verify all blob hashes exist in a provided set.
   */
  checkIntegrity(existingBlobHashes: Set<string>): IndexIntegrityResult {
    const missingBlobs: Array<{ key: string; hash: string }> = [];
    let validEntries = 0;

    for (const [key, entry] of this.entries) {
      if (existingBlobHashes.has(entry.blobHash)) {
        validEntries++;
      } else {
        missingBlobs.push({ key, hash: entry.blobHash });
      }
    }

    return {
      totalEntries: this.entries.size,
      validEntries,
      missingBlobs,
      ok: missingBlobs.length === 0,
    };
  }

  /**
   * Serialize the index to JSON.
   */
  serialize(): string {
    const entries: IndexEntry[] = [];
    for (const entry of this.entries.values()) {
      entries.push(entry);
    }
    // Sort for deterministic output
    entries.sort((a, b) => {
      const ka = AssetIndex.key(a.type, a.id, a.section);
      const kb = AssetIndex.key(b.type, b.id, b.section);
      return ka.localeCompare(kb);
    });
    return JSON.stringify({ version: 1, entries }, null, 2);
  }

  /**
   * Deserialize from JSON string.
   */
  static deserialize(json: string): AssetIndex {
    const data = JSON.parse(json);
    const index = new AssetIndex();
    for (const entry of data.entries ?? []) {
      const key = AssetIndex.key(entry.type, entry.id, entry.section);
      index.entries.set(key, entry);
    }
    return index;
  }

  /**
   * Get total number of entries.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Iterate all entries.
   */
  *[Symbol.iterator](): Iterator<[string, IndexEntry]> {
    yield* this.entries;
  }
}
