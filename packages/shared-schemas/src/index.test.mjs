import { describe, expect, test } from "bun:test";
import { normalizeAssetId } from "./index.ts";

describe("shared-schemas workspace harness", () => {
  test("normalizes asset IDs", () => {
    expect(normalizeAssetId(" 100000000 ")).toBe("100000000");
  });
});
