import { existsSync } from "node:fs";
import { join } from "node:path";

const packageDir = process.argv[2] ?? ".";
const tsconfigPath = join(packageDir, "tsconfig.json");

if (!existsSync(tsconfigPath)) {
  console.error(`❌ Missing tsconfig.json in ${packageDir}`);
  process.exit(1);
}

const result = Bun.spawnSync({
  cmd: ["bunx", "tsc", "--noEmit", "-p", tsconfigPath],
  cwd: process.cwd(),
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});

if (result.exitCode !== 0) {
  console.error(`❌ Typecheck failed for ${packageDir}`);
  process.exit(result.exitCode ?? 1);
}

console.log(`✅ Typecheck passed for ${packageDir}`);
