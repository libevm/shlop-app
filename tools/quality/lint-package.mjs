import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function gatherFiles(dir, acc = []) {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      gatherFiles(path, acc);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx|js|mjs|json|md)$/.test(entry.name)) continue;

    acc.push(path);
  }

  return acc;
}

function lintFile(path) {
  const content = readFileSync(path, "utf8");
  const lines = content.split(/\r?\n/);
  const violations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/\s+$/.test(line)) {
      violations.push(`${path}:${index + 1} trailing whitespace`);
    }

    if (/\t/.test(line)) {
      violations.push(`${path}:${index + 1} tab character found; use spaces`);
    }
  }

  return violations;
}

const packageDir = process.argv[2] ?? ".";
if (!statSync(packageDir).isDirectory()) {
  console.error(`Expected directory: ${packageDir}`);
  process.exit(2);
}

const srcDir = join(packageDir, "src");
const files = gatherFiles(srcDir);
const violations = files.flatMap((file) => lintFile(file));

if (violations.length > 0) {
  console.error("❌ Lint failed:");
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log(`✅ Lint passed for ${packageDir} (${files.length} files checked).`);
