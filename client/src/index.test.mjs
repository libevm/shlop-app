import { describe, expect, test } from "bun:test";
import { getClientStatus } from "./index.ts";

describe("client workspace harness", () => {
  test("returns ready status", () => {
    expect(getClientStatus()).toBe("client-workspace-ready");
  });
});
