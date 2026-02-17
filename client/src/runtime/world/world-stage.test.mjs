import { describe, expect, test } from "bun:test";
import { DEFAULT_WORLD_SUBSYSTEM_ORDER, WorldStage, createDefaultWorldStageScaffold } from "./world-stage.ts";

describe("WorldStage", () => {
  test("runs update/draw in deterministic order", () => {
    const calls = [];
    const stage = new WorldStage();

    stage.registerSubsystem({
      id: "late",
      order: 50,
      update: () => calls.push("update:late"),
      draw: () => calls.push("draw:late"),
    });

    stage.registerSubsystem({
      id: "early",
      order: 10,
      update: () => calls.push("update:early"),
      draw: () => calls.push("draw:early"),
    });

    stage.update({ frame: 1, deltaMs: 16.67 });
    stage.draw({ frame: 1, alpha: 0.5 });

    expect(calls).toEqual(["update:early", "update:late", "draw:early", "draw:late"]);
  });

  test("records stage trace events", () => {
    const stage = createDefaultWorldStageScaffold();

    stage.update({ frame: 2, deltaMs: 16.67 });
    stage.draw({ frame: 2, alpha: 0.75 });

    const trace = stage.getTrace();
    expect(trace.length).toBe(DEFAULT_WORLD_SUBSYSTEM_ORDER.length * 2);
    expect(trace[0].phase).toBe("update");
    expect(trace.at(-1)?.phase).toBe("draw");
  });

  test("rejects duplicate subsystem registration", () => {
    const stage = new WorldStage();
    stage.registerSubsystem({ id: "combat", order: 10 });

    expect(() => stage.registerSubsystem({ id: "combat", order: 20 })).toThrow();
  });
});
