import { describe, expect, test } from "bun:test";
import {
  normalizeAssetId,
  isValidAssetId,
  isValidEntityType,
  resolveAlias,
  createAssetLookup,
  assetLookupKey,
  getSectionSpec,
  getRequiredSections,
  isValidSection,
  ASSET_ENTITY_TYPES,
  ENTITY_SECTIONS,
  MAP_SECTIONS,
  MOB_SECTIONS,
  NPC_SECTIONS,
  SCHEMA_VERSION,
  ApiErrorCode,
  PortalType,
  BackgroundType,
} from "./index.ts";

// ─── ID Normalization ───────────────────────────────────────────────

describe("normalizeAssetId", () => {
  test("trims whitespace", () => {
    expect(normalizeAssetId(" 100000000 ")).toBe("100000000");
    expect(normalizeAssetId("\t42\n")).toBe("42");
  });

  test("strips leading zeros from numeric IDs", () => {
    expect(normalizeAssetId("00002000")).toBe("2000");
    expect(normalizeAssetId("0100000000")).toBe("100000000");
    expect(normalizeAssetId("0000")).toBe("0");
    expect(normalizeAssetId("007")).toBe("7");
  });

  test("preserves non-numeric string IDs as-is", () => {
    expect(normalizeAssetId("BgmGL.img/Amoria")).toBe("BgmGL.img/Amoria");
    expect(normalizeAssetId("Game/Jump")).toBe("Game/Jump");
  });

  test("preserves numeric IDs without leading zeros", () => {
    expect(normalizeAssetId("100000000")).toBe("100000000");
    expect(normalizeAssetId("2000")).toBe("2000");
  });

  test("returns empty string for empty/whitespace input", () => {
    expect(normalizeAssetId("")).toBe("");
    expect(normalizeAssetId("   ")).toBe("");
  });
});

describe("isValidAssetId", () => {
  test("valid for non-empty", () => {
    expect(isValidAssetId("100000000")).toBe(true);
    expect(isValidAssetId("Game/Jump")).toBe(true);
  });

  test("invalid for empty", () => {
    expect(isValidAssetId("")).toBe(false);
    expect(isValidAssetId("   ")).toBe(false);
  });
});

// ─── Entity Types ───────────────────────────────────────────────────

describe("isValidEntityType", () => {
  test("accepts all defined types", () => {
    for (const t of ASSET_ENTITY_TYPES) {
      expect(isValidEntityType(t)).toBe(true);
    }
  });

  test("rejects unknown types", () => {
    expect(isValidEntityType("weapon")).toBe(false);
    expect(isValidEntityType("")).toBe(false);
    expect(isValidEntityType("MAP")).toBe(false); // case sensitive
  });
});

describe("ASSET_ENTITY_TYPES", () => {
  test("contains expected core types", () => {
    expect(ASSET_ENTITY_TYPES).toContain("map");
    expect(ASSET_ENTITY_TYPES).toContain("mob");
    expect(ASSET_ENTITY_TYPES).toContain("npc");
    expect(ASSET_ENTITY_TYPES).toContain("character");
    expect(ASSET_ENTITY_TYPES).toContain("audio");
  });

  test("has no duplicates", () => {
    const set = new Set(ASSET_ENTITY_TYPES);
    expect(set.size).toBe(ASSET_ENTITY_TYPES.length);
  });
});

// ─── Alias Resolution ───────────────────────────────────────────────

describe("resolveAlias", () => {
  test("resolves known map aliases", () => {
    expect(resolveAlias("henesys")).toEqual({ type: "map", id: "100000000" });
    expect(resolveAlias("Ellinia")).toEqual({ type: "map", id: "101000000" });
    expect(resolveAlias("PERION")).toEqual({ type: "map", id: "102000000" });
  });

  test("resolves with underscores and spaces", () => {
    expect(resolveAlias("lith harbor")).toEqual({ type: "map", id: "104000000" });
    expect(resolveAlias("lith_harbor")).toEqual({ type: "map", id: "104000000" });
    expect(resolveAlias("maple island")).toEqual({ type: "map", id: "0" });
  });

  test("resolves mob aliases", () => {
    expect(resolveAlias("green-snail")).toEqual({ type: "mob", id: "100100" });
    expect(resolveAlias("slime")).toEqual({ type: "mob", id: "210100" });
  });

  test("resolves npc aliases", () => {
    expect(resolveAlias("mai")).toEqual({ type: "npc", id: "10200" });
  });

  test("returns null for unknown alias", () => {
    expect(resolveAlias("nonexistent")).toBeNull();
    expect(resolveAlias("")).toBeNull();
  });
});

// ─── Asset Lookup ───────────────────────────────────────────────────

describe("createAssetLookup", () => {
  test("normalizes ID", () => {
    const lookup = createAssetLookup("map", "  00100000000  ");
    expect(lookup.type).toBe("map");
    expect(lookup.id).toBe("100000000");
    expect(lookup.section).toBeUndefined();
  });

  test("includes section when provided", () => {
    const lookup = createAssetLookup("map", "100000000", "footholds");
    expect(lookup.section).toBe("footholds");
  });
});

describe("assetLookupKey", () => {
  test("formats without section", () => {
    expect(assetLookupKey({ type: "map", id: "100000000" })).toBe("map:100000000");
  });

  test("formats with section", () => {
    expect(assetLookupKey({ type: "map", id: "100000000", section: "footholds" })).toBe(
      "map:100000000:footholds"
    );
  });
});

// ─── Section Schemas ────────────────────────────────────────────────

describe("section schemas", () => {
  test("all entity types have section definitions", () => {
    for (const t of ASSET_ENTITY_TYPES) {
      const sections = ENTITY_SECTIONS[t];
      expect(sections).toBeDefined();
      expect(sections.length).toBeGreaterThan(0);
    }
  });

  test("all section specs have required fields", () => {
    for (const t of ASSET_ENTITY_TYPES) {
      for (const s of ENTITY_SECTIONS[t]) {
        expect(typeof s.name).toBe("string");
        expect(s.name.length).toBeGreaterThan(0);
        expect(typeof s.required).toBe("boolean");
        expect(["core", "heavy", "ref"]).toContain(s.category);
        expect(typeof s.description).toBe("string");
      }
    }
  });

  test("map has expected required sections", () => {
    const required = getRequiredSections("map");
    expect(required).toContain("info");
    expect(required).toContain("footholds");
    expect(required).toContain("portals");
  });

  test("map has expected optional sections", () => {
    expect(isValidSection("map", "backgrounds")).toBe(true);
    expect(isValidSection("map", "tiles")).toBe(true);
    expect(isValidSection("map", "objects")).toBe(true);
    expect(isValidSection("map", "life")).toBe(true);
  });

  test("mob has required info and stances", () => {
    const required = getRequiredSections("mob");
    expect(required).toContain("info");
    expect(required).toContain("stances");
  });

  test("character has required info and stances", () => {
    const required = getRequiredSections("character");
    expect(required).toContain("info");
    expect(required).toContain("stances");
  });
});

describe("getSectionSpec", () => {
  test("returns spec for valid section", () => {
    const spec = getSectionSpec("map", "footholds");
    expect(spec).not.toBeNull();
    expect(spec?.required).toBe(true);
    expect(spec?.category).toBe("core");
  });

  test("returns null for invalid section", () => {
    expect(getSectionSpec("map", "nonexistent")).toBeNull();
  });
});

describe("isValidSection", () => {
  test("accepts valid section names", () => {
    expect(isValidSection("map", "info")).toBe(true);
    expect(isValidSection("mob", "stances")).toBe(true);
    expect(isValidSection("audio", "data")).toBe(true);
  });

  test("rejects invalid section names", () => {
    expect(isValidSection("map", "attacks")).toBe(false);
    expect(isValidSection("mob", "portals")).toBe(false);
  });
});

// ─── No duplicate section names per entity type ─────────────────────

describe("section uniqueness", () => {
  test("no duplicate section names within any entity type", () => {
    for (const t of ASSET_ENTITY_TYPES) {
      const names = ENTITY_SECTIONS[t].map((s) => s.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    }
  });
});

// ─── Constants ──────────────────────────────────────────────────────

describe("constants", () => {
  test("SCHEMA_VERSION is a semver string", () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("PortalType has expected values", () => {
    expect(PortalType.SPAWN).toBe(0);
    expect(PortalType.REGULAR).toBe(2);
    expect(PortalType.HIDDEN_VISIBLE).toBe(10);
  });

  test("BackgroundType has expected values", () => {
    expect(BackgroundType.NORMAL).toBe(0);
    expect(BackgroundType.TILED).toBe(3);
    expect(BackgroundType.HMOVEA).toBe(4);
  });

  test("ApiErrorCode has expected codes", () => {
    expect(ApiErrorCode.NOT_FOUND).toBe("NOT_FOUND");
    expect(ApiErrorCode.INVALID_TYPE).toBe("INVALID_TYPE");
    expect(ApiErrorCode.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
  });
});
