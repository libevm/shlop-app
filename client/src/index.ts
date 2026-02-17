export const CLIENT_PACKAGE_NAME = "@maple/client";

export { CombatOrchestrator } from "./runtime/combat/combat-orchestrator";
export { EntityPool, EntityPoolRegistry } from "./runtime/entities/entity-pool";
export { DEFAULT_WORLD_SUBSYSTEM_ORDER, WorldStage, createDefaultWorldStageScaffold } from "./runtime/world/world-stage";

export function getClientStatus() {
  return "client-workspace-ready";
}
