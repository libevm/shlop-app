import { describe, expect, test } from "bun:test";
import { parseDebugFlags } from "./debug-flags.mjs";

describe("parseDebugFlags", () => {
  test("returns safe defaults", () => {
    const flags = parseDebugFlags({});

    expect(flags.debugMode).toBe(false);
    expect(flags.logLevel).toBe("info");
    expect(flags.client.verboseAssets).toBe(false);
    expect(flags.server.verboseNetwork).toBe(false);
    expect(flags.tools.simulatedLatencyMs).toBe(0);
  });

  test("parses valid explicit values", () => {
    const flags = parseDebugFlags({
      DEBUG_MODE: "true",
      DEBUG_LOG_LEVEL: "debug",
      CLIENT_DEBUG_VERBOSE_ASSETS: "1",
      CLIENT_DEBUG_VERBOSE_NETWORK: "true",
      CLIENT_DEBUG_SIMULATED_LATENCY_MS: "125",
      SERVER_DEBUG_VERBOSE_NETWORK: "yes",
      TOOLS_DEBUG_SIMULATED_LATENCY_MS: "250",
    });

    expect(flags.debugMode).toBe(true);
    expect(flags.logLevel).toBe("debug");
    expect(flags.client.verboseAssets).toBe(true);
    expect(flags.client.verboseNetwork).toBe(true);
    expect(flags.client.simulatedLatencyMs).toBe(125);
    expect(flags.server.verboseNetwork).toBe(true);
    expect(flags.tools.simulatedLatencyMs).toBe(250);
  });

  test("sanitizes invalid values", () => {
    const flags = parseDebugFlags({
      DEBUG_MODE: "maybe",
      DEBUG_LOG_LEVEL: "fatal",
      CLIENT_DEBUG_SIMULATED_LATENCY_MS: "-40",
      SERVER_DEBUG_SIMULATED_LATENCY_MS: "abc",
    });

    expect(flags.debugMode).toBe(false);
    expect(flags.logLevel).toBe("info");
    expect(flags.client.simulatedLatencyMs).toBe(0);
    expect(flags.server.simulatedLatencyMs).toBe(0);
  });
});
