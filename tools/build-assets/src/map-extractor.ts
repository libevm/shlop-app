/**
 * Map document extractor — Extracts and splits map data into sections.
 *
 * Phase 3, Step 14.
 *
 * Extracts from raw WZ JSON map files:
 * - info: map metadata
 * - footholds: foothold geometry
 * - portals: portal definitions
 * - backgrounds: background layer definitions
 * - tiles/objects: per-layer placements
 * - life: mob/npc spawns
 * - ladderRopes: climb zones
 * - audio: BGM reference
 * - dependencies: referenced mob/npc/back/tile/obj asset IDs
 */

import type {
  MapInfo,
  Foothold,
  Portal,
  LadderRope,
  LifeEntry,
  BackgroundLayer,
  TilePlacement,
  ObjectPlacement,
  Bounds,
  WallLine,
} from "@maple/shared-schemas";

// Re-export the WzNode type locally for clarity
interface WzNode {
  $imgdir?: string;
  $canvas?: string | number;
  $int?: string;
  $float?: string;
  $string?: string;
  $vector?: string;
  value?: unknown;
  x?: number;
  y?: number;
  $$?: WzNode[];
  [key: string]: unknown;
}

// ─── Extraction Types ───────────────────────────────────────────────

export interface ExtractedMap {
  /** Map ID */
  mapId: string;
  /** Core metadata */
  info: MapInfo;
  /** Whether this is a swimming map */
  swim: boolean;
  /** Foothold geometry */
  footholds: Foothold[];
  /** Portal definitions */
  portals: Portal[];
  /** Ladder/rope definitions */
  ladderRopes: LadderRope[];
  /** Background layer definitions */
  backgrounds: BackgroundLayer[];
  /** Whether to fill black background */
  blackBackground: boolean;
  /** Per-layer tile placements */
  layers: Array<{ layerIndex: number; tiles: TilePlacement[]; objects: ObjectPlacement[] }>;
  /** Life spawn entries */
  life: LifeEntry[];
  /** BGM path (from info) */
  bgmPath: string;
  /** Wall segments derived from vertical footholds */
  wallLines: WallLine[];
  /** Foothold-derived walls (left+25, right-25) */
  walls: { left: number; right: number };
  /** Foothold-derived borders (top-300, bottom+100) */
  borders: { top: number; bottom: number };
  /** Foothold horizontal extent */
  footholdBounds: { minX: number; maxX: number };
  /** Overall content bounds */
  bounds: Bounds;
  /** Reverse dependencies: IDs of referenced assets */
  dependencies: MapDependencies;
}

export interface MapDependencies {
  /** Mob IDs referenced in life spawns */
  mobIds: string[];
  /** NPC IDs referenced in life spawns */
  npcIds: string[];
  /** Background set names (bS) */
  backgroundSets: string[];
  /** Tile set names (tS) */
  tileSets: string[];
  /** Object set names (oS) */
  objectSets: string[];
  /** Target map IDs from portals */
  targetMapIds: string[];
}

// ─── WZ Node Helpers ────────────────────────────────────────────────

function childByName(node: WzNode | null | undefined, name: string): WzNode | undefined {
  return node?.$$?.find((c) => c.$imgdir === name || String(c.$canvas) === name);
}

function imgdirChildren(node: WzNode | null | undefined): WzNode[] {
  return node?.$$?.filter((c) => c.$imgdir !== undefined) ?? [];
}

function leafRecord(node: WzNode): Record<string, unknown> {
  const rec: Record<string, unknown> = {};
  for (const child of node.$$ ?? []) {
    const key = child.$int ?? child.$float ?? child.$string ?? child.$vector;
    if (key) {
      if (child.$vector) {
        rec[key] = { x: child.x ?? 0, y: child.y ?? 0 };
      } else {
        rec[key] = child.value;
      }
    }
  }
  return rec;
}

function safeNumber(val: unknown, fallback: number): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = Number(val);
    return isNaN(n) ? fallback : n;
  }
  return fallback;
}

function safeString(val: unknown, fallback: string): string {
  if (typeof val === "string") return val;
  if (val !== undefined && val !== null) return String(val);
  return fallback;
}

// ─── Extraction Functions ───────────────────────────────────────────

function extractInfo(raw: WzNode): MapInfo {
  const infoNode = childByName(raw, "info");
  if (!infoNode) return {};
  return leafRecord(infoNode) as MapInfo;
}

function extractFootholds(raw: WzNode): Foothold[] {
  const footholds: Foothold[] = [];
  const root = childByName(raw, "foothold");
  if (!root) return footholds;

  for (const layer of imgdirChildren(root)) {
    for (const group of imgdirChildren(layer)) {
      for (const fh of imgdirChildren(group)) {
        const rec = leafRecord(fh);
        const prevVal = safeNumber(rec.prev, 0);
        const nextVal = safeNumber(rec.next, 0);

        footholds.push({
          id: String(fh.$imgdir),
          layer: safeNumber(layer.$imgdir, 0),
          group: safeNumber(group.$imgdir, 0),
          x1: safeNumber(rec.x1, 0),
          y1: safeNumber(rec.y1, 0),
          x2: safeNumber(rec.x2, 0),
          y2: safeNumber(rec.y2, 0),
          prevId: prevVal > 0 ? String(prevVal) : null,
          nextId: nextVal > 0 ? String(nextVal) : null,
        });
      }
    }
  }

  return footholds;
}

function extractPortals(raw: WzNode): Portal[] {
  const portals: Portal[] = [];
  const root = childByName(raw, "portal");
  if (!root) return portals;

  for (const p of imgdirChildren(root)) {
    const rec = leafRecord(p);
    portals.push({
      name: safeString(rec.pn, ""),
      type: safeNumber(rec.pt, 0),
      x: safeNumber(rec.x, 0),
      y: safeNumber(rec.y, 0),
      targetMapId: safeNumber(rec.tm, 999999999),
      targetPortalName: safeString(rec.tn, ""),
      id: safeNumber(p.$imgdir, 0),
      image: safeString(rec.image, "default"),
    });
  }

  return portals;
}

function extractLadderRopes(raw: WzNode): LadderRope[] {
  const ladders: LadderRope[] = [];
  const root = childByName(raw, "ladderRope");
  if (!root) return ladders;

  for (const lr of imgdirChildren(root)) {
    const rec = leafRecord(lr);
    ladders.push({
      id: String(lr.$imgdir),
      l: safeNumber(rec.l, 0),
      uf: safeNumber(rec.uf, 1),
      x: safeNumber(rec.x, 0),
      y1: safeNumber(rec.y1, 0),
      y2: safeNumber(rec.y2, 0),
      page: safeNumber(rec.page, 0),
    });
  }

  return ladders;
}

function extractBackgrounds(raw: WzNode): { backgrounds: BackgroundLayer[]; blackBackground: boolean } {
  const backgrounds: BackgroundLayer[] = [];
  const root = childByName(raw, "back");
  if (!root) return { backgrounds, blackBackground: false };

  let blackBackground = false;

  for (const bg of imgdirChildren(root)) {
    const rec = leafRecord(bg);
    const bS = safeString(rec.bS, "");
    const no = safeString(rec.no, "0");
    const ani = safeNumber(rec.ani, 0);
    const front = safeNumber(rec.front, 0) === 1;
    const idx = safeNumber(bg.$imgdir, 0);

    if (idx === 0 && bS === "") {
      blackBackground = true;
    }

    backgrounds.push({
      key: `back/${bS}/${ani ? "ani" : "back"}/${no}`,
      bS,
      no,
      ani,
      type: safeNumber(rec.type, 0),
      x: safeNumber(rec.x, 0),
      y: safeNumber(rec.y, 0),
      rx: safeNumber(rec.rx, 0),
      ry: safeNumber(rec.ry, 0),
      cx: safeNumber(rec.cx, 0),
      cy: safeNumber(rec.cy, 0),
      alpha: safeNumber(rec.a, 255) / 255,
      front,
      flipped: safeNumber(rec.f, 0) === 1,
    });
  }

  return { backgrounds, blackBackground };
}

function extractLayers(raw: WzNode): Array<{ layerIndex: number; tiles: TilePlacement[]; objects: ObjectPlacement[] }> {
  const layers: Array<{ layerIndex: number; tiles: TilePlacement[]; objects: ObjectPlacement[] }> = [];

  for (let i = 0; i <= 7; i++) {
    const layerNode = childByName(raw, String(i));
    if (!layerNode) {
      layers.push({ layerIndex: i, tiles: [], objects: [] });
      continue;
    }

    // Tile set from layer info
    const layerInfo = childByName(layerNode, "info");
    const layerRec = layerInfo ? leafRecord(layerInfo) : {};
    const tS = safeString(layerRec.tS, "");

    // Tiles
    const tiles: TilePlacement[] = [];
    const tileRoot = childByName(layerNode, "tile");
    for (const t of imgdirChildren(tileRoot)) {
      const rec = leafRecord(t);
      const no = safeString(rec.no, "0");
      const u = safeString(rec.u, "");
      tiles.push({
        x: safeNumber(rec.x, 0),
        y: safeNumber(rec.y, 0),
        u,
        no,
        zM: safeNumber(rec.zM, 0),
        key: `tile/${tS}/${u}/${no}`,
        tS,
        nodeId: String(t.$imgdir),
      });
    }

    // Objects
    const objects: ObjectPlacement[] = [];
    const objRoot = childByName(layerNode, "obj");
    for (const o of imgdirChildren(objRoot)) {
      const rec = leafRecord(o);
      const oS = safeString(rec.oS, "");
      const l0 = safeString(rec.l0, "");
      const l1 = safeString(rec.l1, "");
      const l2 = safeString(rec.l2, "");
      objects.push({
        x: safeNumber(rec.x, 0),
        y: safeNumber(rec.y, 0),
        z: safeNumber(rec.z, 0),
        oS,
        l0,
        l1,
        l2,
        f: safeNumber(rec.f, 0),
        key: `obj/${oS}/${l0}/${l1}/${l2}`,
        nodeId: String(o.$imgdir),
      });
    }

    // Sort for determinism
    tiles.sort((a, b) => a.zM - b.zM || a.nodeId.localeCompare(b.nodeId));
    objects.sort((a, b) => a.z - b.z || a.nodeId.localeCompare(b.nodeId));

    layers.push({ layerIndex: i, tiles, objects });
  }

  return layers;
}

function extractLife(raw: WzNode): LifeEntry[] {
  const life: LifeEntry[] = [];
  const root = childByName(raw, "life");
  if (!root) return life;

  for (const entry of imgdirChildren(root)) {
    const rec = leafRecord(entry);
    life.push({
      id: safeString(rec.id, ""),
      type: safeString(rec.type, ""),
      x: safeNumber(rec.x, 0),
      y: safeNumber(rec.y, 0),
      cy: safeNumber(rec.cy, 0),
      rx0: safeNumber(rec.rx0, 0),
      rx1: safeNumber(rec.rx1, 0),
      f: safeNumber(rec.f, 0),
      fh: safeNumber(rec.fh, 0),
      mobTime: safeNumber(rec.mobTime, 0),
    });
  }

  return life;
}

// ─── Main Extractor ─────────────────────────────────────────────────

/**
 * Extract a fully parsed map document from raw WZ JSON.
 */
export function extractMap(rawJson: WzNode, mapId: string): ExtractedMap {
  const info = extractInfo(rawJson);
  const footholds = extractFootholds(rawJson);
  const portals = extractPortals(rawJson);
  const ladderRopes = extractLadderRopes(rawJson);
  const { backgrounds, blackBackground } = extractBackgrounds(rawJson);
  const layers = extractLayers(rawJson);
  const life = extractLife(rawJson);

  // Derive walls/borders from footholds (matching C++ behavior)
  let leftWall = 30000, rightWall = -30000;
  let topBorder = 30000, bottomBorder = -30000;

  for (const fh of footholds) {
    const l = Math.min(fh.x1, fh.x2);
    const r = Math.max(fh.x1, fh.x2);
    const t = Math.min(fh.y1, fh.y2);
    const b = Math.max(fh.y1, fh.y2);
    if (l < leftWall) leftWall = l;
    if (r > rightWall) rightWall = r;
    if (t < topBorder) topBorder = t;
    if (b > bottomBorder) bottomBorder = b;
  }

  const walls = { left: leftWall + 25, right: rightWall - 25 };
  const borders = { top: topBorder - 300, bottom: bottomBorder + 100 };

  const wallLines: WallLine[] = footholds
    .filter((fh) => Math.abs(fh.x2 - fh.x1) < 0.01)
    .map((fh) => ({
      x: fh.x1,
      y1: Math.min(fh.y1, fh.y2),
      y2: Math.max(fh.y1, fh.y2),
    }));

  // Bounds from all points
  const points: Array<{ x: number; y: number }> = [];
  for (const fh of footholds) {
    points.push({ x: fh.x1, y: fh.y1 }, { x: fh.x2, y: fh.y2 });
  }
  for (const p of portals) points.push({ x: p.x, y: p.y });
  for (const l of life) points.push({ x: l.x, y: l.y });

  const minX = points.length > 0 ? Math.min(...points.map((p) => p.x), -700) : -700;
  const maxX = points.length > 0 ? Math.max(...points.map((p) => p.x), 700) : 700;
  const minY = points.length > 0 ? Math.min(...points.map((p) => p.y), -220) : -220;
  const maxY = points.length > 0 ? Math.max(...points.map((p) => p.y), 380) : 380;

  const footholdMinX = footholds.length > 0 ? leftWall : minX;
  const footholdMaxX = footholds.length > 0 ? rightWall : maxX;

  // Collect dependencies
  const mobIds = [...new Set(life.filter((l) => l.type === "m").map((l) => l.id))].sort();
  const npcIds = [...new Set(life.filter((l) => l.type === "n").map((l) => l.id))].sort();
  const backgroundSets = [...new Set(backgrounds.map((b) => b.bS).filter((s) => s))].sort();
  const tileSets = [...new Set(layers.flatMap((l) => l.tiles.map((t) => t.tS)).filter((s) => s))].sort();
  const objectSets = [...new Set(layers.flatMap((l) => l.objects.map((o) => o.oS)).filter((s) => s))].sort();
  const targetMapIds = [
    ...new Set(
      portals
        .map((p) => p.targetMapId)
        .filter((id) => id > 0 && id < 999999999)
        .map(String)
    ),
  ].sort();

  return {
    mapId,
    info,
    swim: safeNumber(info.swim, 0) === 1,
    footholds,
    portals,
    ladderRopes,
    backgrounds,
    blackBackground,
    layers,
    life,
    bgmPath: safeString(info.bgm, ""),
    wallLines,
    walls,
    borders,
    footholdBounds: { minX: footholdMinX, maxX: footholdMaxX },
    bounds: { minX, maxX, minY, maxY },
    dependencies: {
      mobIds,
      npcIds,
      backgroundSets,
      tileSets,
      objectSets,
      targetMapIds,
    },
  };
}
