/**
 * Asset source scanner — Scans the raw decomposed WZ JSON resource tree
 * and produces a deterministic inventory report.
 *
 * Phase 3, Step 11.
 */

import { readdir, stat } from "node:fs/promises";
import { join, basename, extname, relative } from "node:path";

// ─── Types ──────────────────────────────────────────────────────────

export interface NamespaceReport {
  /** WZ namespace name (e.g., "Map.wz", "Character.wz") */
  namespace: string;
  /** Total JSON files in this namespace */
  fileCount: number;
  /** Total byte size of all JSON files */
  totalBytes: number;
  /** Largest file path (relative to resources root) */
  largestFile: string;
  /** Largest file byte size */
  largestFileBytes: number;
  /** Sub-directory distribution (top-level dirs under namespace) */
  subdirectories: SubdirReport[];
}

export interface SubdirReport {
  name: string;
  fileCount: number;
  totalBytes: number;
}

export interface ScanReport {
  /** ISO timestamp of scan */
  scannedAt: string;
  /** Resources root directory */
  resourcesRoot: string;
  /** Total namespaces found */
  namespaceCount: number;
  /** Total JSON files across all namespaces */
  totalFileCount: number;
  /** Total bytes across all namespaces */
  totalBytes: number;
  /** Largest 10 files by size */
  largestFiles: Array<{ path: string; bytes: number }>;
  /** Per-namespace breakdown */
  namespaces: NamespaceReport[];
}

// ─── Scanner Implementation ─────────────────────────────────────────

/**
 * Recursively collect all JSON files under a directory.
 */
async function collectJsonFiles(
  dir: string,
  rootDir: string
): Promise<Array<{ path: string; relativePath: string; bytes: number }>> {
  const results: Array<{ path: string; relativePath: string; bytes: number }> = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await collectJsonFiles(fullPath, rootDir);
      results.push(...sub);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
      try {
        const s = await stat(fullPath);
        results.push({
          path: fullPath,
          relativePath: relative(rootDir, fullPath),
          bytes: s.size,
        });
      } catch {
        // Skip inaccessible files
      }
    }
  }

  return results;
}

/**
 * Get immediate subdirectories of a directory.
 */
async function getSubdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

/**
 * Scan a single WZ namespace directory.
 */
async function scanNamespace(
  nsDir: string,
  nsName: string,
  resourcesRoot: string
): Promise<{ report: NamespaceReport; files: Array<{ relativePath: string; bytes: number }> }> {
  const files = await collectJsonFiles(nsDir, resourcesRoot);

  // Sort deterministically by relative path
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);

  let largestFile = "";
  let largestFileBytes = 0;
  for (const f of files) {
    if (f.bytes > largestFileBytes) {
      largestFileBytes = f.bytes;
      largestFile = f.relativePath;
    }
  }

  // Sub-directory distribution
  const subdirs = await getSubdirectories(nsDir);
  const subdirReports: SubdirReport[] = [];

  for (const subName of subdirs) {
    const subPath = join(nsDir, subName);
    const subFiles = await collectJsonFiles(subPath, resourcesRoot);
    subdirReports.push({
      name: subName,
      fileCount: subFiles.length,
      totalBytes: subFiles.reduce((sum, f) => sum + f.bytes, 0),
    });
  }

  // Also count files directly in the namespace root (not in subdirs)
  // Count files directly in the namespace root (not in subdirs)
  let rootFileCount = 0;
  let rootBytes = 0;
  try {
    const rootDirEntries = await readdir(nsDir, { withFileTypes: true });
    for (const entry of rootDirEntries) {
      if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
        const s = await stat(join(nsDir, entry.name));
        rootFileCount++;
        rootBytes += s.size;
      }
    }
  } catch {
    // Ignore read errors
  }
  if (rootFileCount > 0) {
    subdirReports.unshift({
      name: "(root)",
      fileCount: rootFileCount,
      totalBytes: rootBytes,
    });
  }

  return {
    report: {
      namespace: nsName,
      fileCount: files.length,
      totalBytes,
      largestFile,
      largestFileBytes,
      subdirectories: subdirReports,
    },
    files: files.map((f) => ({ relativePath: f.relativePath, bytes: f.bytes })),
  };
}

/**
 * Scan the entire resources directory and produce a deterministic inventory report.
 */
export async function scanResources(resourcesRoot: string): Promise<ScanReport> {
  const entries = await readdir(resourcesRoot, { withFileTypes: true });

  // Find WZ namespace directories (*.wz)
  const wzNamespaces = entries
    .filter((e) => e.isDirectory() && e.name.endsWith(".wz"))
    .map((e) => e.name)
    .sort();

  const namespaceReports: NamespaceReport[] = [];
  const allFiles: Array<{ relativePath: string; bytes: number }> = [];

  for (const nsName of wzNamespaces) {
    const nsDir = join(resourcesRoot, nsName);
    const { report, files } = await scanNamespace(nsDir, nsName, resourcesRoot);
    namespaceReports.push(report);
    allFiles.push(...files);
  }

  // Overall stats
  const totalFileCount = allFiles.length;
  const totalBytes = allFiles.reduce((sum, f) => sum + f.bytes, 0);

  // Top 10 largest files
  const sortedBySize = [...allFiles].sort((a, b) => b.bytes - a.bytes);
  const largestFiles = sortedBySize.slice(0, 10).map((f) => ({
    path: f.relativePath,
    bytes: f.bytes,
  }));

  return {
    scannedAt: new Date().toISOString(),
    resourcesRoot,
    namespaceCount: wzNamespaces.length,
    totalFileCount,
    totalBytes,
    largestFiles,
    namespaces: namespaceReports,
  };
}

/**
 * Format a scan report as a human-readable summary string.
 */
export function formatScanReport(report: ScanReport): string {
  const lines: string[] = [];

  lines.push(`Asset Source Scan Report`);
  lines.push(`═══════════════════════`);
  lines.push(`Scanned: ${report.scannedAt}`);
  lines.push(`Root: ${report.resourcesRoot}`);
  lines.push(`Namespaces: ${report.namespaceCount}`);
  lines.push(`Total files: ${report.totalFileCount.toLocaleString()}`);
  lines.push(`Total size: ${formatBytes(report.totalBytes)}`);
  lines.push(``);

  lines.push(`Namespace Breakdown`);
  lines.push(`───────────────────`);

  for (const ns of report.namespaces) {
    lines.push(
      `  ${ns.namespace.padEnd(20)} ${String(ns.fileCount).padStart(6)} files  ${formatBytes(ns.totalBytes).padStart(10)}`
    );
  }

  lines.push(``);
  lines.push(`Top 10 Largest Files`);
  lines.push(`────────────────────`);

  for (const f of report.largestFiles) {
    lines.push(`  ${formatBytes(f.bytes).padStart(10)}  ${f.path}`);
  }

  return lines.join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
