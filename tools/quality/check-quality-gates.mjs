import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REQUIRED_PACKAGE_SCRIPTS, getWorkspacePackages } from "../workspace/workspace-utils.mjs";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function missingGateScripts(packageJson) {
  const scripts = packageJson.scripts ?? {};
  return ["lint", "typecheck", "test"].filter((name) => typeof scripts[name] !== "string");
}

export function hasTestHarness(packageDir) {
  const srcDir = join(packageDir, "src");
  if (!existsSync(srcDir)) return false;

  const entries = readdirSync(srcDir, { withFileTypes: true });
  return entries.some((entry) => entry.isFile() && entry.name.includes(".test."));
}

export function evaluateWorkspaceQuality(rootDir = process.cwd()) {
  const results = [];

  for (const workspace of getWorkspacePackages(rootDir)) {
    const requiredScriptsMissing = REQUIRED_PACKAGE_SCRIPTS.filter(
      (name) => typeof (workspace.config.scripts ?? {})[name] !== "string",
    );
    const gateScriptsMissing = missingGateScripts(workspace.config);
    const tsconfigExists = existsSync(join(workspace.absolutePath, "tsconfig.json"));
    const testHarnessExists = hasTestHarness(workspace.absolutePath);

    results.push({
      path: workspace.path,
      requiredScriptsMissing,
      gateScriptsMissing,
      tsconfigExists,
      testHarnessExists,
      ok:
        requiredScriptsMissing.length === 0 &&
        gateScriptsMissing.length === 0 &&
        tsconfigExists &&
        testHarnessExists,
    });
  }

  return results;
}

if (import.meta.main) {
  const results = evaluateWorkspaceQuality();
  let hasFailures = false;

  for (const result of results) {
    if (result.ok) {
      console.log(`✅ ${result.path}: quality gate prerequisites satisfied`);
      continue;
    }

    hasFailures = true;
    console.error(`❌ ${result.path}: quality gate prerequisite failure`);

    if (result.requiredScriptsMissing.length > 0) {
      console.error(`  missing standard scripts: ${result.requiredScriptsMissing.join(", ")}`);
    }
    if (result.gateScriptsMissing.length > 0) {
      console.error(`  missing lint/typecheck/test scripts: ${result.gateScriptsMissing.join(", ")}`);
    }
    if (!result.tsconfigExists) {
      console.error("  missing tsconfig.json");
    }
    if (!result.testHarnessExists) {
      console.error("  missing test harness in src/*\.test\.*");
    }
  }

  if (hasFailures) {
    process.exit(1);
  }

  console.log("✅ All workspace quality gate prerequisites satisfied.");
}
