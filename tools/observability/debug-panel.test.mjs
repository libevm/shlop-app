import { describe, expect, test } from "bun:test";
import {
  DEBUG_CONTROLS,
  DEBUG_PANEL_SECTIONS,
  createDebugPanelController,
  isDebugPanelVisible,
} from "./debug-panel.mjs";

describe("debug panel requirements", () => {
  test("exports required sections and controls", () => {
    expect(DEBUG_PANEL_SECTIONS.length).toBe(5);
    expect(DEBUG_CONTROLS).toContain("map-warp");
    expect(DEBUG_CONTROLS).toContain("packet-simulator");
  });

  test("is visible only in debug mode/build", () => {
    expect(isDebugPanelVisible({ debugMode: true, buildMode: "debug" })).toBe(true);
    expect(isDebugPanelVisible({ debugMode: false, buildMode: "debug" })).toBe(false);
    expect(isDebugPanelVisible({ debugMode: true, buildMode: "production" })).toBe(false);
  });

  test("dispatches controls only when enabled", () => {
    const events = [];
    const enabledController = createDebugPanelController({
      enabled: true,
      onAction: (event) => events.push(event),
    });

    const success = enabledController.dispatch("spawn-mob", { mobId: "9300012" });
    expect(success.ok).toBe(true);
    expect(events.length).toBe(1);
    expect(events[0].controlId).toBe("spawn-mob");

    const disabledController = createDebugPanelController({ enabled: false });
    const blocked = disabledController.dispatch("spawn-mob", { mobId: "9300012" });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("debug-panel-disabled");
  });

  test("rejects unknown controls", () => {
    const controller = createDebugPanelController({ enabled: true });
    const result = controller.dispatch("unknown-control", {});

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unknown-control");
  });
});
