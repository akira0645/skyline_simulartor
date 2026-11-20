import { useState } from 'react';
import type { FreightReport } from '../simulation/Freight';
import type { FreightMetrics } from '../simulation/FreightRuntime';
import type { Cell } from '../simulation/TileMap';
import { MAP_SIZE } from '../simulation/TileMap';
import { Tag } from './Tag';
const qty = (amount: number) => amount.toFixed(2);
const percent = (part: number, total: number) => total > 0 ? `${(100 * part / total).toFixed(1)}%` : '—';
export function FreightMetricsView({ metrics }: { metrics?: FreightMetrics }) {
  if (!metrics) return <p className="hint">本期尚無實際出車紀錄。</p>;
  return <dl className="freight-operating-metrics">
    <dt>實際運量</dt><dd className="tags"><Tag label="裝載" value={`${qty(metrics.loaded)} 份`} /><Tag label="交付" value={`${qty(metrics.delivered)} 份`} tone={metrics.delivered ? 'good' : 'dim'} /></dd>
    <dt>車次</dt><dd className="tags"><Tag label="出發" value={metrics.departures} /><Tag label="完成往返" value={metrics.completed} /></dd>
    <dt>效率</dt><dd className="tags"><Tag label="裝載率" value={percent(metrics.loaded, metrics.departures * 24)} /><Tag label="空車里程率" value={percent(metrics.emptyDistance, metrics.distance)} /></dd>
    <dt>行車延誤</dt><dd>{(metrics.delayMs / 1000).toFixed(1)} 秒（1×時間）</dd>
    <dt>估算成本</dt><dd>${metrics.cost.toFixed(2)}<small>（尚未扣款）</small></dd>
    {metrics.cancelled > 0 && <><dt>取消運送</dt><dd>{qty(metrics.cancelled)} 份</dd></>}
  </dl>;
}
export function FreightOperations({ report, locate }: { report: FreightReport; locate: (cell: Cell) => void }) {
  const [previous, setPrevious] = useState(false);
  const [all, setAll] = useState(false);
  const records = previous ? report.operations.previous : report.operations.current;
  const total = records.reduce<FreightMetrics>((sum, m) => {
    for (const field of ['loaded', 'delivered', 'departures', 'completed', 'distance', 'emptyDistance', 'delayMs', 'cost', 'cancelled'] as const) sum[field] += m[field];
    return sum;
  }, { key: 'total', loaded: 0, delivered: 0, departures: 0, completed: 0, distance: 0, emptyDistance: 0, delayMs: 0, cost: 0, cancelled: 0 });
  const sites = [...report.operations.factories.map(site => ({ ...site, kind: '工廠', capacity: undefined as number | undefined, target: undefined as number | undefined, incoming: 0 })),
    ...report.operations.shops.map(site => ({ ...site, capacity: undefined as number | undefined, kind: '商店' })),
    ...report.operations.warehouses.map(site => ({ ...site, kind: '倉庫', target: site.capacity }))];
  return <>
    <section className="freight-inventory"><h2>實際庫存</h2>
      <p className="tags"><Tag label="工廠" value={`${qty(report.operations.factories.reduce((n, site) => n + site.stock, 0))} 份`} />
        <Tag label="倉庫" value={`${qty(report.operations.warehouses.reduce((n, site) => n + site.stock, 0))} 份`} />
        <Tag label="運送中" value={`${qty(report.operations.inTransit)} 份`} />
        <Tag label="商店" value={`${qty(report.operations.shops.reduce((n, site) => n + site.stock, 0))} 份`} /></p>
      <p className="hint">工廠逐步生產，貨車裝貨時扣庫存，到站才補貨；商店按補貨目標逐步消耗。商店備貨上限目標為三天用量，倉庫容量 240 份，不生產或消耗，出貨在途會保留退貨空間；請手動安排進貨與出貨線。分數貨量保留計算。</p>
      {!sites.length && <p className="hint">尚無物流據點。</p>}
      <ul className="freight-shortages">{(all ? sites : sites.slice(0, 10)).map(site => <li key={site.id}>
        <div><b>{site.kind} ({site.id % MAP_SIZE}, {Math.floor(site.id / MAP_SIZE)})</b>
          <span>庫存 {qty(site.stock)} 份{site.target !== undefined && `／${site.capacity !== undefined ? '容量' : '目標'} ${qty(site.target)} 份`}</span>
          {site.target !== undefined && <span>{site.capacity !== undefined ? site.stock >= site.capacity - 0.01 ? '已滿' : site.stock < 0.01 ? '待入庫' : '有存貨' : site.stock < 0.01 ? '缺貨' : '有貨'} · 在途 {qty(site.incoming)} 份</span>}</div>
        <button type="button" aria-label={`定位庫存據點 ${site.id}`} onClick={() => locate({ x: site.id % MAP_SIZE, y: Math.floor(site.id / MAP_SIZE) })}>定位</button>
      </li>)}</ul>
      {sites.length > 10 && <button type="button" onClick={() => setAll(!all)}>{all ? '收合庫存' : `查看全部 ${sites.length} 個據點`}</button>}
    </section>
    <section className="freight-operations"><h2>路線營運報表</h2>
      <div className="row" role="group" aria-label="物流報表期間"><button type="button" aria-pressed={!previous} onClick={() => setPrevious(false)}>本月</button><button type="button" aria-pressed={previous} onClick={() => setPrevious(true)}>上月</button></div>
      <FreightMetricsView metrics={records.length ? total : undefined} />
      <p className="hint">每一段轉運各記一次裝載與交付，商店到貨請看最後配送線。記錄實際車次與交付，跨月在途貨物在到站當月計入交付。空車率按里程計算；延誤包含道路壅塞、號誌及前車等待。同入口直接交付以一批計入車次，不產生道路里程。成本按里程與營運時間估算，尚未扣款；進出口仍另按月結算。</p>
      {records.map(record => <details key={record.key}><summary>{record.key.startsWith('manual:') ? `物流 ${record.key.split(':')[1]} 號` : `自動配送 ${record.key.split(':').slice(1).map(Number).map(id => `(${id % MAP_SIZE}, ${Math.floor(id / MAP_SIZE)})`).join(' → ')}`}</summary><FreightMetricsView metrics={record} /></details>)}
    </section>
  </>;
}
