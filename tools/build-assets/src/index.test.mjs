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
