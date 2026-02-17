export interface EntityWithId {
  id: string;
}

export class EntityPool<T extends EntityWithId> {
  private readonly entities = new Map<string, T>();

  add(entity: T): void {
    if (this.entities.has(entity.id)) {
      throw new Error(`Duplicate entity id: ${entity.id}`);
    }
    this.entities.set(entity.id, entity);
  }

  upsert(entity: T): void {
    this.entities.set(entity.id, entity);
  }

  update(id: string, updater: (existing: T) => T): void {
    const existing = this.entities.get(id);
    if (!existing) {
      throw new Error(`Entity not found: ${id}`);
    }

    const updated = updater(existing);
    if (updated.id !== id) {
      throw new Error("Entity ID cannot be changed during update");
    }

    this.entities.set(id, updated);
  }

  get(id: string): T | undefined {
    return this.entities.get(id);
  }

  has(id: string): boolean {
    return this.entities.has(id);
  }

  remove(id: string): boolean {
    return this.entities.delete(id);
  }

  clear(): void {
    this.entities.clear();
  }

  values(): T[] {
    return [...this.entities.values()];
  }

  size(): number {
    return this.entities.size;
  }
}

export class EntityPoolRegistry {
  private readonly pools = new Map<string, EntityPool<EntityWithId>>();

  registerPool(name: string): EntityPool<EntityWithId> {
    if (this.pools.has(name)) {
      throw new Error(`Pool already registered: ${name}`);
    }

    const pool = new EntityPool<EntityWithId>();
    this.pools.set(name, pool);
    return pool;
  }

  getPool(name: string): EntityPool<EntityWithId> {
    const pool = this.pools.get(name);
    if (!pool) {
      throw new Error(`Pool not found: ${name}`);
    }
    return pool;
  }

  diagnostics(): { poolCounts: Record<string, number>; totalEntities: number } {
    const poolCounts: Record<string, number> = {};
    let totalEntities = 0;

    for (const [name, pool] of this.pools.entries()) {
      const count = pool.size();
      poolCounts[name] = count;
      totalEntities += count;
    }

    return { poolCounts, totalEntities };
  }
}
