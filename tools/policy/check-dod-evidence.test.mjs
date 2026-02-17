import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { validateEvidence } from "./check-dod-evidence.mjs";

function readFixture(name) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("validateEvidence", () => {
  test("passes for complete evidence", () => {
    const markdown = readFixture("evidence-pass.md");
    const result = validateEvidence(markdown);

    expect(result.ok).toBe(true);
    expect(result.missingSections.length).toBe(0);
    expect(result.missingChecklistItems.length).toBe(0);
  });

  test("fails when required sections/checks are missing", () => {
    const markdown = readFixture("evidence-fail.md");
    const result = validateEvidence(markdown);

    expect(result.ok).toBe(false);
    expect(result.missingSections).toContain("Debug Mode Verification");
    expect(result.missingChecklistItems).toContain("Debug-mode verification executed");
    expect(result.missingChecklistItems).toContain(".memory/");
  });
});
