import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { listMarkdownDocs, normalizeDocPath } from "./docs-utils.mjs";

describe("docs utilities", () => {
  test("lists markdown docs under docs root", () => {
    const docsRoot = join(process.cwd(), "docs");
    const files = listMarkdownDocs(docsRoot);

    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain("pwa-findings.md");
  });

  test("normalizes valid doc paths", () => {
    expect(normalizeDocPath("process%2Fdebug-flags.md")).toBe("process/debug-flags.md");
  });

  test("rejects unsafe paths", () => {
    expect(() => normalizeDocPath("..%2Fsecret.md")).toThrow();
    expect(() => normalizeDocPath("README.txt")).toThrow();
  });
});
