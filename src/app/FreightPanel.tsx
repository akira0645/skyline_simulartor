import { calendar } from '../simulation/calendar';
import { memo, useState } from 'react';
import type { FreightProblem, FreightReport } from '../simulation/Freight';
import { MAP_SIZE, type Cell } from '../simulation/TileMap';
import { Tag } from './Tag';

const position = (id: number): Cell => ({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });
const address = (id: number) => { const { x, y } = position(id); return `(${x}, ${y})`; };
const problems: Record<FreightProblem, string> = {
  'no-source': '沒有運作中的工廠', disconnected: '道路不通', shortage: '工廠貨量不足',
};
const PAGE_SIZE = 10;

export const FreightPanel = memo(function FreightPanel({ report, onLocate }: {
  report: FreightReport;
  onLocate: (cell: Cell, path?: readonly Cell[]) => void;
}) {
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const lastPage = Math.max(0, Math.ceil(report.routes.length / PAGE_SIZE) - 1);
  const current = Math.min(page, lastPage);
  const missing = report.destinations.filter(shop => shop.missing > 0);
  return <div className="freight-panel">
    <section>
      <h2>物流總覽</h2>
      <dl>
        <dt>據點</dt><dd className="tags"><Tag label="工廠" value={report.factories} /><Tag label="商店" value={report.shops} /></dd>
        <dt>每月貨量</dt><dd className="tags"><Tag label="供應" value={`${report.supply} 份`} /><Tag label="補貨目標" value={`${report.demand} 份`} /></dd>
        <dt>配送計畫</dt><dd className="tags"><Tag label="已安排" value={`${report.planned} 份`} tone={report.planned ? 'good' : 'dim'} />
          <Tag label="未安排" value={`${report.missing} 份`} tone={report.missing ? 'bad' : 'dim'} />
          <Tag label="尚未分配" value={`${report.unused} 份`} tone={report.unused ? undefined : 'dim'} /></dd>
        <dt>運輸</dt><dd className="tags"><Tag label="每月" value={`${report.trips} 趟`} />
          <Tag label="每日平均" value={`${(report.trips / calendar.daysPerMonth).toFixed(1)} 趟`} />
          <Tag label="共用貨車" value={`${report.fleet} 輛`} tip="各路線共用貨車，完成往返後接下一趟；地圖最多顯示 8 輛" /></dd>
      </dl>
      <p className="hint">這裡是每月配送計畫，非即時庫存或到貨紀錄；尚未安排不代表已缺貨。進出口另按月結算。</p>
    </section>
    <section>
      <h2>待安排補貨{missing.length > 0 && ` · ${missing.length} 間`}</h2>
      {!missing.length ? <p className="hint">{report.shops ? '商店的補貨目標皆已安排。' : '目前沒有營業中的商店。'}</p> : <>
        <ul className="freight-shortages">
          {(showAll ? missing : missing.slice(0, PAGE_SIZE)).map(shop => <li key={shop.id}>
            <div><b>商店 {address(shop.id)}</b><span>未安排 {shop.missing} 份 · {problems[shop.problem!]}</span></div>
            <button type="button" aria-label={`定位待補貨商店 ${address(shop.id)}`} onClick={() => onLocate(position(shop.id))}>定位</button>
          </li>)}
        </ul>
        {missing.length > PAGE_SIZE && <button type="button" onClick={() => setShowAll(!showAll)}>{showAll ? '收合' : `查看全部 ${missing.length} 間`}</button>}
      </>}
    </section>
    <section>
      <h2>配送路線 · {report.routes.length} 條</h2>
      {!report.routes.length && <p className="hint">{report.factories ? '尚無可配送的路線，請檢查道路與商店。' : '需要有員工且接路的工廠，才能安排市內送貨。'}</p>}
      {report.routes.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(route => <article className="freight-route" key={`${route.from}:${route.to}`}>
        <h3>工廠 {address(route.from)} → 商店 {address(route.to)}</h3>
        <div className="tags"><Tag label="每月" value={`${route.goods} 份／${route.trucks} 趟`} />
          <Tag label="單程估計" value={`${Math.max(1, Math.round(route.minutes))} 分`} /></div>
        <div className="row">
          <button type="button" aria-label={`定位供貨工廠 ${address(route.from)}`} onClick={() => onLocate(position(route.from), route.path)}>工廠與路線</button>
          <button type="button" aria-label={`定位收貨商店 ${address(route.to)}`} onClick={() => onLocate(position(route.to), route.path)}>收貨商店</button>
        </div>
      </article>)}
      {lastPage > 0 && <div className="row freight-pages">
        <button type="button" disabled={!current} onClick={() => setPage(current - 1)}>上一頁</button>
        <span>{current + 1}／{lastPage + 1}</span>
        <button type="button" disabled={current === lastPage} onClick={() => setPage(current + 1)}>下一頁</button>
      </div>}
    </section>
  </div>;
});
