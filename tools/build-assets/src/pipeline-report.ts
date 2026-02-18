/**
 * Pipeline validation report — Emit final build report with
 * processed entities, unresolved refs, schema violations, and dedup ratio.
 *
 * Phase 3, Step 20.
 */

import type { BlobStoreStats } from "./blob-store.ts";
import type { IndexStats } from "./asset-index.ts";

// ─── Types ──────────────────────────────────────────────────────────

export type IssueSeverity = "error" | "warning" | "info";

export interface PipelineIssue {
  severity: IssueSeverity;
  category: string;
  message: string;
  path?: string;
}

export interface PipelineReport {
  /** ISO timestamp */
  generatedAt: string;
  /** Total processing time in milliseconds */
  durationMs: number;
  /** Entity counts by type */
  entityCounts: Record<string, number>;
  /** Total entities processed */
  totalEntities: number;
  /** Blob store statistics */
  blobStats: BlobStoreStats;
  /** Index statistics */
  indexStats: IndexStats;
  /** Issues classified by severity */
  issues: PipelineIssue[];
  /** Summary counts */
  issueSummary: Record<IssueSeverity, number>;
  /** Overall pass/fail based on configured threshold */
  passed: boolean;
}

// ─── Report Builder ─────────────────────────────────────────────────

export class PipelineReportBuilder {
  private startTime: number;
  private entityCounts: Record<string, number> = {};
  private issues: PipelineIssue[] = [];
  private failOnSeverity: IssueSeverity;

  constructor(options?: { failOnSeverity?: IssueSeverity }) {
    this.startTime = Date.now();
    this.failOnSeverity = options?.failOnSeverity ?? "error";
  }

  /**
   * Record processed entities.
   */
  addEntityCount(type: string, count: number): void {
    this.entityCounts[type] = (this.entityCounts[type] ?? 0) + count;
  }

  /**
   * Record an issue.
   */
  addIssue(severity: IssueSeverity, category: string, message: string, path?: string): void {
    this.issues.push({ severity, category, message, path });
  }

  /**
   * Generate the final report.
   */
  build(blobStats: BlobStoreStats, indexStats: IndexStats): PipelineReport {
    const durationMs = Date.now() - this.startTime;

    const totalEntities = Object.values(this.entityCounts).reduce((sum, c) => sum + c, 0);

    const issueSummary: Record<IssueSeverity, number> = {
      error: 0,
      warning: 0,
      info: 0,
    };
    for (const issue of this.issues) {
      issueSummary[issue.severity]++;
    }

    // Determine pass/fail
    const severityOrder: IssueSeverity[] = ["info", "warning", "error"];
    const failIdx = severityOrder.indexOf(this.failOnSeverity);
    let passed = true;
    for (let i = failIdx; i < severityOrder.length; i++) {
      if (issueSummary[severityOrder[i]] > 0) {
        passed = false;
        break;
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      durationMs,
      entityCounts: { ...this.entityCounts },
      totalEntities,
      blobStats,
      indexStats,
      issues: [...this.issues],
      issueSummary,
      passed,
    };
  }
}

/**
 * Format a pipeline report as a human-readable string.
 */
export function formatPipelineReport(report: PipelineReport): string {
  const lines: string[] = [];

  lines.push(`Build Pipeline Report`);
  lines.push(`═════════════════════`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Duration: ${(report.durationMs / 1000).toFixed(1)}s`);
  lines.push(`Status: ${report.passed ? "✅ PASSED" : "❌ FAILED"}`);
  lines.push(``);

  lines.push(`Entities Processed: ${report.totalEntities}`);
  for (const [type, count] of Object.entries(report.entityCounts).sort()) {
    lines.push(`  ${type.padEnd(15)} ${count}`);
  }
  lines.push(``);

  lines.push(`Blob Store`);
  lines.push(`  Total inserts: ${report.blobStats.totalBlobs}`);
  lines.push(`  Unique blobs: ${report.blobStats.uniqueBlobs}`);
  lines.push(`  Dedup ratio: ${(report.blobStats.deduplicationRatio * 100).toFixed(1)}%`);
  lines.push(``);

  lines.push(`Index`);
  lines.push(`  Total entries: ${report.indexStats.totalEntries}`);
  lines.push(`  Unique types: ${report.indexStats.uniqueTypes}`);
  lines.push(`  Unique IDs: ${report.indexStats.uniqueIds}`);
  lines.push(``);

  lines.push(`Issues`);
  lines.push(`  Errors: ${report.issueSummary.error}`);
  lines.push(`  Warnings: ${report.issueSummary.warning}`);
  lines.push(`  Info: ${report.issueSummary.info}`);

  if (report.issues.length > 0) {
    lines.push(``);
    const maxShow = 20;
    const shown = report.issues.slice(0, maxShow);
    for (const issue of shown) {
      const prefix = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️";
      lines.push(`  ${prefix} [${issue.category}] ${issue.message}${issue.path ? ` (${issue.path})` : ""}`);
    }
    if (report.issues.length > maxShow) {
      lines.push(`  ... and ${report.issues.length - maxShow} more`);
    }
  }

  return lines.join("\n");
}
