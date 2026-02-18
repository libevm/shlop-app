export const BUILD_ASSETS_PACKAGE_NAME = "@maple/build-assets";

export function getBuildAssetsStatus() {
  return "build-assets-workspace-ready";
}

// Step 11: Scanner
export { scanResources, formatScanReport } from "./scanner.ts";
export type { ScanReport, NamespaceReport, SubdirReport } from "./scanner.ts";

// Step 12: JSON Reader
export { readJsonFile, readJsonFiles } from "./json-reader.ts";
export type { JsonReadResult, JsonReadError, JsonReadOutcome } from "./json-reader.ts";

// Step 13: UOL Resolver
export {
  resolveUol,
  resolveInlink,
  findAllReferences,
  resolveAllReferences,
} from "./uol-resolver.ts";
export type { WzNode, ResolveResult, UnresolvedRef } from "./uol-resolver.ts";

// Step 14: Map Extractor
export { extractMap } from "./map-extractor.ts";
export type { ExtractedMap, MapDependencies } from "./map-extractor.ts";

// Step 15: Mob/NPC Extractor
export { extractMob, extractNpc } from "./mob-extractor.ts";
export type { ExtractedMob, MobInfo, ExtractedNpc, NpcInfo, StanceData, FrameData } from "./mob-extractor.ts";

// Step 16: Character Extractor
export { extractCharacter } from "./character-extractor.ts";
export type { ExtractedCharacter, ActionData, CharacterFrame, PartData } from "./character-extractor.ts";

// Step 17: Blob Store
export { BlobStore } from "./blob-store.ts";
export type { BlobRef, BlobStoreStats } from "./blob-store.ts";

// Step 18: Asset Index
export { AssetIndex } from "./asset-index.ts";
export type { IndexEntry, IndexStats, IndexIntegrityResult } from "./asset-index.ts";

// Step 20: Pipeline Report
export { PipelineReportBuilder, formatPipelineReport } from "./pipeline-report.ts";
export type { PipelineReport, PipelineIssue, IssueSeverity } from "./pipeline-report.ts";
