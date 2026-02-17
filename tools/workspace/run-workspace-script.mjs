import { getWorkspacePackages, missingScripts } from "./workspace-utils.mjs";

const scriptName = process.argv[2];
if (!scriptName) {
  console.error("Usage: bun tools/workspace/run-workspace-script.mjs <script>");
  process.exit(2);
}

const packages = getWorkspacePackages();

for (const pkg of packages) {
  const missing = missingScripts(pkg.config, [scriptName]);
  if (missing.length > 0) {
    console.error(`❌ ${pkg.path} is missing script: ${scriptName}`);
    process.exit(1);
  }

  console.log(`▶ Running '${scriptName}' in ${pkg.path}`);
  const result = Bun.spawnSync({
    cmd: ["bun", "run", scriptName],
    cwd: pkg.absolutePath,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });

  if (result.exitCode !== 0) {
    console.error(`❌ Script '${scriptName}' failed in ${pkg.path}`);
    process.exit(result.exitCode ?? 1);
  }
}

console.log(`✅ Completed '${scriptName}' for all workspace packages.`);
