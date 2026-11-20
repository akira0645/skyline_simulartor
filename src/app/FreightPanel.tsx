import { FreightOperations } from './FreightOperations';
import { calendar } from '../simulation/calendar';
import { memo, useState } from 'react';
import type { FreightProblem, FreightReport } from '../simulation/Freight';
import { MAP_SIZE, type Cell } from '../simulation/TileMap';
import { freight, type FreightRoute } from '../simulation/Freight';
import { freightLines, type FreightMode, type FreightLineProblem } from '../simulation/FreightLines';
import { freightKey, freightColourId, selectedFreightKey } from '../rendering/routeViews';
import { lineColourCss } from './lineColours';
import { Tag } from './Tag';

const position = (id: number): Cell => ({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) });
const address = (id: number) => { const { x, y } = position(id); return `(${x}, ${y})`; };
const problems: Record<FreightProblem, string> = {
  'no-source': '沒有運作中的工廠', disconnected: '道路不通', shortage: '工廠貨量不足',
  unrouted: '尚未加入物流路線', 'no-vehicles': '路線尚未配車', 'manual-limit': '請檢查指定工廠貨量與路線運能',
};
const PAGE_SIZE = 10;

export interface FreightActions {
  mode: (mode: FreightMode) => void;
  create: () => void;
  remove: (id: number) => void;
  vehicles: (id: number, count: number) => void;
  edit: (id?: number) => void;
  stop: (id: number, cell: Cell) => void;
  select: (key: string, cell: Cell) => void;
  locate: (cell: Cell) => void;
  showAll: (value: boolean) => void;
}
const lineProblems: Record<FreightLineProblem, string> = {
  'waiting-stock': '等候倉庫補貨',
  'need-stops': '先選出貨工廠或倉庫，再選配送站', 'no-factory': '起點需要工廠或物流倉庫', 'no-shop': '工廠可送倉庫或商店；倉庫只能送商店',
  'no-road': '站點道路不通', paused: '停駛', 'no-supply': '工廠尚無可配送貨量', 'no-demand': '店面需求已安排或尚未營業', capacity: '路程太長，請縮短或增加配車',
};
export const FreightPanel = memo(function FreightPanel({ report, actions, selected, editing, showAll = false }: {
  report: FreightReport;
  actions: FreightActions;
  selected?: string;
  editing?: number;
  showAll?: boolean;
}) {
  const [view, setView] = useState<'routes' | 'operations'>('routes');
  const [page, setPage] = useState(0);
  const [showAllMissing, setShowAllMissing] = useState(false);
  const lastPage = Math.max(0, Math.ceil(report.routes.length / PAGE_SIZE) - 1);
  const current = Math.min(page, lastPage);
  const chosen = selectedFreightKey(report.mode, report.lines, report.routes, selected);
  const chosenName = report.mode === 'manual' ? chosen ? `物流 ${chosen.split(':')[1]} 號` : undefined :
    chosen ? `自動配送 ${report.routes.findIndex(route => freightKey(route) === chosen) + 1}` : undefined;
  const missing = report.destinations.filter(shop => shop.missing > 0);
  return <div className="freight-panel">
    <section>
      <h2>物流總覽</h2>
      <div className="row" role="group" aria-label="配送模式">
        <button type="button" aria-pressed={report.mode === 'auto'} onClick={() => actions.mode('auto')}>自動配送</button>
        <button type="button" aria-pressed={report.mode === 'manual'} onClick={() => actions.mode('manual')}>手動規劃</button>
      </div>
      <div className="row"><button type="button" aria-pressed={showAll} onClick={() => actions.showAll(!showAll)}>顯示全部路線</button></div>
      <p className="hint">{chosenName ? `地圖${showAll ? '顯示全部，凸顯' : '僅顯示'}「${chosenName}」。白色箭頭是去程，站號依配送順序排列。` : '尚無配送路線。'}</p>
      <dl>
        <dt>據點</dt><dd className="tags"><Tag label="工廠" value={report.factories} /><Tag label="商店" value={report.shops} /><Tag label="物流倉庫" value={report.operations.warehouses.length} /></dd>
        <dt>每月貨量</dt><dd className="tags"><Tag label="供應" value={`${report.supply} 份`} /><Tag label="補貨目標" value={`${report.demand} 份`} /></dd>
        <dt>補貨計畫</dt><dd className="tags"><Tag label="已安排" value={`${report.planned} 份`} tone={report.planned ? 'good' : 'dim'} />
          <Tag label="未安排" value={`${report.missing} 份`} tone={report.missing ? 'bad' : 'dim'} />
          <Tag label="工廠未分配" value={`${report.unused} 份`} tone={report.unused ? undefined : 'dim'} /></dd>
        {report.operations.warehouses.length > 0 && <><dt>搬運計畫</dt><dd>{report.handled} 份（含倉庫中轉）</dd></>}
        <dt>運輸</dt><dd className="tags"><Tag label="每月" value={`${report.trips} 趟`} />
          <Tag label="每日平均" value={`${(report.trips / calendar.daysPerMonth).toFixed(1)} 趟`} />
          <Tag label={report.mode === 'manual' ? '營運配車' : '共用貨車'} value={`${report.fleet} 輛`}
            tip={report.mode === 'manual' ? '有配送任務的路線配車' : '各路線共用貨車，完成往返後接下一趟；地圖最多顯示 8 輛'} />
          {report.mode === 'manual' && <Tag label="全市配車" value={`${report.vehicles}／${freight.maxVehicles} 輛`} />}</dd>
      </dl>
      <p className="hint">上方是每月配送計畫；實際庫存、在途貨量與交付紀錄列於下方。計畫已安排不代表已到貨；中轉進貨與出貨是兩次搬運，商店補貨目標只計一次。</p>
    </section>
    <div className="row" role="group" aria-label="物流面板內容">
      <button type="button" aria-pressed={view === 'routes'} onClick={() => setView('routes')}>路線管理</button>
      <button type="button" aria-pressed={view === 'operations'} onClick={() => setView('operations')}>庫存與報表</button>
    </div>
    {view === 'operations' && <FreightOperations report={report} locate={actions.locate} />}
    <div hidden={view !== 'routes'}>
    {report.mode === 'manual' ? <>
      <p className="hint">「交通」可建物流倉庫（容量 240 份）。新增路線先選工廠或倉庫：工廠可送倉庫及商店，倉庫可送商店；中轉需分成兩條線。全市最多 {freight.maxVehicles} 輛，可將配車減到 0 暫停路線。</p>
      {report.lines.map(line => <section className="line freight-route" key={line.id} data-freight-line={line.id}>
        <h2><i style={{ background: lineColourCss(line.id) }} />物流 {line.id} 號
          <button type="button" aria-label={`刪除物流 ${line.id} 號`} onClick={() => actions.remove(line.id)}>×</button></h2>
        <dl>
          <dt>站</dt><dd className="tags"><Tag label="站" value={line.stops.length} />
            {line.problem && <Tag label={lineProblems[line.problem]} tone={line.problem === 'paused' ? 'dim' : 'bad'} />}
            {line.active && <Tag label="營運中" tone="good" />}</dd>
          <dt>每月</dt><dd className="tags"><Tag label="安排" value={`${line.assigned} 份`} />
            <Tag label="運能" value={`${line.capacity} 份`} /><Tag label="車次" value={line.trips} /></dd>
          {line.path.length > 0 && <><dt>行車</dt><dd className="tags"><Tag label="單程估計" value={`${Math.max(1, Math.round(line.minutes))} 分`} /></dd></>}
          <dt>車輛</dt><dd className="tax">
            <button type="button" aria-label={`物流 ${line.id} 號減少車輛`} disabled={!line.vehicles} onClick={() => actions.vehicles(line.id, line.vehicles - 1)}>−</button>
            {line.vehicles} 輛
            <button type="button" aria-label={`物流 ${line.id} 號增加車輛`} disabled={report.vehicles >= freight.maxVehicles} onClick={() => actions.vehicles(line.id, line.vehicles + 1)}>+</button>
          </dd>
        </dl>
        {line.stops.length > 0 && <ol className="freight-stops">{line.stops.map((stop, index) => <li key={stop}>
          <button type="button" onClick={() => actions.select(`manual:${line.id}`, position(stop))}>{index === 0 ? '起點' : `配送 ${index}`} {address(stop)}</button>
          <button type="button" aria-label={`物流 ${line.id} 號移除站點 ${address(stop)}`} onClick={() => actions.stop(line.id, position(stop))}>×</button>
        </li>)}</ol>}
        <div className="row">
          <button type="button" aria-pressed={editing === line.id} onClick={() => actions.edit(editing === line.id ? undefined : line.id)}>{editing === line.id ? '完成' : '改站'}</button>
          {line.stops.length > 0 && <button type="button" aria-pressed={chosen === `manual:${line.id}`} onClick={() => actions.select(`manual:${line.id}`, position(line.stops[0]))}>查看路線</button>}
        </div>
      </section>)}
      {report.lines.length < freightLines.maxLines && <button type="button" onClick={actions.create}>新增物流路線</button>}
    </> : <section>
      <h2>配送路線 · {report.routes.length} 條</h2>
      <p className="hint">自動配送維持工廠直送商店；使用倉庫中轉，請切換「手動規劃」設定進貨與出貨兩條線。</p>
      {!report.routes.length && <p className="hint">{report.factories ? '尚無可配送的路線，請檢查道路與商店。' : '需要有員工且接路的工廠，才能安排市內送貨。'}</p>}
      {report.routes.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((route, offset) => <article className="line freight-route" key={freightKey(route)}>
        <h2><i style={{ background: lineColourCss(freightColourId(route)) }} />自動配送 {current * PAGE_SIZE + offset + 1}</h2>
        <p className="freight-address">工廠 {address(route.from)} → 商店 {address(route.to)}</p>
        <dl><dt>每月</dt><dd className="tags"><Tag label="貨量" value={`${route.goods} 份`} /><Tag label="車次" value={route.trucks} /></dd>
          <dt>行車</dt><dd className="tags"><Tag label="單程估計" value={`${Math.max(1, Math.round(route.minutes))} 分`} /></dd></dl>
        <div className="row">
          <button type="button" aria-pressed={chosen === freightKey(route)} onClick={() => actions.select(freightKey(route), position(route.from))}>查看路線</button>
          <button type="button" aria-label={`定位收貨商店 ${address(route.to)}`} onClick={() => actions.select(freightKey(route), position(route.to))}>收貨商店</button>
        </div>
      </article>)}
      {lastPage > 0 && <div className="row freight-pages">
        <button type="button" disabled={!current} onClick={() => setPage(current - 1)}>上一頁</button>
        <span>{current + 1}／{lastPage + 1}</span>
        <button type="button" disabled={current === lastPage} onClick={() => setPage(current + 1)}>下一頁</button>
      </div>}
    </section>}
    <section>
      <h2>待安排補貨{missing.length > 0 && ` · ${missing.length} 間`}</h2>
      {!missing.length ? <p className="hint">{report.shops ? '商店的補貨目標皆已安排。' : '目前沒有營業中的商店。'}</p> : <>
        <ul className="freight-shortages">
          {(showAllMissing ? missing : missing.slice(0, PAGE_SIZE)).map(shop => <li key={shop.id}>
            <div><b>商店 {address(shop.id)}</b><span>未安排 {shop.missing} 份 · {problems[shop.problem!]}</span></div>
            <button type="button" aria-label={`定位待補貨商店 ${address(shop.id)}`} onClick={() => actions.locate(position(shop.id))}>定位</button>
          </li>)}
        </ul>
        {missing.length > PAGE_SIZE && <button type="button" onClick={() => setShowAllMissing(!showAllMissing)}>{showAllMissing ? '收合' : `查看全部 ${missing.length} 間`}</button>}
      </>}
    </section>
    </div>
  </div>;
});
