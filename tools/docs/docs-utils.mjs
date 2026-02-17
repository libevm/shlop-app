import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export function listMarkdownDocs(rootDir) {
  const files = [];

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolutePath = join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".md")) continue;

      files.push(relative(rootDir, absolutePath).replaceAll("\\", "/"));
    }
  }

  if (!statSync(rootDir).isDirectory()) {
    throw new Error(`Expected docs root directory: ${rootDir}`);
  }

  walk(rootDir);
  return files.sort((a, b) => a.localeCompare(b));
}

export function normalizeDocPath(inputPath) {
  const normalized = decodeURIComponent(inputPath).replaceAll("\\", "/");
  if (normalized.includes("..")) {
    throw new Error("Path traversal is not allowed");
  }
  if (!normalized.endsWith(".md")) {
    throw new Error("Only markdown docs are supported");
  }
  return normalized;
}
