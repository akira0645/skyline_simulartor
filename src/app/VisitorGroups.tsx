import { Fragment } from 'react';
import type { Doing } from '../simulation/Mind';

interface Visitor { home: number; slot: number; name?: string; doing: Doing }
export function VisitorGroups({ using, heading, onPick, activityLabel }: {
  using: readonly Visitor[]; heading: readonly Visitor[];
  onPick: (visitor: Visitor) => void; activityLabel: (doing: Doing) => string;
}) {
  return <>{[{ label: '使用中', people: using }, { label: '前往中', people: heading }].map(group => <Fragment key={group.label}>
    <dt className="visitor-label">{group.label}</dt>
    <dd className="visitor-group">
      {group.people.length ? <details className="visitor-details">
        <summary aria-label={`${group.label} ${group.people.length} 人，訪客名單`}>
          <span>{group.people.length} 人</span><span className="visitor-disclosure-hint" aria-hidden="true" />
        </summary>
        <div className="visitor-names" aria-label={`${group.label}的訪客`}>
          {group.people.map(visit => <button type="button" className="tag" key={`${visit.home}:${visit.slot}`}
            title={activityLabel(visit.doing)} onClick={() => onPick(visit)}>{visit.name ?? '居民'}</button>)}
        </div>
      </details> : <span className="visitor-empty">0 人</span>}
    </dd>
  </Fragment>)}</>;
}
