/**
 * Character/equip data extractor — Extracts body/hair/face/equip
 * data required by the character renderer.
 *
 * Phase 3, Step 16.
 *
 * Preserves layer/anchor metadata needed for composition.
 * Splits heavy frame payloads to blob references.
 */

// ─── Types ──────────────────────────────────────────────────────────

interface WzNode {
  $imgdir?: string;
  $canvas?: string | number;
  $int?: string;
  $float?: string;
  $string?: string;
  $vector?: string;
  $uol?: string;
  value?: unknown;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  $$?: WzNode[];
  [key: string]: unknown;
}

export interface ExtractedCharacter {
  id: string;
  type: "body" | "head" | "face" | "hair" | "equip";
  actions: ActionData[];
  /** Z-map layer ordering (if body type) */
  zmap: string[];
}

export interface ActionData {
  name: string;
  frameCount: number;
  frames: CharacterFrame[];
}

export interface CharacterFrame {
  index: number;
  delay: number;
  parts: PartData[];
  /** Whether this frame has a face slot */
  hasFace: boolean;
}

export interface PartData {
  name: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
  /** Map-vector anchors for composition (e.g., navel, neck, hand) */
  anchors: Record<string, { x: number; y: number }>;
  /** Whether this part has a canvas image */
  hasCanvas: boolean;
  /** UOL reference if this part links elsewhere */
  uolRef: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function childByName(node: WzNode | null | undefined, name: string): WzNode | undefined {
  return node?.$$?.find((c) => c.$imgdir === name || String(c.$canvas) === name);
}

function imgdirChildren(node: WzNode | null | undefined): WzNode[] {
  return node?.$$?.filter((c) => c.$imgdir !== undefined) ?? [];
}

function safeNumber(val: unknown, fallback: number): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = Number(val);
    return isNaN(n) ? fallback : n;
  }
  return fallback;
}

// ─── Part Extraction ────────────────────────────────────────────────

function extractPart(node: WzNode): PartData {
  const name = node.$imgdir ?? String(node.$canvas ?? "");
  const anchors: Record<string, { x: number; y: number }> = {};

  // Extract vector anchors (map-vector entries)
  for (const child of node.$$ ?? []) {
    if (child.$vector) {
      anchors[child.$vector] = { x: child.x ?? 0, y: child.y ?? 0 };
    }
  }

  // Origin anchor
  const origin = anchors["origin"] ?? { x: 0, y: 0 };

  return {
    name,
    width: safeNumber(node.width, 0),
    height: safeNumber(node.height, 0),
    originX: origin.x,
    originY: origin.y,
    anchors,
    hasCanvas: node.$canvas !== undefined || (node.width !== undefined && node.width > 0),
    uolRef: node.$uol !== undefined ? String(node.$uol) : null,
  };
}

function extractFrame(frameNode: WzNode): CharacterFrame {
  const index = safeNumber(frameNode.$imgdir ?? frameNode.$canvas, 0);
  const parts: PartData[] = [];
  let delay = 100;
  let hasFace = false;

  for (const child of frameNode.$$ ?? []) {
    const key = child.$imgdir ?? String(child.$canvas ?? "");

    // Extract delay
    if (child.$int === "delay" || child.$float === "delay") {
      delay = safeNumber(child.value, 100);
      continue;
    }

    // Check face flag
    if (child.$int === "face" && safeNumber(child.value, 0) === 1) {
      hasFace = true;
      continue;
    }

    // Skip non-part entries (scalars, vectors already captured)
    if (child.$int || child.$float || child.$string || child.$vector) continue;

    // This should be a part (body, arm, hand, etc.) or a canvas node
    if (child.$imgdir || child.$canvas !== undefined) {
      parts.push(extractPart(child));
    }
  }

  return { index, delay, parts, hasFace };
}

// ─── Action Extraction ──────────────────────────────────────────────

/** Common character action names. */
const CHARACTER_ACTIONS = [
  "stand1", "stand2", "walk1", "walk2",
  "jump", "fly", "ladder", "rope",
  "prone", "proneStab", "sit",
  "alert", "heal",
  "swingO1", "swingO2", "swingO3",
  "swingOF", "swingP1", "swingP2",
  "swingT1", "swingT2", "swingT3",
  "swingTF",
  "stabO1", "stabO2", "stabOF",
  "stabT1", "stabT2", "stabTF",
  "shoot1", "shoot2", "shootF",
];

function extractActions(raw: WzNode): ActionData[] {
  const actions: ActionData[] = [];

  // Look for all imgdir children that contain numeric frame sub-children
  for (const child of imgdirChildren(raw)) {
    const name = child.$imgdir!;
    if (name === "info") continue;

    // Check if this node has numeric frame children
    const subChildren = child.$$ ?? [];
    const frameChildren = subChildren.filter((c) => {
      const n = c.$imgdir ?? String(c.$canvas ?? "");
      return /^\d+$/.test(n);
    });

    if (frameChildren.length > 0) {
      const frames = frameChildren.map(extractFrame);
      frames.sort((a, b) => a.index - b.index);

      actions.push({
        name,
        frameCount: frames.length,
        frames,
      });
    }
  }

  return actions;
}

// ─── Z-Map Extraction ───────────────────────────────────────────────

function extractZmap(zmapNode: WzNode): string[] {
  const layers: string[] = [];
  for (const child of imgdirChildren(zmapNode)) {
    layers.push(child.$imgdir!);
  }
  return layers;
}

// ─── Main Extractor ─────────────────────────────────────────────────

/**
 * Determine character type from ID conventions.
 * Character WZ numeric IDs divided by 10000:
 *   0 = body (e.g., 2000 -> 00002000.img)
 *   1 = head (e.g., 12000 -> 00012000.img)
 *   2 = face (e.g., 20000 -> 00020000.img)
 *   3-4 = hair (e.g., 30000 -> 00030000.img)
 *   100+ = equip (e.g., 1040000 -> 01040000.img)
 */
function inferCharacterType(id: string): ExtractedCharacter["type"] {
  const numeric = parseInt(id.replace(/\D/g, ""), 10) || 0;
  const category = Math.floor(numeric / 10000);

  if (category === 0) return "body";
  if (category === 1) return "head";
  if (category === 2) return "face";
  if (category >= 3 && category <= 4) return "hair";
  return "equip";
}

/**
 * Extract character/equip data from raw WZ JSON.
 */
export function extractCharacter(raw: WzNode, charId: string): ExtractedCharacter {
  const type = inferCharacterType(charId);
  const actions = extractActions(raw);

  // Z-map is typically in Base.wz/zmap.img, not in character files
  // But some body files include it
  const zmapNode = childByName(raw, "zmap");
  const zmap = zmapNode ? extractZmap(zmapNode) : [];

  return { id: charId, type, actions, zmap };
}
