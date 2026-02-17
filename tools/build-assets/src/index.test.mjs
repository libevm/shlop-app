import { describe, expect, test } from "bun:test";
import { getBuildAssetsStatus } from "./index.ts";

describe("build-assets workspace harness", () => {
  test("returns ready status", () => {
    expect(getBuildAssetsStatus()).toBe("build-assets-workspace-ready");
  });
});
