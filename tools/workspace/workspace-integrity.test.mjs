import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getWorkspacePackages, getWorkspacePaths } from "./workspace-utils.mjs";

const REQUIRED_WORKSPACES = [
  "client",
  "server",
  "tools/build-assets",
  "packages/shared-schemas",
];

describe("workspace integrity", () => {
  test("root package.json declares required workspaces", () => {
    const workspaces = getWorkspacePaths();
    expect(workspaces).toEqual(REQUIRED_WORKSPACES);
  });

  test("required workspace directories and package.json files exist", () => {
    for (const workspacePath of REQUIRED_WORKSPACES) {
      expect(existsSync(workspacePath)).toBe(true);
      expect(existsSync(join(workspacePath, "package.json"))).toBe(true);
    }
  });

  test("workspace package discovery loads all package configs", () => {
    const packages = getWorkspacePackages();
    expect(packages.length).toBe(REQUIRED_WORKSPACES.length);

    for (const pkg of packages) {
      expect(typeof pkg.config.name).toBe("string");
      expect(pkg.config.name.length).toBeGreaterThan(0);
    }
  });
});
