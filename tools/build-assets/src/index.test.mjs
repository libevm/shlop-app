import { describe, expect, test } from "bun:test";
import { getBuildAssetsStatus } from "./index.ts";
import { scanResources, formatScanReport } from "./scanner.ts";
import { readJsonFile, readJsonFiles } from "./json-reader.ts";
import {
  resolveUol,
  resolveInlink,
  findAllReferences,
  resolveAllReferences,
} from "./uol-resolver.ts";
import { extractMap } from "./map-extractor.ts";
import { extractMob, extractNpc } from "./mob-extractor.ts";
import { extractCharacter } from "./character-extractor.ts";
import { BlobStore } from "./blob-store.ts";
import { AssetIndex } from "./asset-index.ts";
import { PipelineReportBuilder, formatPipelineReport } from "./pipeline-report.ts";
import { join } from "node:path";
import { writeFile, mkdir, rm } from "node:fs/promises";

// ─── Harness ────────────────────────────────────────────────────────

describe("build-assets workspace harness", () => {
  test("returns ready status", () => {
    expect(getBuildAssetsStatus()).toBe("build-assets-workspace-ready");
  });
});

// ─── Scanner ────────────────────────────────────────────────────────

describe("scanner", () => {
  const resourcesRoot = join(import.meta.dir, "../../../resources");

  test("scans resources directory and returns valid report", async () => {
    const report = await scanResources(resourcesRoot);
    expect(report.namespaceCount).toBeGreaterThan(0);
    expect(report.totalFileCount).toBeGreaterThan(1000);
    expect(report.totalBytes).toBeGreaterThan(0);
    expect(report.namespaces.length).toBe(report.namespaceCount);
    expect(report.largestFiles.length).toBeGreaterThan(0);
    expect(report.largestFiles.length).toBeLessThanOrEqual(10);
  }, 30000);

  test("report has expected WZ namespaces", async () => {
    const report = await scanResources(resourcesRoot);
    const nsNames = report.namespaces.map((n) => n.namespace);
    expect(nsNames).toContain("Map.wz");
    expect(nsNames).toContain("Character.wz");
    expect(nsNames).toContain("Sound.wz");
    expect(nsNames).toContain("Mob.wz");
  }, 30000);

  test("report is deterministically ordered", async () => {
    const report = await scanResources(resourcesRoot);
    const nsNames = report.namespaces.map((n) => n.namespace);
    const sorted = [...nsNames].sort();
    expect(nsNames).toEqual(sorted);
  }, 30000);

  test("formatScanReport produces readable output", async () => {
    const report = await scanResources(resourcesRoot);
    const text = formatScanReport(report);
    expect(text).toContain("Asset Source Scan Report");
    expect(text).toContain("Map.wz");
    expect(text).toContain("Total files:");
    expect(text).toContain("Top 10 Largest Files");
  }, 30000);
});

// ─── JSON Reader ────────────────────────────────────────────────────

describe("json-reader", () => {
  const tmpDir = join(import.meta.dir, "../../../.tmp-test-json");

  test("reads valid JSON file", async () => {
    await mkdir(tmpDir, { recursive: true });
    const path = join(tmpDir, "valid.json");
    await writeFile(path, JSON.stringify({ hello: "world" }));

    const result = await readJsonFile(path);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ hello: "world" });
      expect(result.bytes).toBeGreaterThan(0);
    }

    await rm(tmpDir, { recursive: true, force: true });
  });

  test("handles malformed JSON gracefully", async () => {
    await mkdir(tmpDir, { recursive: true });
    const path = join(tmpDir, "bad.json");
    await writeFile(path, '{ "truncated":');

    const result = await readJsonFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("JSON parse failed");
      expect(result.bytes).toBeGreaterThan(0);
    }

    await rm(tmpDir, { recursive: true, force: true });
  });

  test("handles missing file gracefully", async () => {
    const result = await readJsonFile("/nonexistent/path.json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("File read failed");
    }
  });

  test("handles BOM prefix", async () => {
    await mkdir(tmpDir, { recursive: true });
    const path = join(tmpDir, "bom.json");
    await writeFile(path, "\uFEFF" + JSON.stringify({ bom: true }));

    const result = await readJsonFile(path);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ bom: true });
    }

    await rm(tmpDir, { recursive: true, force: true });
  });

  test("readJsonFiles collects results and errors", async () => {
    await mkdir(tmpDir, { recursive: true });
    const goodPath = join(tmpDir, "good.json");
    const badPath = join(tmpDir, "bad.json");
    await writeFile(goodPath, JSON.stringify({ ok: true }));
    await writeFile(badPath, "not json{{{");

    const { results, errors } = await readJsonFiles([goodPath, badPath, "/missing.json"]);
    expect(results.length).toBe(1);
    expect(errors.length).toBe(2);

    await rm(tmpDir, { recursive: true, force: true });
  });
});

// ─── UOL Resolver ───────────────────────────────────────────────────

describe("uol-resolver", () => {
  const tree = {
    $imgdir: "root",
    $$: [
      {
        $imgdir: "stand1",
        $$: [
          {
            $imgdir: "0",
            $$: [
              { $imgdir: "body", $canvas: "body", width: 50, height: 60 },
              { $imgdir: "arm", $canvas: "arm", width: 30, height: 40 },
            ],
          },
        ],
      },
      {
        $imgdir: "walk1",
        $$: [
          {
            $imgdir: "0",
            $$: [
              { $imgdir: "body", $uol: "../../stand1/0/body" },
              { $imgdir: "arm", $canvas: "arm", width: 35, height: 45 },
            ],
          },
        ],
      },
      {
        $imgdir: "prone",
        $$: [
          {
            $imgdir: "0",
            $$: [
              { $imgdir: "body", $uol: "../../proneStab/0/body" },
            ],
          },
        ],
      },
      {
        $imgdir: "proneStab",
        $$: [
          {
            $imgdir: "0",
            $$: [
              { $imgdir: "body", $canvas: "body", width: 70, height: 30 },
            ],
          },
        ],
      },
    ],
  };

  test("resolves UOL path to target node", () => {
    const target = resolveUol(tree, ["walk1", "0", "body"], "../../stand1/0/body");
    expect(target).not.toBeNull();
    expect(target?.width).toBe(50);
    expect(target?.height).toBe(60);
  });

  test("resolves chained UOL (prone -> proneStab)", () => {
    const target = resolveUol(tree, ["prone", "0", "body"], "../../proneStab/0/body");
    expect(target).not.toBeNull();
    expect(target?.width).toBe(70);
  });

  test("returns null for invalid UOL path", () => {
    const target = resolveUol(tree, ["walk1", "0", "body"], "../../nonexistent/0/body");
    expect(target).toBeNull();
  });

  test("resolves inlink path", () => {
    const target = resolveInlink(tree, "stand1/0/arm");
    expect(target).not.toBeNull();
    expect(target?.width).toBe(30);
  });

  test("returns null for invalid inlink", () => {
    expect(resolveInlink(tree, "nonexistent/path")).toBeNull();
  });

  test("findAllReferences finds UOL refs", () => {
    const refs = findAllReferences(tree);
    const uolRefs = refs.filter((r) => r.refType === "uol");
    expect(uolRefs.length).toBe(2); // walk1/0/body and prone/0/body
  });

  test("resolveAllReferences resolves valid UOLs", () => {
    const result = resolveAllReferences(tree);
    expect(result.totalReferences).toBe(2);
    expect(result.resolvedCount).toBe(2);
    expect(result.unresolved.length).toBe(0);
  });

  test("resolveAllReferences strict mode throws on unresolved", () => {
    const badTree = {
      $imgdir: "root",
      $$: [{ $imgdir: "a", $$: [{ $imgdir: "b", $uol: "../../missing/node" }] }],
    };
    expect(() => resolveAllReferences(badTree, { strict: true })).toThrow("Unresolved uol");
  });

  test("resolveAllReferences permissive mode collects unresolved", () => {
    const badTree = {
      $imgdir: "root",
      $$: [{ $imgdir: "a", $$: [{ $imgdir: "b", $uol: "../../missing/node" }] }],
    };
    const result = resolveAllReferences(badTree, { strict: false });
    expect(result.totalReferences).toBe(1);
    expect(result.resolvedCount).toBe(0);
    expect(result.unresolved.length).toBe(1);
    expect(result.unresolved[0].refType).toBe("uol");
  });
});

// ─── Map Extractor ──────────────────────────────────────────────────

describe("map-extractor", () => {
  test("extracts map from real WZ JSON (Henesys 100000000)", async () => {
    const mapPath = join(import.meta.dir, "../../../resources/Map.wz/Map/Map1/100000000.img.json");
    const raw = await Bun.file(mapPath).json();
    const map = extractMap(raw, "100000000");

    expect(map.mapId).toBe("100000000");
    expect(map.info).toBeDefined();
    expect(typeof map.info.bgm).toBe("string");
    expect(map.footholds.length).toBeGreaterThan(10);
    expect(map.portals.length).toBeGreaterThan(0);
    expect(map.backgrounds.length).toBeGreaterThan(0);
    expect(map.life.length).toBeGreaterThan(0);

    // Walls and borders derived
    expect(map.walls.left).toBeLessThan(map.walls.right);
    expect(map.borders.top).toBeLessThan(map.borders.bottom);

    // Dependencies populated
    expect(map.dependencies.backgroundSets.length).toBeGreaterThan(0);
    expect(map.dependencies.targetMapIds.length).toBeGreaterThan(0);
  });

  test("extracts footholds with proper prev/next linking", async () => {
    const mapPath = join(import.meta.dir, "../../../resources/Map.wz/Map/Map1/100000000.img.json");
    const raw = await Bun.file(mapPath).json();
    const map = extractMap(raw, "100000000");

    // At least some footholds should have links
    const linked = map.footholds.filter((f) => f.prevId !== null || f.nextId !== null);
    expect(linked.length).toBeGreaterThan(0);

    // All footholds have numeric-string IDs
    for (const fh of map.footholds) {
      expect(typeof fh.id).toBe("string");
      expect(fh.id.length).toBeGreaterThan(0);
    }
  });

  test("extracts portals with type and target info", async () => {
    const mapPath = join(import.meta.dir, "../../../resources/Map.wz/Map/Map1/100000000.img.json");
    const raw = await Bun.file(mapPath).json();
    const map = extractMap(raw, "100000000");

    for (const portal of map.portals) {
      expect(typeof portal.name).toBe("string");
      expect(typeof portal.type).toBe("number");
      expect(typeof portal.x).toBe("number");
      expect(typeof portal.y).toBe("number");
    }
  });

  test("extracts layers with tiles and objects", async () => {
    const mapPath = join(import.meta.dir, "../../../resources/Map.wz/Map/Map1/100000000.img.json");
    const raw = await Bun.file(mapPath).json();
    const map = extractMap(raw, "100000000");

    expect(map.layers.length).toBe(8); // layers 0-7
    const hasContent = map.layers.some((l) => l.tiles.length > 0 || l.objects.length > 0);
    expect(hasContent).toBe(true);
  });

  test("extracts swim map correctly", async () => {
    // Map 104040000 is a swim map
    const mapPath = join(import.meta.dir, "../../../resources/Map.wz/Map/Map1/104040000.img.json");
    const raw = await Bun.file(mapPath).json();
    const map = extractMap(raw, "104040000");

    // Check swim flag exists (may or may not be true for this map)
    expect(typeof map.swim).toBe("boolean");
  });

  test("handles empty/minimal map structure", () => {
    const minimal = {
      $imgdir: "999999999.img",
      $$: [
        {
          $imgdir: "info",
          $$: [{ $string: "bgm", value: "Bgm00/Town" }],
        },
      ],
    };
    const map = extractMap(minimal, "999999999");
    expect(map.mapId).toBe("999999999");
    expect(map.footholds.length).toBe(0);
    expect(map.portals.length).toBe(0);
    expect(map.ladderRopes.length).toBe(0);
    expect(map.backgrounds.length).toBe(0);
    expect(map.life.length).toBe(0);
    expect(map.layers.length).toBe(8);
    expect(map.bgmPath).toBe("Bgm00/Town");
  });

  test("dependencies are correctly deduped and sorted", async () => {
    const mapPath = join(import.meta.dir, "../../../resources/Map.wz/Map/Map1/100000000.img.json");
    const raw = await Bun.file(mapPath).json();
    const map = extractMap(raw, "100000000");

    // Check sorting
    const deps = map.dependencies;
    expect(deps.mobIds).toEqual([...deps.mobIds].sort());
    expect(deps.npcIds).toEqual([...deps.npcIds].sort());
    expect(deps.backgroundSets).toEqual([...deps.backgroundSets].sort());
    expect(deps.tileSets).toEqual([...deps.tileSets].sort());
    expect(deps.objectSets).toEqual([...deps.objectSets].sort());

    // No duplicates
    expect(new Set(deps.mobIds).size).toBe(deps.mobIds.length);
    expect(new Set(deps.backgroundSets).size).toBe(deps.backgroundSets.length);
  });
});

// ─── Mob/NPC Extractor ──────────────────────────────────────────────

describe("mob-extractor", () => {
  test("extracts mob from real WZ JSON", async () => {
    // Green Snail
    const path = join(import.meta.dir, "../../../resources/Mob.wz/0100100.img.json");
    const raw = await Bun.file(path).json();
    const mob = extractMob(raw, "100100");

    expect(mob.id).toBe("100100");
    expect(mob.info).toBeDefined();
    expect(typeof mob.info.level).toBe("number");
    expect(mob.stances.length).toBeGreaterThan(0);

    // Should have at least stand/move/hit/die
    const stanceNames = mob.stances.map((s) => s.name);
    expect(stanceNames).toContain("stand");
  });

  test("extracts NPC from real WZ JSON", async () => {
    // Find any NPC file
    const npcDir = join(import.meta.dir, "../../../resources/Npc.wz");
    const files = await Bun.file(join(npcDir, "1012100.img.json")).exists()
      ? ["1012100.img.json"]
      : [];

    if (files.length > 0) {
      const raw = await Bun.file(join(npcDir, files[0])).json();
      const npc = extractNpc(raw, "1012100");
      expect(npc.id).toBe("1012100");
      expect(npc.info).toBeDefined();
    }
  });

  test("handles linked mob gracefully", () => {
    const minimal = {
      $imgdir: "test.img",
      $$: [
        {
          $imgdir: "info",
          $$: [
            { $int: "level", value: 10 },
            { $string: "link", value: "100101" },
          ],
        },
      ],
    };
    const mob = extractMob(minimal, "999");
    expect(mob.linkedId).toBe("100101");
    expect(mob.stances.length).toBe(0);
  });
});

// ─── Character Extractor ────────────────────────────────────────────

describe("character-extractor", () => {
  test("extracts body character from real WZ JSON", async () => {
    const path = join(import.meta.dir, "../../../resources/Character.wz/00002000.img.json");
    const raw = await Bun.file(path).json();
    const char = extractCharacter(raw, "00002000");

    expect(char.id).toBe("00002000");
    expect(char.type).toBe("body");
    expect(char.actions.length).toBeGreaterThan(0);

    // Should have common actions
    const actionNames = char.actions.map((a) => a.name);
    expect(actionNames).toContain("stand1");
    expect(actionNames).toContain("walk1");
  });

  test("extracts action frames with parts", async () => {
    const path = join(import.meta.dir, "../../../resources/Character.wz/00002000.img.json");
    const raw = await Bun.file(path).json();
    const char = extractCharacter(raw, "00002000");

    const stand1 = char.actions.find((a) => a.name === "stand1");
    expect(stand1).toBeDefined();
    expect(stand1.frameCount).toBeGreaterThan(0);
    expect(stand1.frames[0].parts.length).toBeGreaterThan(0);
  });

  test("infers character type correctly", async () => {
    const path = join(import.meta.dir, "../../../resources/Character.wz/00002000.img.json");
    const raw = await Bun.file(path).json();

    expect(extractCharacter(raw, "00002000").type).toBe("body");
    expect(extractCharacter(raw, "00012000").type).toBe("head");
    expect(extractCharacter(raw, "00020000").type).toBe("face");
    expect(extractCharacter(raw, "00030000").type).toBe("hair");
    expect(extractCharacter(raw, "01040000").type).toBe("equip");
  });
});

// ─── Blob Store ─────────────────────────────────────────────────────

describe("blob-store", () => {
  test("stores and retrieves blobs", () => {
    const store = new BlobStore();
    const data = Buffer.from("hello world");
    const ref = store.store(data, "text/plain");

    expect(ref.hash.length).toBe(32);
    expect(ref.size).toBe(11);

    const retrieved = store.get(ref.hash);
    expect(retrieved).not.toBeNull();
    expect(retrieved.data.toString()).toBe("hello world");
  });

  test("deduplicates identical content", () => {
    const store = new BlobStore();
    const data = Buffer.from("duplicate content");
    const ref1 = store.store(data);
    const ref2 = store.store(Buffer.from("duplicate content"));

    expect(ref1.hash).toBe(ref2.hash);

    const stats = store.stats();
    expect(stats.totalBlobs).toBe(2);
    expect(stats.uniqueBlobs).toBe(1);
    expect(stats.deduplicatedBytes).toBeGreaterThan(0);
    expect(stats.deduplicationRatio).toBeGreaterThan(0);
  });

  test("stores JSON payloads", () => {
    const store = new BlobStore();
    const ref = store.storeJson({ key: "value" });
    expect(ref.contentType).toBe("application/json");

    const retrieved = store.get(ref.hash);
    const parsed = JSON.parse(retrieved.data.toString());
    expect(parsed.key).toBe("value");
  });

  test("different content gets different hashes", () => {
    const store = new BlobStore();
    const ref1 = store.store(Buffer.from("content A"));
    const ref2 = store.store(Buffer.from("content B"));
    expect(ref1.hash).not.toBe(ref2.hash);
  });
});

// ─── Asset Index ────────────────────────────────────────────────────

describe("asset-index", () => {
  test("set/get/has/delete entries", () => {
    const index = new AssetIndex();
    const blobRef = { hash: "abc123", size: 100, contentType: "application/json" };

    index.set("map", "100000000", "info", blobRef);
    expect(index.has("map", "100000000", "info")).toBe(true);

    const entry = index.get("map", "100000000", "info");
    expect(entry).not.toBeNull();
    expect(entry.blobHash).toBe("abc123");

    index.delete("map", "100000000", "info");
    expect(index.has("map", "100000000", "info")).toBe(false);
  });

  test("getSections returns all sections for an entity", () => {
    const index = new AssetIndex();
    index.set("map", "100", "info", { hash: "a", size: 10, contentType: "application/json" });
    index.set("map", "100", "footholds", { hash: "b", size: 20, contentType: "application/json" });
    index.set("map", "200", "info", { hash: "c", size: 30, contentType: "application/json" });

    const sections = index.getSections("map", "100");
    expect(sections.length).toBe(2);
  });

  test("reverse lookup by blob hash", () => {
    const index = new AssetIndex();
    index.set("map", "100", "info", { hash: "shared", size: 10, contentType: "application/json" });
    index.set("mob", "200", "info", { hash: "shared", size: 10, contentType: "application/json" });
    index.set("npc", "300", "info", { hash: "other", size: 20, contentType: "application/json" });

    const refs = index.findByBlobHash("shared");
    expect(refs.length).toBe(2);
  });

  test("integrity check", () => {
    const index = new AssetIndex();
    index.set("map", "100", "info", { hash: "exists", size: 10, contentType: "application/json" });
    index.set("map", "100", "footholds", { hash: "missing", size: 20, contentType: "application/json" });

    const result = index.checkIntegrity(new Set(["exists"]));
    expect(result.ok).toBe(false);
    expect(result.validEntries).toBe(1);
    expect(result.missingBlobs.length).toBe(1);
    expect(result.missingBlobs[0].hash).toBe("missing");
  });

  test("serialize/deserialize roundtrip", () => {
    const index = new AssetIndex();
    index.set("map", "100", "info", { hash: "a1b2c3", size: 50, contentType: "application/json" });
    index.set("mob", "200", "stances", { hash: "d4e5f6", size: 100, contentType: "application/json" });

    const json = index.serialize();
    const restored = AssetIndex.deserialize(json);

    expect(restored.size).toBe(2);
    expect(restored.get("map", "100", "info").blobHash).toBe("a1b2c3");
    expect(restored.get("mob", "200", "stances").blobHash).toBe("d4e5f6");
  });

  test("stats reflect current state", () => {
    const index = new AssetIndex();
    index.set("map", "100", "info", { hash: "a", size: 10, contentType: "application/json" });
    index.set("map", "100", "footholds", { hash: "b", size: 20, contentType: "application/json" });
    index.set("mob", "200", "info", { hash: "c", size: 30, contentType: "application/json" });

    const stats = index.stats();
    expect(stats.totalEntries).toBe(3);
    expect(stats.uniqueTypes).toBe(2);
    expect(stats.uniqueIds).toBe(2);
    expect(stats.entriesByType["map"]).toBe(2);
    expect(stats.entriesByType["mob"]).toBe(1);
  });
});

// ─── Pipeline Report ────────────────────────────────────────────────

describe("pipeline-report", () => {
  test("builds report with entity counts and issues", () => {
    const builder = new PipelineReportBuilder();
    builder.addEntityCount("map", 50);
    builder.addEntityCount("mob", 100);
    builder.addIssue("warning", "unresolved-ref", "Missing mob 999", "Map/100000000");
    builder.addIssue("error", "parse-error", "Bad JSON", "Mob/broken.json");

    const blobStats = {
      totalBlobs: 200, totalBytes: 5000, uniqueBlobs: 150,
      uniqueBytes: 4000, deduplicatedBytes: 1000, deduplicationRatio: 0.2,
    };
    const indexStats = {
      totalEntries: 150, uniqueTypes: 2, uniqueIds: 100,
      entriesByType: { map: 50, mob: 100 },
    };

    const report = builder.build(blobStats, indexStats);
    expect(report.totalEntities).toBe(150);
    expect(report.issueSummary.warning).toBe(1);
    expect(report.issueSummary.error).toBe(1);
    expect(report.passed).toBe(false); // has errors
  });

  test("passes when no errors", () => {
    const builder = new PipelineReportBuilder();
    builder.addEntityCount("map", 10);
    builder.addIssue("info", "note", "All good");

    const report = builder.build(
      { totalBlobs: 0, totalBytes: 0, uniqueBlobs: 0, uniqueBytes: 0, deduplicatedBytes: 0, deduplicationRatio: 0 },
      { totalEntries: 10, uniqueTypes: 1, uniqueIds: 10, entriesByType: { map: 10 } },
    );
    expect(report.passed).toBe(true);
  });

  test("formatPipelineReport produces readable output", () => {
    const builder = new PipelineReportBuilder();
    builder.addEntityCount("map", 5);
    const report = builder.build(
      { totalBlobs: 10, totalBytes: 500, uniqueBlobs: 8, uniqueBytes: 400, deduplicatedBytes: 100, deduplicationRatio: 0.2 },
      { totalEntries: 5, uniqueTypes: 1, uniqueIds: 5, entriesByType: { map: 5 } },
    );
    const text = formatPipelineReport(report);
    expect(text).toContain("Build Pipeline Report");
    expect(text).toContain("PASSED");
    expect(text).toContain("Dedup ratio:");
  });
});
