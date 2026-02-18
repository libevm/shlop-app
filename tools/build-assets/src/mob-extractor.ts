/**
 * Mob/NPC document extractor — Extracts mob and NPC data from WZ JSON.
 *
 * Phase 3, Step 15.
 *
 * Handles:
 * - info.link resolution (mob/npc that reference other mob/npc data)
 * - Stance/frame metadata normalization
 * - Audio reference extraction
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

export interface ExtractedMob {
  id: string;
  info: MobInfo;
  stances: StanceData[];
  sounds: string[];
  linkedId: string | null;
}

export interface MobInfo {
  level: number;
  maxHP: number;
  maxMP: number;
  exp: number;
  speed: number;
  PADamage: number;
  PDDamage: number;
  MADamage: number;
  MDDamage: number;
  elemAttr: string;
  boss: boolean;
  undead: boolean;
  bodyAttack: boolean;
  link: string;
  [key: string]: unknown;
}

export interface ExtractedNpc {
  id: string;
  info: NpcInfo;
  stances: StanceData[];
  sounds: string[];
  linkedId: string | null;
}

export interface NpcInfo {
  name: string;
  func: string;
  script: string;
  link: string;
  [key: string]: unknown;
}

export interface StanceData {
  name: string;
  frameCount: number;
  frames: FrameData[];
}

export interface FrameData {
  index: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  delay: number;
  a0: number;
  a1: number;
  hasCanvas: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

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

// ─── Stance/Frame Extraction ────────────────────────────────────────

/** Known mob stances to look for. */
const MOB_STANCES = ["stand", "move", "hit1", "die1", "attack1", "attack2", "chase", "regen"];
/** Known NPC stances to look for. */
const NPC_STANCES = ["stand", "speak", "move", "say"];

function extractFrames(stanceNode: WzNode): FrameData[] {
  const frames: FrameData[] = [];
  const children = stanceNode.$$ ?? [];

  for (const child of children) {
    const idx = child.$imgdir ?? String(child.$canvas ?? "");
    if (!/^\d+$/.test(idx)) continue;

    const rec = leafRecord(child);
    const origin = rec.origin as { x: number; y: number } | undefined;
    const hasCanvas = child.$canvas !== undefined || child.width !== undefined;

    frames.push({
      index: Number(idx),
      width: safeNumber(child.width ?? rec.width, 0),
      height: safeNumber(child.height ?? rec.height, 0),
      originX: origin?.x ?? 0,
      originY: origin?.y ?? 0,
      delay: safeNumber(rec.delay, 100),
      a0: safeNumber(rec.a0, 255),
      a1: safeNumber(rec.a1, 255),
      hasCanvas,
    });
  }

  frames.sort((a, b) => a.index - b.index);
  return frames;
}

function extractStances(raw: WzNode, stanceNames: string[]): StanceData[] {
  const stances: StanceData[] = [];

  // Look for known stances
  for (const name of stanceNames) {
    const stanceNode = childByName(raw, name);
    if (!stanceNode) continue;

    const frames = extractFrames(stanceNode);
    stances.push({
      name,
      frameCount: frames.length,
      frames,
    });
  }

  // Also look for any imgdir children that might be stances (numeric sub-children = frames)
  for (const child of imgdirChildren(raw)) {
    const name = child.$imgdir!;
    if (stanceNames.includes(name)) continue; // Already captured
    if (name === "info") continue;

    // Check if it looks like a stance (has numeric frame children)
    const subChildren = child.$$ ?? [];
    const hasFrames = subChildren.some((c) => {
      const n = c.$imgdir ?? String(c.$canvas ?? "");
      return /^\d+$/.test(n);
    });

    if (hasFrames) {
      const frames = extractFrames(child);
      if (frames.length > 0) {
        stances.push({
          name,
          frameCount: frames.length,
          frames,
        });
      }
    }
  }

  return stances;
}

function extractSounds(raw: WzNode): string[] {
  const sounds: string[] = [];
  // Look for sound children with audio data references
  const soundNode = childByName(raw, "sound") ?? childByName(raw, "Sound");
  if (soundNode) {
    for (const child of imgdirChildren(soundNode)) {
      sounds.push(child.$imgdir!);
    }
  }
  return sounds.sort();
}

// ─── Mob Extractor ──────────────────────────────────────────────────

export function extractMob(raw: WzNode, mobId: string): ExtractedMob {
  const infoNode = childByName(raw, "info");
  const infoRec = infoNode ? leafRecord(infoNode) : {};

  const info: MobInfo = {
    level: safeNumber(infoRec.level, 0),
    maxHP: safeNumber(infoRec.maxHP, 0),
    maxMP: safeNumber(infoRec.maxMP, 0),
    exp: safeNumber(infoRec.exp, 0),
    speed: safeNumber(infoRec.speed, 0),
    PADamage: safeNumber(infoRec.PADamage, 0),
    PDDamage: safeNumber(infoRec.PDDamage, 0),
    MADamage: safeNumber(infoRec.MADamage, 0),
    MDDamage: safeNumber(infoRec.MDDamage, 0),
    elemAttr: safeString(infoRec.elemAttr, ""),
    boss: safeNumber(infoRec.boss, 0) === 1,
    undead: safeNumber(infoRec.undead, 0) === 1,
    bodyAttack: safeNumber(infoRec.bodyAttack, 0) === 1,
    link: safeString(infoRec.link, ""),
  };

  const linkedId = info.link && info.link !== "0" && info.link !== "" ? info.link : null;
  const stances = extractStances(raw, MOB_STANCES);
  const sounds = extractSounds(raw);

  return { id: mobId, info, stances, sounds, linkedId };
}

// ─── NPC Extractor ──────────────────────────────────────────────────

export function extractNpc(raw: WzNode, npcId: string): ExtractedNpc {
  const infoNode = childByName(raw, "info");
  const infoRec = infoNode ? leafRecord(infoNode) : {};

  const info: NpcInfo = {
    name: safeString(infoRec.name, ""),
    func: safeString(infoRec.func, ""),
    script: safeString(infoRec.script, ""),
    link: safeString(infoRec.link, ""),
  };

  const linkedId = info.link && info.link !== "0" && info.link !== "" ? info.link : null;
  const stances = extractStances(raw, NPC_STANCES);
  const sounds = extractSounds(raw);

  return { id: npcId, info, stances, sounds, linkedId };
}
