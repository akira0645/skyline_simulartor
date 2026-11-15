import { calendar } from './calendar';
import type { Doing } from './Mind';
import type { FacilityVisit, ActiveVisit } from './VisitSystem';
import { MAP_SIZE } from './TileMap';

export const visitReasons = {
  school: '接送孩子上學', childcare: '接送需要照顧的孩子', medical: '身體不舒服，需要就醫',
  checkup: '安排健康檢查', supplies: '採買生活用品', errands: '處理銀行事務',
  social: '想認識鄰居、一起活動', care: '參加長者照護活動', study: '安排閱讀或學習',
  outdoor: '到戶外走走', leisure: '安排休閒活動', indoor: '下雨，選擇室內活動',
  hungry: '肚子餓了，這一餐想在外面吃', lonely: '好幾天沒跟人來往，想找人聊聊',
  groceries: '習慣自己煮，去買菜', delivery: '這一餐叫外送，在家吃', sidejob: '有空的時候兼職送餐，多賺一點',
  bread: '買剛出爐的麵包', flowers: '買束花回家擺', birthday: '家裡今天有人生日，買蛋糕慶祝', treat: '想吃點甜的',
} as const;
export type VisitReason = keyof typeof visitReasons;
export interface ActivityEntry {
  person: number; doing: Doing; destination: number; started: number; arrived?: number; reason: VisitReason;
}
export const activityDay = (tick: number) => Math.floor(tick / calendar.ticksPerDay + calendar.startHour / 24);
const NONE: number[] = [];
export class ActivityDiary {
  private readonly entries = new Map<number, ActivityEntry[]>();
  retain(tick: number, residents: ReadonlySet<number>): void {
    for (const [id, entries] of this.entries) {
      const today = entries.filter(entry => activityDay(entry.started) === activityDay(tick));
      if (!residents.has(id) || !today.length) this.entries.delete(id);
      else this.entries.set(id, today);
    }
  }
  today(person: number, tick: number): readonly ActivityEntry[] {
    return (this.entries.get(person) ?? []).filter(entry => activityDay(entry.started) === activityDay(tick));
  }
  has(person: number, doing: Doing, tick: number): boolean {
    // Asked for every resident and every kind of outing each hour, so it makes no lists.
    const entries = this.entries.get(person);
    if (!entries) return false;
    const day = activityDay(tick);
    for (const entry of entries) if (entry.doing === doing && activityDay(entry.started) === day) return true;
    return false;
  }
  /** The hours of today at which someone set out for, or reached, one of the given kinds of outing. */
  hoursOf(person: number, tick: number, kinds: readonly Doing[], hourOf: (tick: number) => number): number[] {
    const entries = this.entries.get(person);
    if (!entries) return NONE;
    let hours = NONE;
    const day = activityDay(tick);
    for (const entry of entries) {
      if (!kinds.includes(entry.doing) || activityDay(entry.started) !== day) continue;
      if (hours === NONE) hours = [];
      hours.push(hourOf(entry.arrived ?? entry.started));
    }
    return hours;
  }
  /** Something that happened to them without their going anywhere, such as a meal brought to the door. */
  note(person: number, doing: Doing, destination: number, tick: number, reason: VisitReason): void {
    const entries = [...this.today(person, tick), { person, doing, destination, started: tick, arrived: tick, reason }];
    this.entries.set(person, entries.slice(-8));
  }
  /** How many times today someone set out on one kind of outing. */
  count(person: number, doing: Doing, tick: number): number {
    const entries = this.entries.get(person);
    if (!entries) return 0;
    const day = activityDay(tick);
    let total = 0;
    for (const entry of entries) if (entry.doing === doing && activityDay(entry.started) === day) total++;
    return total;
  }
  depart(person: number, visit: FacilityVisit, tick: number): void {
    const entries = [...this.today(person, tick)];
    if (entries.some(entry => entry.started === tick && entry.destination === visit.destination)) return;
    entries.push({ person, doing: visit.doing, destination: visit.destination, started: tick, reason: visit.reason ?? 'leisure' });
    this.entries.set(person, entries.slice(-8));
  }
  arrive(person: number, trip: ActiveVisit, tick: number): void {
    // Yesterday's arrival must not replace activities already recorded for today.
    if (activityDay(trip.started) !== activityDay(tick)) return;
    this.depart(person, trip, trip.started);
    const entry = this.entries.get(person)?.find(entry => entry.started === trip.started && entry.destination === trip.destination);
    if (entry) entry.arrived = tick;
  }
  save(): ActivityEntry[] { return [...this.entries.values()].flat().map(entry => ({ ...entry })); }
  load(entries: readonly ActivityEntry[]): void {
    this.entries.clear();
    for (const entry of entries) {
      if (!this.entries.has(entry.person)) this.entries.set(entry.person, []);
      this.entries.get(entry.person)!.push({ ...entry });
    }
  }
}

export function parseDiary(value: unknown, tick: number, validDoing: (doing: unknown) => boolean): ActivityEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAP_SIZE ** 2 * 16) throw new Error('存檔資料損壞。');
  const counts = new Map<number, number>();
  return value.map(entry => {
    if (!entry || !Number.isSafeInteger(entry.person) || entry.person < 0 || !validDoing(entry.doing) ||
        !Number.isSafeInteger(entry.destination) || entry.destination < 0 || entry.destination >= MAP_SIZE ** 2 ||
        !Number.isFinite(entry.started) || entry.started < 0 || entry.started > tick ||
        (entry.arrived !== undefined && (!Number.isFinite(entry.arrived) || entry.arrived < entry.started || entry.arrived > tick)) ||
        !Object.hasOwn(visitReasons, entry.reason)) throw new Error('存檔資料損壞。');
    const count = (counts.get(entry.person) ?? 0) + 1;
    if (count > 8) throw new Error('存檔資料損壞。');
    counts.set(entry.person, count);
    return { person: entry.person, doing: entry.doing, destination: entry.destination, started: entry.started,
      arrived: entry.arrived, reason: entry.reason };
  });
}
