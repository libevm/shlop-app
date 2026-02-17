import { describe, expect, test } from "bun:test";
import {
  REQUIRED_PACKAGE_SCRIPTS,
  getRootConfig,
  getWorkspacePackages,
  missingScripts,
} from "./workspace-utils.mjs";

describe("workspace script standardization", () => {
  test("all workspace packages define standard scripts", () => {
    const packages = getWorkspacePackages();

    for (const pkg of packages) {
      const missing = missingScripts(pkg.config, REQUIRED_PACKAGE_SCRIPTS);
      expect(missing).toEqual([]);
    }
  });

  test("root scripts orchestrate package scripts", () => {
    const root = getRootConfig();
    for (const scriptName of REQUIRED_PACKAGE_SCRIPTS) {
      const script = root.scripts?.[scriptName];
      expect(typeof script).toBe("string");
      expect(script).toContain("tools/workspace/run-workspace-script.mjs");
      expect(script).toContain(scriptName);
    }
  });
});
