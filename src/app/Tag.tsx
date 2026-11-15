/** Small pieces used all over the side panel. */
import { shifts } from '../simulation/WorkShift';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { traitNames, workplaceNames, howLong } from './wording';

export type Person = NonNullable<ReturnType<SimulationEngine['city']['inspect']>>['residents'] extends
  (infer Item)[] | undefined ? Item : never;

/** One line for a resident: who they are, then what they do. */
export function PersonRow({ person, atWork, onPick }: { person: Person; atWork?: boolean; onPick: (person: Person) => void }) {
  const wish = person.liking === 'industrial' ? '工廠' : '店鋪或辦公室';
  return <li role="button" tabIndex={0} title="點一下，看這個人在做什麼、想什麼"
    onClick={() => onPick(person)} onKeyDown={event => event.key === 'Enter' && onPick(person)}>
    <b>{person.name}</b>
    <span>{person.age} 歲</span>
    {person.trait && <i title={traitNames[person.trait][1]}>{traitNames[person.trait][0]}</i>}
    <small className="tags">
      {person.shift === undefined ? <Tag label="找工作中" tone="bad" /> :
        <Tag label={atWork ? '做了' : workplaceNames[person.shift]} value={howLong(person.workDays ?? 0)}
          tip={shifts[person.shift].title} />}
      {!atWork && <Tag label="住了" value={howLong(person.days)} />}
      {person.content === true && <Tag label="喜歡工作" tone="good" />}
      {person.content === false && <Tag label="想換工作" tone="bad" tip={`比較想去${wish}上班`} />}
    </small>
  </li>;
}

/**
 * How someone is doing in one of their needs, as a bar that is full when all is well, with the
 * word for it beside. Fuller is always better, whatever the need.
 */
export function Meter({ full, word, tone, tip }: { full: number; word: string; tone: 'good' | 'mid' | 'bad'; tip?: string }) {
  return <dd className="meter" title={tip}>
    <span className="bar"><i className={tone} style={{ width: `${Math.max(4, Math.min(100, Math.round(full)))}%` }} /></span>
    <span className={tone === 'bad' ? 'word bad' : 'word'}>{word}</span>
  </dd>;
}

/**
 * A fact in a few characters, with a number beside it when there is one. The long version is
 * the tooltip; a tag that can be picked is a button.
 */
export function Tag({ label, value, tone, tip, onPick, picked }: { label: string; value?: string | number;
  tone?: 'good' | 'bad' | 'dim'; tip?: string; onPick?: () => void; picked?: boolean }) {
  const body = <>{label}{value !== undefined && <b>{value}</b>}</>;
  const name = `tag${tone ? ` ${tone}` : ''}`;
  return onPick ? <button type="button" className={name} title={tip} aria-pressed={picked} onClick={onPick}>{body}</button> :
    <span className={name} title={tip}>{body}</span>;
}
