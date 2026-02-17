import { LOG_LEVELS } from "./logging.mjs";

function parseBoolean(value, fallback = false) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNonNegativeInt(value, fallback = 0) {
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return fallback;
  return Math.max(0, parsed);
}

function parseLogLevel(value, fallback = "info") {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return LOG_LEVELS.includes(normalized) ? normalized : fallback;
}

function parseScope(env, scope) {
  const prefix = `${scope}_DEBUG_`;
  return {
    verboseAssets: parseBoolean(env[`${prefix}VERBOSE_ASSETS`], false),
    verboseNetwork: parseBoolean(env[`${prefix}VERBOSE_NETWORK`], false),
    simulatedLatencyMs: parseNonNegativeInt(env[`${prefix}SIMULATED_LATENCY_MS`], 0),
  };
}

export function parseDebugFlags(env = process.env) {
  return {
    debugMode: parseBoolean(env.DEBUG_MODE, false),
    logLevel: parseLogLevel(env.DEBUG_LOG_LEVEL, "info"),
    client: parseScope(env, "CLIENT"),
    server: parseScope(env, "SERVER"),
    tools: parseScope(env, "TOOLS"),
  };
}
