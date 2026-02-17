import { readFile } from "node:fs/promises";
import process from "node:process";

export const REQUIRED_SECTIONS = [
  "Metadata",
  "Definition of Done Checklist",
  "Automated Test Evidence",
  "Debug Mode Verification",
  "Logs Reviewed",
  "Memory and Docs Updates",
  "Artifacts",
];

export const REQUIRED_CHECKS = [
  "Schema validation completed",
  "Automated tests executed and passing",
  "Debug-mode verification executed",
  "Relevant logs inspected and summarized",
  ".memory/",
  "docs/pwa-findings.md",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateEvidence(markdown) {
  const missingSections = REQUIRED_SECTIONS.filter((section) => {
    const sectionRegex = new RegExp(`^##\\s+${escapeRegExp(section)}\\s*$`, "im");
    return !sectionRegex.test(markdown);
  });

  const missingChecklistItems = REQUIRED_CHECKS.filter((check) => {
    const checkedRegex = new RegExp(`-\\s*\\[(x|X)\\]\\s*.*${escapeRegExp(check)}`, "i");
    return !checkedRegex.test(markdown);
  });

  return {
    ok: missingSections.length === 0 && missingChecklistItems.length === 0,
    missingSections,
    missingChecklistItems,
  };
}

async function main() {
  const evidencePath = process.argv[2];
  if (!evidencePath) {
    console.error("Usage: bun tools/policy/check-dod-evidence.mjs <path-to-evidence.md>");
    process.exit(2);
  }

  let markdown;
  try {
    markdown = await readFile(evidencePath, "utf8");
  } catch (error) {
    console.error(`Unable to read evidence file: ${evidencePath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  const result = validateEvidence(markdown);
  if (!result.ok) {
    console.error("❌ DoD evidence validation failed.");

    if (result.missingSections.length > 0) {
      console.error("Missing required sections:");
      for (const section of result.missingSections) {
        console.error(`  - ${section}`);
      }
    }

    if (result.missingChecklistItems.length > 0) {
      console.error("Missing checked DoD checklist items:");
      for (const item of result.missingChecklistItems) {
        console.error(`  - ${item}`);
      }
    }

    process.exit(1);
  }

  console.log(`✅ DoD evidence validation passed: ${evidencePath}`);
}

if (import.meta.main) {
  await main();
}
