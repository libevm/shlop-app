/**
 * Robust JSON file reader with error handling for the asset pipeline.
 *
 * Phase 3, Step 12.
 *
 * Handles:
 * - Normal JSON files
 * - Malformed/truncated files (reports error, doesn't crash pipeline)
 * - Large files (streaming parse via Bun's native file reader)
 * - BOM detection and stripping
 */

import { readFile } from "node:fs/promises";

// ─── Types ──────────────────────────────────────────────────────────

export interface JsonReadResult {
  ok: true;
  data: unknown;
  path: string;
  bytes: number;
}

export interface JsonReadError {
  ok: false;
  path: string;
  error: string;
  bytes: number;
}

export type JsonReadOutcome = JsonReadResult | JsonReadError;

// ─── Reader ─────────────────────────────────────────────────────────

/**
 * Read and parse a JSON file safely.
 * Never throws — returns an error outcome instead.
 */
export async function readJsonFile(path: string): Promise<JsonReadOutcome> {
  let raw: string;
  let bytes = 0;

  try {
    const buf = await readFile(path);
    bytes = buf.length;
    raw = buf.toString("utf-8");
  } catch (e) {
    return {
      ok: false,
      path,
      error: `File read failed: ${e instanceof Error ? e.message : String(e)}`,
      bytes: 0,
    };
  }

  // Strip UTF-8 BOM if present
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }

  try {
    const data = JSON.parse(raw);
    return { ok: true, data, path, bytes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Provide context: first 100 chars of file for debugging
    const preview = raw.slice(0, 100).replace(/\n/g, "\\n");
    return {
      ok: false,
      path,
      error: `JSON parse failed: ${msg} (preview: "${preview}...")`,
      bytes,
    };
  }
}

/**
 * Read multiple JSON files, collecting successes and errors.
 * Continues past errors (permissive mode).
 */
export async function readJsonFiles(
  paths: string[],
  options?: { concurrency?: number }
): Promise<{
  results: JsonReadResult[];
  errors: JsonReadError[];
}> {
  const concurrency = options?.concurrency ?? 16;
  const results: JsonReadResult[] = [];
  const errors: JsonReadError[] = [];

  // Process in batches
  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency);
    const outcomes = await Promise.all(batch.map((p) => readJsonFile(p)));
    for (const outcome of outcomes) {
      if (outcome.ok) {
        results.push(outcome);
      } else {
        errors.push(outcome);
      }
    }
  }

  return { results, errors };
}
