import { describe, expect, test } from "bun:test";
import { getServerStatus } from "./index.ts";

describe("server workspace harness", () => {
  test("returns ready status", () => {
    expect(getServerStatus()).toBe("server-workspace-ready");
  });
});
