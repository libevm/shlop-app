export type AssetEntityType = "map" | "mob" | "npc" | "character" | "effect" | "audio" | "ui";

export interface AssetLookup {
  type: AssetEntityType;
  id: string;
  section?: string;
}

export function normalizeAssetId(id: string): string {
  return id.trim();
}
