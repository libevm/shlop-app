import { describe, expect, test } from "bun:test";
import {
  REQUIRED_LOG_FIELDS,
  createLogEntry,
  formatStructuredLog,
  isValidLogLevel,
} from "./logging.mjs";

describe("logging conventions", () => {
  test("accepts standardized log levels", () => {
    expect(isValidLogLevel("trace")).toBe(true);
    expect(isValidLogLevel("debug")).toBe(true);
    expect(isValidLogLevel("info")).toBe(true);
    expect(isValidLogLevel("warn")).toBe(true);
    expect(isValidLogLevel("error")).toBe(true);
    expect(isValidLogLevel("fatal")).toBe(false);
  });

  test("creates structured log entry with required fields", () => {
    const entry = createLogEntry({
      level: "info",
      component: "server.asset-api",
      event: "asset.fetch.success",
      entityType: "map",
      entityId: "100000000",
      mapId: "100000000",
      requestId: "req-123",
      message: "Fetched map root document",
    });

    for (const field of REQUIRED_LOG_FIELDS) {
      expect(Object.hasOwn(entry, field)).toBe(true);
    }

    expect(entry.level).toBe("info");
    expect(entry.component).toBe("server.asset-api");
    expect(typeof entry.timestamp).toBe("string");
  });

  test("rejects invalid payloads", () => {
    expect(() =>
      createLogEntry({
        level: "fatal",
        component: "client.map",
        event: "map.load",
      }),
    ).toThrow();

    expect(() =>
      createLogEntry({
        level: "info",
        component: "",
        event: "map.load",
      }),
    ).toThrow();
  });

  test("formats log entry as JSON", () => {
    const entry = createLogEntry({
      level: "debug",
      component: "tools.pipeline",
      event: "scanner.progress",
    });

    const serialized = formatStructuredLog(entry);
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});
