export interface Relationship { a: number; b: number; familiarity: number; lastDay: number }
export const MAX_CONTACTS = 24;

/** A bounded, symmetric acquaintance graph driven only by shared time at a destination. */
export class Relationships {
  private readonly edges = new Map<string, Relationship>();
  private readonly neighbours = new Map<number, Set<number>>();

  meet(groups: ReadonlyMap<number, readonly number[]>, day: number): void {
    for (const people of groups.values()) {
      const sorted = [...new Set(people)].sort((a, b) => a - b);
      // At most two potential conversations per person; never all pairs in a crowded venue.
      for (let index = 0; index < sorted.length; index++) {
        for (let offset = 1; offset <= Math.min(2, sorted.length - 1); offset++) {
          const step = 1 + (offset - 1 + day) % (sorted.length - 1);
          const other = sorted[(index + step) % sorted.length];
          this.encounter(sorted[index], other, day);
        }
      }
    }
  }
  private encounter(first: number, second: number, day: number): void {
    if (first === second) return;
    const a = Math.min(first, second), b = Math.max(first, second);
    const key = `${a}:${b}`;
    const existing = this.edges.get(key);
    if (existing) {
      if (existing.lastDay >= day) return;
      existing.familiarity = Math.min(100, existing.familiarity + 5);
      existing.lastDay = day;
      return;
    }
    if ((this.neighbours.get(a)?.size ?? 0) >= MAX_CONTACTS ||
        (this.neighbours.get(b)?.size ?? 0) >= MAX_CONTACTS) return;
    this.edges.set(key, { a, b, familiarity: 5, lastDay: day });
    for (const [self, other] of [[a, b], [b, a]]) {
      if (!this.neighbours.has(self)) this.neighbours.set(self, new Set());
      this.neighbours.get(self)!.add(other);
    }
  }
  contacts(id: number) {
    return [...(this.neighbours.get(id) ?? [])].map(other => {
      const edge = this.edges.get(`${Math.min(id, other)}:${Math.max(id, other)}`)!;
      return { id: other, familiarity: edge.familiarity,
        label: edge.familiarity >= 60 ? '好友' : edge.familiarity >= 25 ? '朋友' : '認識的人' };
    }).sort((a, b) => b.familiarity - a.familiarity || a.id - b.id);
  }
  retain(ids: ReadonlySet<number>): void {
    for (const [key, edge] of this.edges) {
      if (ids.has(edge.a) && ids.has(edge.b)) continue;
      this.edges.delete(key);
      this.neighbours.get(edge.a)?.delete(edge.b);
      this.neighbours.get(edge.b)?.delete(edge.a);
    }
    for (const id of this.neighbours.keys()) if (!ids.has(id)) this.neighbours.delete(id);
  }
  save(): Relationship[] { return [...this.edges.values()].map(edge => ({ ...edge })); }
  load(edges: readonly Relationship[]): void {
    this.edges.clear(); this.neighbours.clear();
    for (const edge of edges) {
      this.encounter(edge.a, edge.b, edge.lastDay);
      const stored = this.edges.get(`${edge.a}:${edge.b}`);
      if (stored) Object.assign(stored, edge);
    }
  }
}
