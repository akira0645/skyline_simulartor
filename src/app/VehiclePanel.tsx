import type { VehicleActivity, VehicleInfo } from '../rendering/vehicleInspection';
import type { Cell } from '../simulation/TileMap';
import { Tag } from './Tag';

const activities: Record<VehicleActivity, string> = { moving: '行駛中', turning: '迴轉中', red: '等待紅燈', queued: '前車阻擋', slow: '壅塞慢行', working: '現場處理中' };
const direction = (angle: number) => ['東', '東南', '南', '西南', '西', '西北', '北', '東北'][(Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8];
export function VehiclePanel({ vehicle, onClose, onRoute, onLocate }: {
  vehicle?: VehicleInfo; onClose: () => void; onRoute: (vehicle: VehicleInfo) => void; onLocate: (cell: Cell) => void;
}) {
  return <section className="vehicle-panel" aria-label="車輛即時狀態">
    <button type="button" onClick={onClose}>關閉車輛資料</button>
    {!vehicle ? <p>此車目前未顯示，可能已停駛、任務結束或路線已變更。</p> : <>
      <h2><i style={{ background: `#${vehicle.colour.toString(16).padStart(6, '0')}` }} />{vehicle.name}</h2>
      <dl>
        {vehicle.routeName && <><dt>路線</dt><dd>{vehicle.routeName}</dd></>}
        <dt>狀態</dt><dd className="tags"><Tag label={activities[vehicle.activity]} tone={vehicle.activity === 'red' || vehicle.activity === 'queued' ? 'bad' : undefined} />
          <Tag label={vehicle.returning ? vehicle.kind === 'freight' ? '返廠' : '返程' : vehicle.kind === 'freight' ? '配送去程' : '去程'} /></dd>
        <dt>位置</dt><dd>({vehicle.cell.x}, {vehicle.cell.y}) · 向{direction(vehicle.angle)}</dd>
        <dt>前往</dt><dd>({vehicle.destination.x}, {vehicle.destination.y})</dd>
        <dt>本程進度</dt><dd>{Math.round(Math.max(0, Math.min(1, vehicle.progress)) * 100)}%</dd>
        {vehicle.plannedGoods !== undefined && <><dt>每月計畫</dt><dd>{vehicle.plannedGoods} 份／{vehicle.plannedTrips} 趟</dd></>}
      </dl>
      <div className="row">
        <button type="button" onClick={() => onLocate(vehicle.cell)}>定位車輛</button>
        {vehicle.routeName && <button type="button" onClick={() => onRoute(vehicle)}>查看所屬路線</button>}
      </div>
      {vehicle.kind === 'freight' && <p className="hint">狀態與位置跟隨地圖上這輛車；貨量為每月配送計畫，並非即時車載庫存。</p>}
    </>}
  </section>;
}
