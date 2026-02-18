/**
 * Blob hashing and deduplication store.
 *
 * Phase 3, Step 17.
 *
 * Hashes large payloads (images, audio, large frame arrays) by content.
 * Stores blobs by content hash for deduplication.
 * Replaces inline payloads with blob references.
 */

import { createHash } from "node:crypto";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ─── Types ──────────────────────────────────────────────────────────

export interface BlobRef {
  hash: string;
  size: number;
  contentType: string;
}

export interface BlobStoreStats {
  totalBlobs: number;
  totalBytes: number;
  uniqueBlobs: number;
  uniqueBytes: number;
  deduplicatedBytes: number;
  deduplicationRatio: number;
}

// ─── Blob Store ─────────────────────────────────────────────────────

export class BlobStore {
  private blobs = new Map<string, { data: Buffer; contentType: string }>();
  private totalInserts = 0;
  private totalInsertBytes = 0;

  /**
   * Compute content hash for a buffer.
   */
  static hash(data: Buffer): string {
    return createHash("sha256").update(data).digest("hex").slice(0, 32);
  }

  /**
   * Store a blob. Returns a BlobRef. If the blob already exists
   * (same content hash), it is deduplicated.
   */
  store(data: Buffer, contentType: string = "application/octet-stream"): BlobRef {
    const hash = BlobStore.hash(data);
    this.totalInserts++;
    this.totalInsertBytes += data.length;

    if (!this.blobs.has(hash)) {
      this.blobs.set(hash, { data, contentType });
    }

    return { hash, size: data.length, contentType };
  }

  /**
   * Store a JSON payload as a blob.
   */
  storeJson(payload: unknown): BlobRef {
    const json = JSON.stringify(payload);
    return this.store(Buffer.from(json, "utf-8"), "application/json");
  }

  /**
   * Retrieve a blob by hash. Returns null if not found.
   */
  get(hash: string): { data: Buffer; contentType: string } | null {
    return this.blobs.get(hash) ?? null;
  }

  /**
   * Check if a blob exists.
   */
  has(hash: string): boolean {
    return this.blobs.has(hash);
  }

  /**
   * Get deduplication statistics.
   */
  stats(): BlobStoreStats {
    let uniqueBytes = 0;
    for (const [, { data }] of this.blobs) {
      uniqueBytes += data.length;
    }

    return {
      totalBlobs: this.totalInserts,
      totalBytes: this.totalInsertBytes,
      uniqueBlobs: this.blobs.size,
      uniqueBytes,
      deduplicatedBytes: this.totalInsertBytes - uniqueBytes,
      deduplicationRatio: this.totalInsertBytes > 0
        ? (this.totalInsertBytes - uniqueBytes) / this.totalInsertBytes
        : 0,
    };
  }

  /**
   * Write all blobs to a directory on disk.
   */
  async writeToDisk(outputDir: string): Promise<number> {
    await mkdir(outputDir, { recursive: true });
    let count = 0;

    for (const [hash, { data }] of this.blobs) {
      const path = join(outputDir, hash);
      await writeFile(path, data);
      count++;
    }

    return count;
  }

  /**
   * Load a blob from disk by hash.
   */
  static async readFromDisk(outputDir: string, hash: string): Promise<Buffer | null> {
    try {
      return await readFile(join(outputDir, hash));
    } catch {
      return null;
    }
  }
}
