export const DEBUG_PANEL_SECTIONS = [
  "map-info",
  "entity-counts",
  "memory-cache-stats",
  "network-stats",
  "last-api-errors",
];

export const DEBUG_CONTROLS = [
  "map-warp",
  "spawn-mob",
  "spawn-npc",
  "clear-entities",
  "reload-map-sections",
  "audio-test",
  "packet-simulator",
];

export function isDebugPanelVisible({ debugMode, buildMode }) {
  return debugMode === true && buildMode === "debug";
}

export function createDebugPanelController({ enabled, onAction }) {
  return {
    dispatch(controlId, payload = {}) {
      if (!enabled) {
        return { ok: false, reason: "debug-panel-disabled" };
      }

      if (!DEBUG_CONTROLS.includes(controlId)) {
        return { ok: false, reason: "unknown-control" };
      }

      const event = {
        controlId,
        payload,
        timestamp: new Date().toISOString(),
      };

      if (typeof onAction === "function") {
        onAction(event);
      }

      return { ok: true, event };
    },
  };
}
