export interface AttackCommand {
  attackerId: string;
  targetIds: string[];
  issuedAtMs: number;
  hitDelayMs: number;
  cooldownMs: number;
  baseDamage: number;
  kind: "melee" | "ranged";
  actionId?: string;
}

export interface DamageEvent {
  timestampMs: number;
  attackerId: string;
  targetId: string;
  damage: number;
  kind: "melee" | "ranged";
  actionId?: string;
}

export interface CombatTimelineEvent {
  type: "queued" | "hit" | "rejected-cooldown";
  timestampMs: number;
  attackerId: string;
  actionId?: string;
  targetId?: string;
  detail?: string;
}

interface PendingHit {
  dueAtMs: number;
  event: DamageEvent;
}

export class CombatOrchestrator {
  private readonly cooldownUntilByAttacker = new Map<string, number>();

  private readonly pendingHits: PendingHit[] = [];

  private readonly timeline: CombatTimelineEvent[] = [];

  queueAttack(command: AttackCommand): { accepted: true } | { accepted: false; reason: string } {
    const cooldownUntil = this.cooldownUntilByAttacker.get(command.attackerId) ?? 0;
    if (command.issuedAtMs < cooldownUntil) {
      this.pushTimeline({
        type: "rejected-cooldown",
        timestampMs: command.issuedAtMs,
        attackerId: command.attackerId,
        actionId: command.actionId,
        detail: `cooldownUntil=${cooldownUntil}`,
      });
      return { accepted: false, reason: "cooldown-active" };
    }

    this.cooldownUntilByAttacker.set(command.attackerId, command.issuedAtMs + command.cooldownMs);

    for (const targetId of command.targetIds) {
      this.pendingHits.push({
        dueAtMs: command.issuedAtMs + command.hitDelayMs,
        event: {
          timestampMs: command.issuedAtMs + command.hitDelayMs,
          attackerId: command.attackerId,
          targetId,
          damage: command.baseDamage,
          kind: command.kind,
          actionId: command.actionId,
        },
      });
    }

    this.pushTimeline({
      type: "queued",
      timestampMs: command.issuedAtMs,
      attackerId: command.attackerId,
      actionId: command.actionId,
      detail: `targets=${command.targetIds.length}`,
    });

    return { accepted: true };
  }

  update(nowMs: number, onDamage?: (event: DamageEvent) => void): DamageEvent[] {
    this.pendingHits.sort((a, b) => a.dueAtMs - b.dueAtMs);

    const ready: DamageEvent[] = [];
    const stillPending: PendingHit[] = [];

    for (const pending of this.pendingHits) {
      if (pending.dueAtMs <= nowMs) {
        ready.push(pending.event);
        continue;
      }
      stillPending.push(pending);
    }

    this.pendingHits.length = 0;
    this.pendingHits.push(...stillPending);

    for (const damageEvent of ready) {
      this.pushTimeline({
        type: "hit",
        timestampMs: nowMs,
        attackerId: damageEvent.attackerId,
        targetId: damageEvent.targetId,
        actionId: damageEvent.actionId,
      });
      onDamage?.(damageEvent);
    }

    return ready;
  }

  getPendingHitCount(): number {
    return this.pendingHits.length;
  }

  getTimeline(limit = 200): CombatTimelineEvent[] {
    return this.timeline.slice(-limit);
  }

  private pushTimeline(event: CombatTimelineEvent): void {
    this.timeline.push(event);
    if (this.timeline.length > 1000) {
      this.timeline.splice(0, this.timeline.length - 1000);
    }
  }
}
