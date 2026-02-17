export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error"];

export const REQUIRED_LOG_FIELDS = [
  "timestamp",
  "level",
  "component",
  "event",
  "entityType",
  "entityId",
  "mapId",
  "requestId",
];

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

export function isValidLogLevel(level) {
  return LOG_LEVELS.includes(level);
}

export function createLogEntry(input) {
  if (!input || typeof input !== "object") {
    throw new Error("log input must be an object");
  }

  const {
    level,
    component,
    event,
    message = "",
    entityType = null,
    entityId = null,
    mapId = null,
    requestId = null,
    timestamp,
  } = input;

  if (!isValidLogLevel(level)) {
    throw new Error(`Invalid log level: ${String(level)}`);
  }

  assertNonEmptyString(component, "component");
  assertNonEmptyString(event, "event");

  const entry = {
    timestamp:
      typeof timestamp === "string" && timestamp.length > 0
        ? timestamp
        : new Date().toISOString(),
    level,
    component,
    event,
    entityType,
    entityId,
    mapId,
    requestId,
    message,
  };

  return entry;
}

export function formatStructuredLog(entry) {
  return JSON.stringify(entry);
}
