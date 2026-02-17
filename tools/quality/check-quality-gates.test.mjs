import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateWorkspaceQuality, missingGateScripts } from "./check-quality-gates.mjs";

function readFixture(name) {
  return JSON.parse(readFileSync(join(import.meta.dir, "fixtures", name), "utf8"));
}

describe("quality gate checks", () => {
  test("broken fixture fails lint/typecheck/test script checks", () => {
    const fixture = readFixture("broken-package.json");
    const missing = missingGateScripts(fixture);

    expect(missing).toContain("lint");
    expect(missing).toContain("typecheck");
    expect(missing).toContain("test");
  });

  test("workspace packages satisfy baseline quality gate prerequisites", () => {
    const results = evaluateWorkspaceQuality();

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.ok).toBe(true);
    }
  });
});
