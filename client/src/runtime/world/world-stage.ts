export interface WorldUpdateContext {
  frame: number;
  deltaMs: number;
}

export interface WorldDrawContext {
  frame: number;
  alpha: number;
}

export interface WorldSubsystem {
  id: string;
  order: number;
  update?: (ctx: WorldUpdateContext) => void;
  draw?: (ctx: WorldDrawContext) => void;
}

export interface WorldTraceEvent {
  phase: "update" | "draw";
  subsystemId: string;
  frame: number;
}

export const DEFAULT_WORLD_SUBSYSTEM_ORDER: Array<{ id: string; order: number }> = [
  { id: "map-backgrounds", order: 10 },
  { id: "map-tiles-objects", order: 20 },
  { id: "entities-npcs", order: 30 },
  { id: "entities-mobs", order: 40 },
  { id: "entities-players", order: 50 },
  { id: "entities-drops", order: 60 },
  { id: "combat", order: 70 },
  { id: "effects", order: 80 },
  { id: "portals", order: 90 },
  { id: "ui-overlay", order: 100 },
];

export class WorldStage {
  private readonly subsystems = new Map<string, WorldSubsystem>();

  private readonly trace: WorldTraceEvent[] = [];

  registerSubsystem(subsystem: WorldSubsystem): void {
    if (this.subsystems.has(subsystem.id)) {
      throw new Error(`Subsystem already registered: ${subsystem.id}`);
    }

    this.subsystems.set(subsystem.id, subsystem);
  }

  unregisterSubsystem(subsystemId: string): void {
    this.subsystems.delete(subsystemId);
  }

  getOrderedSubsystems(): WorldSubsystem[] {
    return [...this.subsystems.values()].sort((a, b) => {
      if (a.order === b.order) {
        return a.id.localeCompare(b.id);
      }
      return a.order - b.order;
    });
  }

  update(ctx: WorldUpdateContext): void {
    for (const subsystem of this.getOrderedSubsystems()) {
      subsystem.update?.(ctx);
      this.pushTrace({ phase: "update", subsystemId: subsystem.id, frame: ctx.frame });
    }
  }

  draw(ctx: WorldDrawContext): void {
    for (const subsystem of this.getOrderedSubsystems()) {
      subsystem.draw?.(ctx);
      this.pushTrace({ phase: "draw", subsystemId: subsystem.id, frame: ctx.frame });
    }
  }

  getTrace(limit = 200): WorldTraceEvent[] {
    if (limit <= 0) return [];
    return this.trace.slice(-limit);
  }

  private pushTrace(event: WorldTraceEvent): void {
    this.trace.push(event);

    if (this.trace.length > 1000) {
      this.trace.splice(0, this.trace.length - 1000);
    }
  }
}

export function createDefaultWorldStageScaffold(): WorldStage {
  const stage = new WorldStage();

  for (const template of DEFAULT_WORLD_SUBSYSTEM_ORDER) {
    stage.registerSubsystem({
      id: template.id,
      order: template.order,
      update: () => {},
      draw: () => {},
    });
  }

  return stage;
}
