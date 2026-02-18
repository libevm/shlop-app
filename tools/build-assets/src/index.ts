export const BUILD_ASSETS_PACKAGE_NAME = "@maple/build-assets";

export function getBuildAssetsStatus() {
  return "build-assets-workspace-ready";
}

export { scanResources, formatScanReport } from "./scanner.ts";
export type { ScanReport, NamespaceReport, SubdirReport } from "./scanner.ts";

export { readJsonFile, readJsonFiles } from "./json-reader.ts";
export type { JsonReadResult, JsonReadError, JsonReadOutcome } from "./json-reader.ts";

export {
  resolveUol,
  resolveInlink,
  findAllReferences,
  resolveAllReferences,
} from "./uol-resolver.ts";
export type { WzNode, ResolveResult, UnresolvedRef } from "./uol-resolver.ts";

export { extractMap } from "./map-extractor.ts";
export type { ExtractedMap, MapDependencies } from "./map-extractor.ts";
