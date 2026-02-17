import { describe, expect, test } from "bun:test";
import { CombatOrchestrator } from "./combat-orchestrator.ts";

describe("CombatOrchestrator", () => {
  test("queues attack and resolves hits at hit window", () => {
    const combat = new CombatOrchestrator();

    const queued = combat.queueAttack({
      attackerId: "player-1",
      targetIds: ["mob-1", "mob-2"],
      issuedAtMs: 1000,
      hitDelayMs: 120,
      cooldownMs: 250,
      baseDamage: 55,
      kind: "melee",
      actionId: "attack-1",
    });

    expect(queued.accepted).toBe(true);
    expect(combat.getPendingHitCount()).toBe(2);

    const earlyHits = combat.update(1110);
    expect(earlyHits.length).toBe(0);

    const hits = combat.update(1120);
    expect(hits.length).toBe(2);
    expect(hits[0].damage).toBe(55);
    expect(combat.getPendingHitCount()).toBe(0);
  });

  test("rejects attack while cooldown is active", () => {
    const combat = new CombatOrchestrator();

    const first = combat.queueAttack({
      attackerId: "player-1",
      targetIds: ["mob-1"],
      issuedAtMs: 1000,
      hitDelayMs: 50,
      cooldownMs: 300,
      baseDamage: 20,
      kind: "melee",
    });
    expect(first.accepted).toBe(true);

    const rejected = combat.queueAttack({
      attackerId: "player-1",
      targetIds: ["mob-2"],
      issuedAtMs: 1200,
      hitDelayMs: 50,
      cooldownMs: 300,
      baseDamage: 20,
      kind: "ranged",
    });

    expect(rejected.accepted).toBe(false);
    expect(rejected.reason).toBe("cooldown-active");
  });

  test("emits timeline events for queue/hit/reject", () => {
    const combat = new CombatOrchestrator();

    combat.queueAttack({
      attackerId: "player-1",
      targetIds: ["mob-1"],
      issuedAtMs: 1000,
      hitDelayMs: 50,
      cooldownMs: 300,
      baseDamage: 20,
      kind: "melee",
      actionId: "timeline-attack",
    });

    combat.queueAttack({
      attackerId: "player-1",
      targetIds: ["mob-2"],
      issuedAtMs: 1100,
      hitDelayMs: 50,
      cooldownMs: 300,
      baseDamage: 20,
      kind: "melee",
      actionId: "timeline-reject",
    });

    combat.update(2000);

    const timeline = combat.getTimeline();
    expect(timeline.some((event) => event.type === "queued")).toBe(true);
    expect(timeline.some((event) => event.type === "hit")).toBe(true);
    expect(timeline.some((event) => event.type === "rejected-cooldown")).toBe(true);
  });
});
