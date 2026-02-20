#!/usr/bin/env node
/**
 * extract-v2-maps.mjs
 *
 * Scans the 21 V2 maps, collects all asset dependencies (tiles, objects,
 * backgrounds, mobs, NPCs, BGM, portals), and copies them from resources/
 * into resourcesv2/ in the same directory structure.
 *
 * Also copies shared assets: Character base, UI, Sound, String, Effect, Base.
 *
 * Usage: node tools/build-assets/extract-v2-maps.mjs
 *        (or: bun run tools/build-assets/extract-v2-maps.mjs)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const SRC = join(ROOT, "resources");
const DST = join(ROOT, "resourcesv2");

// ── V2 Map Set ─────────────────────────────────────────────────────────────

const V2_MAPS = [
  "100000001",                                                      // Henesys
  "103000900","103000901","103000902",                              // Shumi 1
  "103000903","103000904","103000905",                              // Shumi 2
  "103000906","103000907","103000908",                              // Shumi 3
  "105040310","105040311","105040312","105040313","105040314","105040315", // John
  "101000100","101000101",                                          // Forest of Patience
  "280020000","280020001",                                          // Breath of Lava
];

// ── Helpers ────────────────────────────────────────────────────────────────

function findChild(node, name) {
  return (node.$$ || []).find(c =>
    c.$imgdir === name || c.$string === name || c.$int === name
  );
}

function getStringVal(parent, name) {
  const node = (parent.$$ || []).find(c => c.$string === name);
  return node ? String(node.value) : null;
}

function ensureCopy(relPath) {
  const src = join(SRC, relPath);
  const dst = join(DST, relPath);
  if (!existsSync(src)) {
    console.warn(`  ⚠ MISSING: ${relPath}`);
    return false;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  return true;
}

function padId(id, len = 8) {
  return String(id).padStart(len, "0");
}

// ── Dependency Scanner ─────────────────────────────────────────────────────

const deps = {
  maps: new Set(),
  tileSets: new Set(),
  objSets: new Set(),
  backSets: new Set(),
  mobs: new Set(),
  npcs: new Set(),
  bgms: new Set(), // "Bgm03/Subway" format
};

function scanMap(mapId) {
  const digit = mapId.charAt(0);
  const relPath = `Map.wz/Map/Map${digit}/${mapId}.img.json`;
  const src = join(SRC, relPath);
  if (!existsSync(src)) {
    console.warn(`  ⚠ Map not found: ${relPath}`);
    return;
  }

  deps.maps.add(relPath);
  const map = JSON.parse(readFileSync(src, "utf8"));

  // BGM
  const info = findChild(map, "info");
  if (info) {
    const bgm = getStringVal(info, "bgm");
    if (bgm) deps.bgms.add(bgm);
  }

  // Life (mobs + NPCs)
  const life = findChild(map, "life");
  if (life) {
    for (const entry of (life.$$ || [])) {
      const type = getStringVal(entry, "type");
      const id = getStringVal(entry, "id");
      if (!type || !id) continue;
      if (type === "m") deps.mobs.add(id);
      if (type === "n") deps.npcs.add(id);
    }
  }

  // Layers 0-7: tile sets + object sets
  for (let i = 0; i <= 7; i++) {
    const layer = findChild(map, String(i));
    if (!layer) continue;

    const layerInfo = findChild(layer, "info");
    if (layerInfo) {
      const tS = getStringVal(layerInfo, "tS");
      if (tS) deps.tileSets.add(tS);
    }

    const obj = findChild(layer, "obj");
    if (obj) {
      for (const o of (obj.$$ || [])) {
        const oS = getStringVal(o, "oS");
        if (oS) deps.objSets.add(oS);
      }
    }
  }

  // Backgrounds
  const back = findChild(map, "back");
  if (back) {
    for (const b of (back.$$ || [])) {
      const bS = getStringVal(b, "bS");
      if (bS) deps.backSets.add(bS);
    }
  }
}

// ── Scan all maps ──────────────────────────────────────────────────────────

console.log("🍄 V2 Resource Extraction");
console.log(`  Source: ${SRC}`);
console.log(`  Dest:   ${DST}`);
console.log(`  Maps:   ${V2_MAPS.length}\n`);

console.log("Scanning maps for dependencies...");
for (const mapId of V2_MAPS) {
  scanMap(mapId);
}

console.log(`\nDependencies found:`);
console.log(`  Maps:      ${deps.maps.size}`);
console.log(`  Tile sets: ${deps.tileSets.size} — ${[...deps.tileSets].join(", ")}`);
console.log(`  Obj sets:  ${deps.objSets.size} — ${[...deps.objSets].join(", ")}`);
console.log(`  Back sets: ${deps.backSets.size} — ${[...deps.backSets].join(", ")}`);
console.log(`  Mobs:      ${deps.mobs.size} — ${[...deps.mobs].join(", ")}`);
console.log(`  NPCs:      ${deps.npcs.size} — ${[...deps.npcs].join(", ")}`);
console.log(`  BGMs:      ${deps.bgms.size} — ${[...deps.bgms].join(", ")}`);

// ── Copy dependencies ──────────────────────────────────────────────────────

let copied = 0;
let missing = 0;

function copyAsset(relPath) {
  if (ensureCopy(relPath)) { copied++; } else { missing++; }
}

console.log("\nCopying map files...");
for (const relPath of deps.maps) {
  copyAsset(relPath);
}

console.log("Copying tile sets...");
for (const tS of deps.tileSets) {
  copyAsset(`Map.wz/Tile/${tS}.img.json`);
}

console.log("Copying object sets...");
for (const oS of deps.objSets) {
  copyAsset(`Map.wz/Obj/${oS}.img.json`);
}

console.log("Copying background sets...");
for (const bS of deps.backSets) {
  copyAsset(`Map.wz/Back/${bS}.img.json`);
}

console.log("Copying mobs...");
for (const mobId of deps.mobs) {
  copyAsset(`Mob.wz/${padId(mobId, 7)}.img.json`);
}

console.log("Copying NPCs...");
for (const npcId of deps.npcs) {
  copyAsset(`Npc.wz/${padId(npcId, 7)}.img.json`);
}

console.log("Copying BGM (Sound.wz)...");
for (const bgm of deps.bgms) {
  // bgm is "Bgm03/Subway" — we need the whole pack file "Bgm03.img.json"
  const pack = bgm.split("/")[0];
  copyAsset(`Sound.wz/${pack}.img.json`);
}

// ── Shared / required assets ───────────────────────────────────────────────

console.log("Copying shared assets...");

const SHARED_ASSETS = [
  // UI & sounds
  "UI.wz/Basic.img.json",
  "Sound.wz/UI.img.json",
  "Sound.wz/Game.img.json",
  // Effects
  "Effect.wz/BasicEff.img.json",
  // Base
  "Base.wz/zmap.img.json",
  // Map helper (portals)
  "Map.wz/MapHelper.img.json",
  // String tables
  "String.wz/Map.img.json",
  "String.wz/Mob.img.json",
  "String.wz/Npc.img.json",
  "String.wz/Eqp.img.json",
  "String.wz/Consume.img.json",
  "String.wz/Etc.img.json",
  "String.wz/Ins.img.json",
  // Character base — body + head (skin 0)
  "Character.wz/00002000.img.json",
  "Character.wz/00012000.img.json",
  // Male defaults
  "Character.wz/Face/00020000.img.json",
  "Character.wz/Hair/00030000.img.json",
  "Character.wz/Coat/01040002.img.json",
  "Character.wz/Pants/01060002.img.json",
  // Female defaults
  "Character.wz/Face/00021000.img.json",
  "Character.wz/Hair/00031000.img.json",
  "Character.wz/Coat/01041002.img.json",
  "Character.wz/Pants/01061002.img.json",
  // Unisex defaults
  "Character.wz/Shoes/01072001.img.json",
  "Character.wz/Weapon/01302000.img.json",
];

for (const relPath of SHARED_ASSETS) {
  copyAsset(relPath);
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n✅ Done! Copied ${copied} files, ${missing} missing.`);

// Quick size check
import { execSync } from "node:child_process";
try {
  const size = execSync(`du -sh ${DST}`, { encoding: "utf8" }).trim();
  console.log(`   ${size}`);
} catch {}
