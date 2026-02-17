import { CombatOrchestrator } from "./combat/combat-orchestrator";
import { EntityPoolRegistry } from "./entities/entity-pool";
import { createDefaultWorldStageScaffold } from "./world/world-stage";

const stage = createDefaultWorldStageScaffold();
stage.update({ frame: 1, deltaMs: 16.67 });
stage.draw({ frame: 1, alpha: 0.8 });

const pools = new EntityPoolRegistry();
const mobs = pools.registerPool("mobs");
const players = pools.registerPool("players");
mobs.add({ id: "mob-1" });
players.add({ id: "player-1" });

const combat = new CombatOrchestrator();
combat.queueAttack({
  attackerId: "player-1",
  targetIds: ["mob-1"],
  issuedAtMs: 1000,
  hitDelayMs: 120,
  cooldownMs: 300,
  baseDamage: 42,
  kind: "melee",
  actionId: "debug-smoke-hit",
});

const hits = combat.update(1200);

console.info("[phase6-debug] stageTraceCount", stage.getTrace().length);
console.info("[phase6-debug] poolDiagnostics", pools.diagnostics());
console.info("[phase6-debug] hits", hits);
console.info("[phase6-debug] timeline", combat.getTimeline());
