import { calendar } from './calendar';
import { YEAR_TICKS, type ResidentIdentity } from './ResidentIdentity';
import { legacyGender } from './ResidentGender';

const DAY = calendar.ticksPerDay;
export interface LifeChild { identity: ResidentIdentity; home: number; guardians: number[] }
export interface HealthRecord { id: number; since: number; until: number; state: 'ill' | 'recovering'; severe: boolean }
export interface LifeEvent { tick: number; person: number; name: string; kind: 'birth' | 'adult' | 'retired' | 'ill' | 'recovered' | 'death' | 'care'; home: number }
export interface BirthPlan { home: number; parents: number[]; due: number }
export interface LifeSave {
  children: LifeChild[];
  health: HealthRecord[];
  events: LifeEvent[];
  retired: number[];
  families: number[];
  births: BirthPlan[];
}
export interface LifeResident { identity: ResidentIdentity; home: number; age: number }
export const EMPTY_LIFE = (): LifeSave => ({ children: [], health: [], events: [], retired: [], families: [], births: [] });
const roll = (seed: number, day: number, person: number, salt: number) => {
  let n = Math.imul(seed ^ Math.imul(day, 0x9e3779b1) ^ Math.imul(person + salt, 0x85ebca6b), 0xc2b2ae35);
  n = Math.imul(n ^ n >>> 15, 0x27d4eb2f);
  return ((n ^ n >>> 13) >>> 0) / 2 ** 32;
};

/** Life events have persistent identity. Daily updates never depend on the camera or UI. */
export class LifeSystem {
  private state: LifeSave = EMPTY_LIFE();
  private byHome = new Map<number, LifeChild[]>();
  private byHealth = new Map<number, HealthRecord>();
  private familyIds = new Set<number>();
  private retiredIds = new Set<number>();

  private index(): void {
    this.byHome.clear();
    for (const child of this.state.children) {
      if (!this.byHome.has(child.home)) this.byHome.set(child.home, []);
      this.byHome.get(child.home)!.push(child);
    }
    this.byHealth = new Map(this.state.health.map(record => [record.id, record]));
    this.familyIds = new Set(this.state.families);
    this.retiredIds = new Set(this.state.retired);
  }
  childrenAt(home: number, tick: number) {
    return (this.byHome.get(home) ?? []).map(child => ({ id: child.identity.id, name: child.identity.name,
      age: Math.max(0, Math.floor((tick - child.identity.born) / YEAR_TICKS)) }));
  }
  get children(): readonly LifeChild[] { return this.state.children; }
  get events(): readonly LifeEvent[] { return this.state.events; }
  health(id: number): HealthRecord | undefined { return this.byHealth.get(id); }
  hasFamily(home: number): boolean { return this.familyIds.has(home); }

  /** One-time conversion of the children displayed by legacy homes. */
  establish(home: number, children: LifeChild[]): void {
    if (this.familyIds.has(home)) return;
    this.state.families.push(home);
    this.state.children.push(...children);
    this.index();
  }
  private tell(event: LifeEvent): void {
    this.state.events.push(event);
    if (this.state.events.length > 100) this.state.events.shift();
  }
  fallIll(person: LifeResident, tick: number, severe = false): void {
    if (this.byHealth.has(person.identity.id)) return;
    const record: HealthRecord = { id: person.identity.id, since: tick, until: tick + (severe ? 30 : 7) * DAY,
      state: 'ill', severe };
    this.state.health.push(record); this.byHealth.set(record.id, record);
    this.tell({ tick, person: record.id, name: person.identity.name, home: person.home, kind: 'ill' });
  }
  treat(id: number, tick: number, hospital: boolean): void {
    const record = this.byHealth.get(id);
    if (!record || record.state !== 'ill' || (record.severe && !hospital)) return;
    record.state = 'recovering';
    record.until = tick + (record.severe ? 5 : 2) * DAY;
  }

  advance(tick: number, seed: number, residents: readonly LifeResident[], options: {
    allocateId: () => number;
    freeRoom: (home: number) => number;
    friends: (a: number, b: number) => boolean;
    polluted: (home: number) => boolean;
    caredFor?: (home: number) => boolean;
  }): { adults: LifeChild[]; deaths: number[] } {
    const day = Math.floor(tick / DAY);
    const live = new Map(residents.map(person => [person.identity.id, person]));
    const homes = new Map<number, LifeResident[]>();
    for (const resident of residents) {
      if (!homes.has(resident.home)) homes.set(resident.home, []);
      homes.get(resident.home)!.push(resident);
    }
    const deaths: number[] = [];
    const adults: LifeChild[] = [];
    for (const person of residents) {
      const id = person.identity.id;
      if (person.age >= 65 && !this.retiredIds.has(id)) {
        this.retiredIds.add(id); this.state.retired.push(id);
        this.tell({ tick, person: id, name: person.identity.name, home: person.home, kind: 'retired' });
      }
      const health = this.byHealth.get(id);
      if (health && tick >= health.until && (!health.severe || health.state === 'recovering')) {
        this.byHealth.delete(id);
        this.tell({ tick, person: id, name: person.identity.name, home: person.home, kind: 'recovered' });
      }
      const risk = person.age < 75 ? 0 : 0.0005 + (person.age - 75) * 0.00015;
      const untreated = health?.state === 'ill' && health.severe && tick >= health.until && person.age >= 65 ? 0.002 : 0;
      if (person.age >= 110 || roll(seed, day, id, 201) < risk + untreated) {
        deaths.push(id); live.delete(id); this.byHealth.delete(id);
        this.tell({ tick, person: id, name: person.identity.name, home: person.home, kind: 'death' });
      } else if (residents.length >= 100 && !health &&
          roll(seed, day, id, 202) < 0.0002 * (person.age >= 65 ? options.caredFor?.(person.home) ? 1.5 : 3 : 1) * (options.polluted(person.home) ? 2 : 1)) {
        this.fallIll(person, tick, roll(seed, day, id, 203) < 0.15);
      }
    }
    const reserved = new Map<number, number>();
    for (const child of this.state.children) {
      child.guardians = child.guardians.filter(id => live.has(id));
      if (!child.guardians.length) {
        const previousHome = child.home;
        const guardian = residents.find(person => live.has(person.identity.id) &&
          person.age >= 18 && options.freeRoom(person.home) > (reserved.get(person.home) ?? 0));
        if (guardian) {
          child.guardians = [guardian.identity.id]; child.home = guardian.home;
          reserved.set(child.home, (reserved.get(child.home) ?? 0) + 1);
        }
        else child.home = -1; // Explicit outside care, rather than silently deleting a child.
        if (child.home !== previousHome) this.tell({ tick, person: child.identity.id, name: child.identity.name, home: child.home, kind: 'care' });
      } else {
        child.home = live.get(child.guardians[0])!.home;
      }
      if (tick - child.identity.born >= 18 * YEAR_TICKS) {
        if (child.home >= 0) adults.push(child);
        this.tell({ tick, person: child.identity.id, name: child.identity.name, home: child.home, kind: 'adult' });
      }
    }
    this.state.children = this.state.children.filter(child => tick - child.identity.born < 18 * YEAR_TICKS);
    // A birth requires an established close relationship, willingness and housing. Sharing a home alone is insufficient.
    if (day % calendar.daysPerMonth === 0) for (const [home, members] of homes) {
      if (this.state.births.some(plan => plan.home === home) || options.freeRoom(home) <= 0 ||
          (this.byHome.get(home)?.length ?? 0) >= 2) continue;
      const parents = members.filter(person => person.age >= 20 && person.age <= 45 && live.has(person.identity.id));
      if (parents.length < 2) continue;
      const a = parents[0], b = parents.find(other => other !== a && options.friends(a.identity.id, other.identity.id));
      if (!b || roll(seed, day, a.identity.id, 204) >= 0.03) continue;
      this.state.births.push({ home, parents: [a.identity.id, b.identity.id], due: tick + 270 * DAY });
    }
    this.state.births = this.state.births.filter(plan => {
      if (!plan.parents.every(id => live.get(id)?.home === plan.home)) return false;
      if (tick < plan.due) return true;
      if (options.freeRoom(plan.home) <= (reserved.get(plan.home) ?? 0)) return false;
      const id = options.allocateId();
      const surname = live.get(plan.parents[0])!.identity.name[0];
      const name = surname + ['安安', '樂樂', '恩恩', '小宇', '彤彤', '小華'][id % 6];
      this.state.children.push({ home: plan.home, guardians: [...plan.parents], identity: { id, name, born: tick, gender: legacyGender(id) } });
      reserved.set(plan.home, (reserved.get(plan.home) ?? 0) + 1);
      this.tell({ tick, person: id, name, home: plan.home, kind: 'birth' });
      return false;
    });
    this.state.health = [...this.byHealth.values()].filter(record => live.has(record.id));
    this.state.retired = this.state.retired.filter(id => live.has(id));
    // Families are bounded by map cells; remember empty lots so legacy children are never generated twice.
    this.index();
    return { adults, deaths };
  }
  save(): LifeSave {
    return { children: this.state.children.map(child => ({ ...child, identity: { ...child.identity }, guardians: [...child.guardians] })),
      health: this.state.health.map(item => ({ ...item })), events: this.state.events.map(item => ({ ...item })),
      retired: [...this.state.retired], families: [...this.state.families],
      births: this.state.births.map(plan => ({ ...plan, parents: [...plan.parents] })) };
  }
  load(state: LifeSave): void { this.state = state; this.state = this.save(); this.index(); }
}
