import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const REQUIRED_PACKAGE_SCRIPTS = ["dev", "build", "test", "lint", "typecheck"];

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function getRootConfig(rootDir = process.cwd()) {
  const packageJsonPath = join(rootDir, "package.json");
  return readJson(packageJsonPath);
}

export function getWorkspacePaths(rootDir = process.cwd()) {
  const rootConfig = getRootConfig(rootDir);
  if (!Array.isArray(rootConfig.workspaces)) {
    throw new Error("Root package.json must define a workspaces array");
  }

  return rootConfig.workspaces;
}

export function getWorkspacePackages(rootDir = process.cwd()) {
  const workspacePaths = getWorkspacePaths(rootDir);

  return workspacePaths.map((workspacePath) => {
    const packageJsonPath = join(rootDir, workspacePath, "package.json");
    const config = readJson(packageJsonPath);

    return {
      path: workspacePath,
      absolutePath: join(rootDir, workspacePath),
      packageJsonPath,
      config,
    };
  });
}

export function listTestFiles(packageAbsolutePath) {
  const srcPath = join(packageAbsolutePath, "src");
  const entries = readdirSync(srcPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.includes(".test."))
    .map((entry) => entry.name);
}

export function missingScripts(packageConfig, requiredScripts = REQUIRED_PACKAGE_SCRIPTS) {
  const scripts = packageConfig.scripts ?? {};
  return requiredScripts.filter((script) => typeof scripts[script] !== "string");
}
