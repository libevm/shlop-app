import { describe, expect, test } from "bun:test";
import { EntityPool, EntityPoolRegistry } from "./entity-pool.ts";

describe("EntityPool", () => {
  test("supports add/update/remove lifecycle", () => {
    const pool = new EntityPool();

    pool.add({ id: "mob-1", hp: 100 });
    expect(pool.size()).toBe(1);

    pool.update("mob-1", (entity) => ({ ...entity, hp: 80 }));
    expect(pool.get("mob-1")?.hp).toBe(80);

    const removed = pool.remove("mob-1");
    expect(removed).toBe(true);
    expect(pool.size()).toBe(0);
  });

  test("rejects duplicate IDs", () => {
    const pool = new EntityPool();
    pool.add({ id: "npc-1", name: "Grendel" });

    expect(() => pool.add({ id: "npc-1", name: "Athena" })).toThrow();
  });

  test("rejects update that changes ID", () => {
    const pool = new EntityPool();
    pool.add({ id: "drop-1", amount: 10 });

    expect(() => pool.update("drop-1", () => ({ id: "drop-2", amount: 11 }))).toThrow();
  });
});

describe("EntityPoolRegistry", () => {
  test("reports diagnostics across pools", () => {
    const registry = new EntityPoolRegistry();

    const mobs = registry.registerPool("mobs");
    const players = registry.registerPool("players");

    mobs.add({ id: "mob-1" });
    mobs.add({ id: "mob-2" });
    players.add({ id: "player-1" });

    const diagnostics = registry.diagnostics();
    expect(diagnostics.totalEntities).toBe(3);
    expect(diagnostics.poolCounts.mobs).toBe(2);
    expect(diagnostics.poolCounts.players).toBe(1);
  });

  test("stays clean under repeated spawn/clear cycles", () => {
    const registry = new EntityPoolRegistry();
    const mobs = registry.registerPool("mobs");

    for (let cycle = 0; cycle < 50; cycle += 1) {
      for (let i = 0; i < 20; i += 1) {
        mobs.upsert({ id: `mob-${cycle}-${i}` });
      }
      mobs.clear();
    }

    const diagnostics = registry.diagnostics();
    expect(diagnostics.totalEntities).toBe(0);
  });
});
