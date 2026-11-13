import { useEffect, useRef, useState } from 'react';
import { CityRenderer } from '../rendering/CityRenderer';
import cityUrl from '../assets/city.png';
import { TrendChart, type TrendPoint } from './TrendChart';
import { lineColourCss, lineName } from './lineColours';
import { transit } from '../simulation/Transit';
import { landValue } from '../simulation/LandValue';
import type { Overlay, Tool } from './tools';
import type { Cell, Tile } from '../simulation/TileMap';
import { demoCity, powerPlant, waterTower, works } from './demoCity';
import { workShift, shiftPhase, rushShifts, shifts } from '../simulation/WorkShift';
import { ISSUES, type CityEvent, type Issue } from '../simulation/BuildingSystem';
import { economy, milestones, tileCost } from '../simulation/Economy';
import { dateAt, hourAt } from '../simulation/calendar';
import { traffic } from '../simulation/Traffic';
import { pollution } from '../simulation/Pollution';
import { utilities } from '../simulation/Utilities';
import { isFacility, isService, TILES, type Service } from '../simulation/TileMap';
import { services } from '../simulation/Services';
import { SimulationClock, type SimulationSpeed } from '../simulation/SimulationClock';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { AUTO_SLOT, readSave, writeSave } from '../storage/SaveManager';
import { goals } from '../simulation/Goals';
import { TRAITS, type Trait } from '../simulation/Residents';

const speeds = [0, 1, 2, 4] as const;

/** The build tools, one group per tab of the toolbar. */
const toolGroups: [string, [Tool, string][]][] = [
  ['道路', [['road', '道路'], ['avenue', '大道']]],
  ['交通', [['bus', '公車站'], ['metro', '捷運站']]],
  ['分區', [['residential', '住宅'], ['commercial', '商業'], ['industrial', '工業']]],
  ['水電', [['power', '電廠'], ['water', '水塔']]],
  ['服務', [['fire', '消防局'], ['police', '警察局'], ['school', '學校'], ['clinic', '診所']]],
  ['其他', [['park', '公園'], ['demolish', '拆除']]],
];

/** Where each tool's picture sits in city.png, as [column, row]; the rest are drawn in CSS. */
const iconAt: Partial<Record<Tool, [number, number]>> = {
  road: [10, 0], avenue: [10, 0], residential: [0, 2], commercial: [0, 3], industrial: [0, 4],
  power: [0, 5], water: [1, 5], fire: [2, 5], police: [3, 5], school: [4, 5], clinic: [5, 5], bus: [6, 5], metro: [7, 5],
};
const iconStyle = (tool: Tool) => {
  const at = iconAt[tool];
  return at && { backgroundImage: `url(${cityUrl})`, backgroundPosition: `-${at[0] * 32}px -${at[1] * 32}px` };
};

const panelTabs = [['tile', '這一格'], ['city', '城市'], ['goals', '目標'], ['lines', '路線'], ['log', '紀錄']] as const;
type PanelTab = (typeof panelTabs)[number][0];

/** What one tile of a tool costs; nothing for the tool that only looks. */
const toolCost = (tool: Tool) =>
  tool === 'pan' || tool === 'inspect' || tool === 'line' ? undefined :
  tileCost(tool === 'demolish' ? 'grass' : tool);

/** One line on how to use each tool, shown when it is picked. */
function toolTip(tool: Tool): string {
  if (isService(tool)) {
    const extra = tool === 'fire' ? '範圍內失火會被撲滅。' :
      tool === 'police' ? '城市超過 100 人後，沒有警察的地方地價會變低。' : '';
    return `點一下蓋${tileNames[tool]}，要緊貼著路才會運作。框線內是它照顧得到的範圍，裡面的建築地價會提高。${extra}`;
  }
  if (isFacility(tool)) {
    return `點一下蓋${tileNames[tool]}，要緊貼著路才會運作。框線內是送得到的範圍，一座最多供應 ${utilities.capacity[tool]} 棟。綠色的建築已經有了，紅色的還沒有。`;
  }
  switch (tool) {
    case 'road': return '按住拖曳鋪一條直線的路。住宅、商店、工廠都要緊貼著路才蓋得起來。鋪過河會變成橋，每格 $80。';
    case 'bus': return '點一下蓋公車站，要緊貼著路。蓋好站以後，到右邊「路線」分頁把站連成一條路線，公車才會開始跑。';
    case 'metro': return '點一下蓋捷運站，不用貼著路。捷運走地下，比開車快很多，平常在地面上看不到列車。蓋好站以後，到右邊「路線」分頁把站連成路線。';
    case 'line': return '照順序點地圖上的站，把它們加進這條路線；再點一次已經加入的站會把它拿掉。弄好了按右邊的「完成」。';
    case 'avenue': return '大道比道路快一倍，能走三倍的車，可以直接鋪在舊的道路上。';
    case 'residential': return '按住拖曳劃出住宅區，要緊貼著路。離工廠遠一點，不然沒人想住。';
    case 'commercial': return '按住拖曳劃出商業區，要緊貼著路。商店提供工作。';
    case 'industrial': return '按住拖曳劃出工業區，要緊貼著路。工廠提供工作，但會污染附近。';
    case 'park': return '按住拖曳蓋公園。公園會減少附近的污染，也讓附近地價變高。';
    case 'demolish': return '點一下拆掉那一格。';
    default: return '按住拖曳可以移動地圖，點一下任何一格看它的資料，滾輪放大縮小。';
  }
}

/** City ranks, indexed by how many milestones have been reached. */
const rankNames = ['空地', '小村', '村莊', '小鎮', '城鎮', '城市', '大城市'];
const money = (amount: number) => `${amount < 0 ? '−' : ''}$${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;

const overlays: [Overlay, string, string][] = [
  ['none', '一般', ''],
  ['traffic', '車流', '顯示現在這個時間路上的車：綠色順暢，黃色車多，橘色和紅色是塞車。上下班時間才會變色。'],
  ['pollution', '污染', '紫色越深污染越重。住宅在太髒的地方不會有人搬進來。'],
  ['value', '地價', '綠色是好地段，紅色最差。地價夠高、住滿人的建築會升級。'],
  ['lines', '路線', '顯示公車和捷運的路線，每條路線一個顏色，框起來的是站。捷運在地下，只有在這裡才看得到列車。'],
  ['power', '供電', '綠色的建築有電，紅色沒有。'],
  ['water', '供水', '綠色的建築有水，紅色沒有。'],
];

const zones = [['residential', '住宅'], ['commercial', '商業'], ['industrial', '工業']] as const;

const issueNames: Record<Issue, string> = {
  'no-road': '旁邊沒有路', 'no-power': '沒有電', 'no-water': '沒有水',
  'no-jobs': '有人找不到工作', 'long-commute': '上班路程太久', pollution: '污染太重', crime: '治安不好',
  'no-school': '附近沒有學校', 'no-clinic': '附近沒有診所',
  vacancies: '找不到員工',
};

const tileNames: Record<Tile, string> = {
  grass: '草地', road: '道路', avenue: '大道', residential: '住宅區', commercial: '商業區',
  industrial: '工業區', power: '電廠', water: '水塔', park: '公園',
  fire: '消防局', police: '警察局', school: '學校', clinic: '診所',
  river: '河流', bridge: '橋', bus: '公車站', metro: '捷運站',
};

/** What happened, for the message line and the list of recent events. */
const eventText: Record<CityEvent['kind'], string> = {
  fire: '失火了，附近沒有消防局，一棟建築燒掉了',
  'fire-out': '失火了，消防車趕到撲滅了',
  crime: `遭小偷，附近沒有警察局，損失 $${services.crime.loss}`,
  'crime-stopped': '遭小偷，警車趕到抓到人了',
  sick: '有人生病，附近沒有診所，搬走了',
  'sick-helped': '有人生病，救護車送去診所了',
};

/** What each kind of person is called, and what they do to the city. */
const traitNames: Record<Trait, [string, string]> = {
  rich: ['有錢人', '繳兩倍的稅'],
  driver: ['愛開車', '絕對不搭公車和捷運'],
  rider: ['愛搭車', '有車可搭就一定搭'],
  helper: ['熱心助人', '讓失火、小偷、生病變少'],
  gardener: ['綠手指', '讓自己住的地方地價變高'],
};

const serviceNames: Record<Service, string> = { fire: '消防', police: '警察', school: '學校', clinic: '診所' };

/** How full a road is, in the words of the traffic view's four colours. */
const trafficName = (load: number) =>
  load <= 0.5 ? '順暢' : load <= 1 ? '車多' : load <= 1.5 ? '塞車' : '嚴重塞車';

/** A new city on a map nobody has seen: the seed, and so the water, is different every time. */
function freshCity(): SimulationEngine {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const engine = new SimulationEngine({ version: 1, seed, tick: 0 });
  engine.city.map.generateTerrain(seed);
  return engine;
}

/** The history as points for one chart. */
function trend(history: readonly { tick: number; population: number; funds: number }[],
  key: 'population' | 'funds'): TrendPoint[] {
  return history.map(sample => {
    const day = dateAt(sample.tick);
    return { when: `${day.year} 年 ${day.month} 月 ${day.day} 日`, value: sample[key] };
  });
}

/** Advances the simulation by the real time that has passed and times each tick. */
function step(engine: SimulationEngine, clock: SimulationClock,
  lastTime: { current: number }, tickMs: { current: number }): number {
  const now = performance.now();
  const before = engine.getSnapshot().tick;
  const tick = clock.advance(now - lastTime.current);
  if (tick > before) tickMs.current = (performance.now() - now) / (tick - before);
  lastTime.current = now;
  return tick;
}

export function App() {
  const viewport = useRef<HTMLDivElement>(null);
  const activeTool = useRef<Tool>('inspect');
  const [tool, setTool] = useState<Tool>('inspect');
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('先用下面的「道路」鋪一條路，再到「分區」在路旁劃住宅、商業、工業，城市就會自己長出來。');
  const [tick, setTick] = useState(0);
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const [engine] = useState(() => freshCity());
  const [clock] = useState(() => new SimulationClock(engine));
  const [stats, setStats] = useState(() => engine.city.getStats());
  const rendererRef = useRef<CityRenderer>(null);
  const lastTime = useRef(0);
  const tickMs = useRef(0);
  const [selected, setSelected] = useState<Cell>();
  const [debug, setDebug] = useState(false);
  const [fps, setFps] = useState(0);
  const [hour, setHour] = useState(() => hourAt(0));
  const [demo, setDemo] = useState(false);
  const activeOverlay = useRef<Overlay>('none');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const knownRank = useRef(0);
  const knownEvent = useRef(0);
  const knownGoals = useRef(0);
  const [toolTab, setToolTab] = useState(0);
  const [panelTab, setPanelTab] = useState<PanelTab>('city');
  // The line whose stops are being picked on the map, if any.
  const [editing, setEditing] = useState<number>();
  const editingRef = useRef<number>(undefined);
  // A sample of the city every five game days, for the charts. Kept for this visit only.
  const [history, setHistory] = useState<{ tick: number; population: number; funds: number }[]>([]);

  function updateClock() {
    setTick(step(engine, clock, lastTime, tickMs));
  }

  async function save() {
    updateClock();
    try {
      await writeSave(engine.save());
      setMessage('城市存好了。');
    } catch (error) {
      console.error('Save failed', error);
      setMessage('存不起來，請再試一次。');
    }
  }

  async function load() {
    let data: unknown;
    try {
      data = await readSave();
    } catch (error) {
      console.error('Load failed', error);
      setMessage('讀不到之前存的城市。');
      return;
    }
    if (data === undefined) {
      setMessage('還沒有存過城市。');
      return;
    }
    try {
      engine.load(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '存檔資料損壞。');
      return;
    }
    clock.reset();
    lastTime.current = performance.now();
    setTick(engine.getSnapshot().tick);
    setStats(engine.city.getStats());
    knownRank.current = engine.city.getStats().rank;
    knownGoals.current = engine.city.getStats().goals.length;
    rendererRef.current?.refresh?.();
    setDemo(false);
    setMessage('已經回到上次存的城市。');
  }

  useEffect(() => {
    lastTime.current = performance.now();
    const timer = window.setInterval(() => {
      const next = step(engine, clock, lastTime, tickMs);
      setTick(next);
      setHour(hourAt(next, clock.tickProgress));
    }, 40);
    return () => window.clearInterval(timer);
  }, [engine, clock]);

  useEffect(() => {
    if (!debug) return;
    let frames = 0;
    let since = performance.now();
    let request = requestAnimationFrame(function count(now) {
      frames++;
      if (now - since >= 500) {
        setFps(Math.round(frames * 1000 / (now - since)));
        frames = 0;
        since = now;
      }
      request = requestAnimationFrame(count);
    });
    return () => cancelAnimationFrame(request);
  }, [debug]);

  useEffect(() => {
    if (selected) setPanelTab('tile');
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    void readSave(AUTO_SLOT).then(data => {
      if (cancelled || data === undefined) return;
      try {
        engine.load(data);
      } catch {
        return;
      }
      clock.reset();
      lastTime.current = performance.now();
      const now = engine.city.getStats();
      knownRank.current = now.rank;
      knownGoals.current = now.goals.length;
      setTick(engine.getSnapshot().tick);
      setStats(now);
      rendererRef.current?.refresh?.();
      setMessage('已經回到你上次離開時的城市。想重新開始可以按上面的「新地圖」。');
    }).catch(() => undefined);
    // Every quarter of a minute, and when the page is put away.
    const keep = () => void writeSave(engine.save(), AUTO_SLOT).catch(() => undefined);
    const timer = window.setInterval(keep, 15000);
    const onHide = () => { if (document.visibilityState === 'hidden') keep(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [engine, clock]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      activeTool.current = 'inspect';
      editingRef.current = undefined;
      setEditing(undefined);
      setTool('inspect');
      setMessage('');
      rendererRef.current?.refresh?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const host = viewport.current;
    if (!host) return;

    const lifetime = new AbortController();
    const renderer = new CityRenderer(engine.city, () => clock.speed,
      () => hourAt(engine.getSnapshot().tick, clock.tickProgress), () => activeOverlay.current);
    rendererRef.current = renderer;
    void renderer.mount(host, lifetime.signal, () => activeTool.current, message => {
      setMessage(message);
      setStats(engine.city.getStats());
    }, setSelected).catch((error: unknown) => {
      if (lifetime.signal.aborted) return;
      console.error('PixiJS initialization failed', error);
      setFailed(true);
    });

    return () => {
      lifetime.abort();
      renderer.destroy();
    };
  }, [engine]);

  useEffect(() => {
    const next = engine.city.getStats();
    setStats(next);
    setHistory(past => {
      const last = past.at(-1);
      // Going back in time means another city was loaded: start the charts again.
      if (last && tick < last.tick) return [{ tick, population: next.population, funds: next.funds }];
      if (last && tick - last.tick < 40) return past;
      return [...past.slice(-179), { tick, population: next.population, funds: next.funds }];
    });
    if (next.rank > knownRank.current) {
      setMessage(`城市長大成「${rankNames[next.rank]}」了，拿到獎金 ${money(milestones[next.rank - 1].grant)}。`);
    }
    knownRank.current = next.rank;
    if (next.goals.length > knownGoals.current) {
      const goal = goals.find(candidate => candidate.id === next.goals.at(-1));
      if (goal) setMessage(`完成目標「${goal.title}」，拿到獎金 ${money(goal.reward)}。`);
    }
    knownGoals.current = next.goals.length;
    const latest = engine.city.getEvents().at(-1);
    if (latest && latest.tick > knownEvent.current) {
      knownEvent.current = latest.tick;
      // Only what went wrong, and fires, interrupt; routine calls just go in the list.
      if (latest.kind === 'fire' || latest.kind === 'fire-out' || latest.kind === 'crime' || latest.kind === 'sick') {
        setMessage(`${eventText[latest.kind]}。`);
      }
    }
    rendererRef.current?.refresh?.();
  }, [engine, tick]);

  /** Runs a command from a button rather than the map, then shows the result. */
  function command(action: Parameters<typeof engine.city.execute>[0], done: string) {
    const result = engine.city.execute(action);
    setStats(engine.city.getStats());
    rendererRef.current?.refresh?.();
    setMessage(result.error ?? done);
  }

  /** Swaps the whole city for another one, after asking if there is anything to lose. */
  function replaceCity(next: SimulationEngine, question: string, isDemo: boolean, done: string) {
    if (engine.city.map.save().some(code => code !== 0 && TILES[code] !== 'river') &&
        !window.confirm(question)) return;
    engine.load(next.save());
    clock.reset();
    lastTime.current = performance.now();
    setTick(0);
    setHour(hourAt(0));
    setDemo(isDemo);
    setSelected(undefined);
    rendererRef.current?.deselect?.();
    knownRank.current = 0;
    knownEvent.current = 0;
    knownGoals.current = 0;
    void writeSave(engine.save(), AUTO_SLOT).catch(() => undefined);
    setStats(engine.city.getStats());
    rendererRef.current?.refresh?.();
    setMessage(done);
  }

  function startDemo() {
    const sample = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
    sample.city.map.generateTerrain(42);
    demoCity(sample);
    replaceCity(sample, '示範小鎮會蓋掉現在的地圖，確定嗎？', true,
      '這是一座會自己長大的示範小鎮。按 4× 加快時間看它變化，或到右邊「城市」分頁試試出狀況會怎樣。');
  }

  function startNew() {
    replaceCity(freshCity(), '開一張新地圖會丟掉現在的城市，確定嗎？', false,
      '這是一張新的地圖，河流和池塘的位置每次都不一樣。');
  }

  const date = dateAt(tick);
  const info = selected && engine.city.inspect(selected);
  const building = selected && engine.city.getBuilding(selected);
  const demoTile = (cell: Cell) => engine.city.map.get(cell);
  const shift = building && building.zone !== 'residential' ? workShift(building.zone, building.id) : undefined;
  const nextRank = milestones[stats.rank];
  const events = [...engine.city.getEvents()].reverse().slice(0, 4);
  const rush = rushShifts(hour).map(index => shifts[index].title);
  const setTax = (rate: number) => {
    engine.city.setTaxRate(rate);
    setStats(engine.city.getStats());
  };
  const problems = ISSUES.filter(issue => stats.complaints[issue] > 0)
    .sort((a, b) => stats.complaints[b] - stats.complaints[a]).slice(0, 3);
  const trouble = problems.length + (stats.idle > 0 ? 1 : 0);
  const pick = (value: Tool) => {
    activeTool.current = value;
    setTool(value);
    setMessage(toolTip(value));
    if (value !== 'line') {
      editingRef.current = undefined;
      setEditing(undefined);
    }
    rendererRef.current?.refresh?.();
  };
  const lines = engine.city.getLines();
  /** Runs something that changes the lines, then shows the result. */
  const changeLines = (action: () => { error?: string } | void, done: string) => {
    const result = action();
    setStats(engine.city.getStats());
    rendererRef.current?.refresh?.();
    setMessage(result?.error ?? done);
  };
  const editLine = (id: number | undefined) => {
    editingRef.current = id;
    setEditing(id);
    pick(id === undefined ? 'inspect' : 'line');
    if (id !== undefined) {
      editingRef.current = id;
      setEditing(id);
    }
  };
  const startLine = (kind: 'bus' | 'metro') => {
    const { id, error } = engine.city.addLine(kind);
    if (error) setMessage(error);
    else editLine(id);
    setStats(engine.city.getStats());
  };
  if (rendererRef.current) {
    rendererRef.current.onLineClick = cell => {
      const id = editingRef.current;
      if (id === undefined) return;
      const result = engine.city.toggleStop(id, cell);
      setStats(engine.city.getStats());
      rendererRef.current?.refresh?.();
      setMessage(result.error ?? (result.added ? '這一站加進路線了，繼續點下一站，或按「完成」。' : '這一站從路線拿掉了。'));
    };
  }

  const group = toolGroups[toolTab];

  return (
    <main className="game">
      <div className="viewport" ref={viewport} data-tool={tool} role="region" aria-label="城市地圖" />

      <header className="hud top">
        <div className="stat" title={`每月：稅收 ${money(stats.budget.tax)}，車票 ${money(stats.budget.fares)}，民生用品買賣 ${money(stats.budget.trade)}，維護費 ${money(stats.budget.upkeep)}，還款 ${money(stats.budget.loans)}。每天進帳一點。`}>
          <span>資金</span>
          <b>{money(stats.funds)}</b>
          <small className={stats.budget.net < 0 ? 'loss' : undefined}>每月 {stats.budget.net >= 0 ? '+' : ''}{money(stats.budget.net)}</small>
        </div>
        <div className="stat">
          <span>人口</span>
          <b>{stats.population.toLocaleString('en-US')} 人</b>
          <small>{rankNames[stats.rank]}{nextRank && `，滿 ${nextRank.population.toLocaleString('en-US')} 人升級`}</small>
        </div>
        <div className="stat demand" title="哪一種分區現在比較缺。越長越缺，劃了就會有人來蓋；空的代表已經夠了。">
          <span>缺什麼</span>
          {zones.map(([zone, label]) => (
            <label key={zone}>{label}
              <meter min={0} max={100} value={Math.max(0, stats.demand[zone])} />
            </label>
          ))}
        </div>
        <div className="clock">
          <b>{date.year} 年 {date.month} 月 {date.day} 日 {String(Math.floor(hour)).padStart(2, '0')}:{String(Math.floor(hour % 1 * 60)).padStart(2, '0')}</b>
          <span role="group" aria-label="時間快慢">
            {speeds.map(value => (
              <button key={value} type="button" aria-pressed={speed === value} onClick={() => {
                updateClock();
                clock.speed = value;
                setSpeed(value);
              }}>{value === 0 ? '暫停' : `${value}×`}</button>
            ))}
          </span>
        </div>
        <div className="menu" role="group" aria-label="城市">
          <button type="button" onClick={startNew}>新地圖</button>
          <button type="button" onClick={startDemo}>示範小鎮</button>
          <button type="button" onClick={() => void save()}>儲存</button>
          <button type="button" onClick={() => void load()}>讀取</button>
        </div>
      </header>

      <p className="hud toast" role="status" hidden={!message}>
        <span>{message}</span>
        <button type="button" aria-label="關閉訊息" onClick={() => setMessage('')}>×</button>
      </p>

      <aside className="hud side" aria-label="資料">
        <div className="tabs" role="tablist">
          {panelTabs.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={panelTab === value}
              onClick={() => setPanelTab(value)}>
              {label}{value === 'city' && trouble > 0 && <i>{trouble}</i>}
            </button>
          ))}
        </div>

        {panelTab === 'tile' && (selected && info ? <section>
          <h2>{info.complex ? '集合住宅' : info.bigPark ? '大公園' : tileNames[info.tile]}</h2>
          <dl>
            {info.building === false && <>
              <dt>狀況</dt><dd>{info.roadAccess ? '空地，等有人需要就會蓋' : '旁邊要有路才會蓋'}</dd>
            </>}
            {info.building && <>
              <dt>{info.tile === 'residential' ? '住了' : '員工'}</dt><dd>{info.occupants} / {info.capacity} 人</dd>
              <dt>等級</dt><dd>{info.level}{info.nextLevel === undefined ? '（最高）' : ''}</dd>
              {info.tile === 'residential' && <>
                <dt>有工作</dt><dd>{info.employed} / {info.occupants} 人</dd>
                <dt>上班路程</dt><dd>{info.commute === undefined ? '—' : `${Math.round(info.commute)} 分鐘`}</dd>
              </>}
              {shift && <><dt>上班時間</dt><dd>{shift.start}:00–{shift.end}:00</dd></>}
              <dt>水電</dt><dd>{info.power ? '有電' : '沒電'}、{info.water ? '有水' : '沒水'}</dd>
              <dt>附近有</dt><dd>{[...info.services.map(service => serviceNames[service]), ...(info.transit ? ['公車或捷運'] : [])].join('、') || '沒有服務'}</dd>
            </>}
            {info.parkTiles !== undefined && <>
              <dt>大小</dt><dd>{info.bigPark ? `共 ${info.parkTiles} 格，是一座大公園` :
                `連在一起的有 ${info.parkTiles} 格，滿 ${landValue.bigPark.tiles} 格會變成大公園`}</dd>
            </>}
            {info.value !== undefined && <>
              <dt>地價</dt><dd>{info.value}{info.building && info.nextLevel !== undefined && `（${info.nextLevel} 以上會升級）`}</dd>
            </>}
            {info.pollution !== undefined && info.pollution > 0 && <>
              <dt>污染</dt><dd>{info.pollution}{info.tile === 'residential' && info.pollution > pollution.limit && '（太髒，沒人要搬來）'}</dd>
            </>}
            {info.flow !== undefined && <>
              <dt>路況</dt><dd>{trafficName(info.congestion)}</dd>
              <dt>最忙時</dt><dd>{info.flow} 人經過（能走 {info.roadCapacity} 人）</dd>
            </>}
            {info.running === false && <>
              <dt>狀況</dt><dd>旁邊沒有路，沒有在運作</dd>
            </>}
            {info.lines !== undefined && <>
              <dt>路線</dt><dd>{info.lines.length ? info.lines.map(id => lineName(lines.find(line => line.id === id)!)).join('、') : '還沒有加進任何路線'}</dd>
            </>}
            {info.reaching !== undefined && <>
              <dt>範圍</dt><dd>{info.radius} 格，裡面有 {info.reaching} 棟建築</dd>
            </>}
            {info.serving !== undefined && <>
              <dt>供應</dt><dd>{info.serving} / {info.capacity} 棟</dd>
            </>}
            {info.tile !== 'grass' && info.tile !== 'river' && info.building === undefined && <>
              <dt>維護費</dt><dd>每月 {money(economy.upkeep[info.tile as keyof typeof economy.upkeep])}</dd>
            </>}
            {info.building && <>
              <dt>問題</dt><dd>{info.issues.length ? info.issues.map(issue => issueNames[issue]).join('、') : '沒有'}</dd>
            </>}
          </dl>
          {info.residents !== undefined && info.residents.length > 0 && <>
            <h2 className="sub">住在這裡的人</h2>
            <ul className="people">
              {info.residents.slice(0, 8).map((person, place) => <li key={place}>
                <b>{person.name}</b>
                <span>{person.shift === undefined ? '找工作中' : shifts[person.shift].title}</span>
                {person.trait && <i title={traitNames[person.trait][1]}>{traitNames[person.trait][0]}</i>}
              </li>)}
            </ul>
            {info.residents.length > 8 && <p className="hint">還有 {info.residents.length - 8} 位。</p>}
          </>}
        </section> : <p className="hint">在地圖上點一格，這裡會顯示它的資料。</p>)}

        {panelTab === 'city' && <>
          <section>
            <dl>
              <dt>工作</dt><dd>{stats.employed} 人有工作，共 {stats.jobs} 個職位</dd>
              <dt>上班路程</dt><dd>{stats.employed ? `平均 ${Math.round(stats.commute)} 分鐘` : '—'}</dd>
              <dt>路上</dt><dd>{rush.length ? `${rush.join('、')}正在上下班` : '現在車少'}</dd>
              <dt>搭車</dt><dd>{stats.riders} 人搭公車或捷運</dd>
              <dt>民生用品</dt>
              <dd>{stats.goods.needed === 0 ? '還沒有人需要' : stats.goods.made >= stats.goods.needed ?
                `夠用，多的賣出去每月賺 ${money(stats.goods.trade)}` :
                `不夠，每月花 ${money(-stats.goods.trade)} 從外面買`}</dd>
              {stats.goods.served < stats.goods.needed && <>
                <dt>商店</dt><dd className="full">不夠，有 {stats.goods.needed - stats.goods.served} 人買不到東西</dd>
              </>}
              <dt>借款</dt>
              <dd className="tax" title={`一次借 ${money(economy.loan.amount)}，之後 ${economy.loan.months} 個月每月還 ${money(economy.loan.payment)}。最多同時借 ${economy.loan.max} 筆。`}>
                {stats.loans.length} 筆
                <button type="button" className="wide" disabled={stats.loans.length >= economy.loan.max}
                  onClick={() => changeLines(() => engine.city.borrow(), `借到 ${money(economy.loan.amount)}，之後每月要還 ${money(economy.loan.payment)}。`)}>
                  借 {money(economy.loan.amount)}</button>
              </dd>
              <dt>稅率</dt>
              <dd className="tax" title="稅率越高每月收入越多，但太高大家就不想來蓋房子；調低則相反。">
                <button type="button" aria-label="調低稅率" disabled={stats.taxRate <= economy.taxRate.min}
                  onClick={() => setTax(stats.taxRate - 1)}>−</button>
                {stats.taxRate}%
                <button type="button" aria-label="調高稅率" disabled={stats.taxRate >= economy.taxRate.max}
                  onClick={() => setTax(stats.taxRate + 1)}>+</button>
              </dd>
            </dl>
          </section>
          <section>
            <h2>目前的問題</h2>
            {trouble ? <ul>
              {stats.idle > 0 && <li>有 {stats.idle} 座設施旁邊沒有路，沒有在運作</li>}
              {problems.map(issue => <li key={issue}>{issueNames[issue]}（{stats.complaints[issue]} 棟）</li>)}
            </ul> : <p className="hint">沒有問題。</p>}
          </section>
          <section>
            <h2>城裡的人</h2>
            {TRAITS.some(trait => stats.traits[trait] > 0) ? <ul>
              {TRAITS.filter(trait => stats.traits[trait] > 0).map(trait =>
                <li key={trait}>{traitNames[trait][0]} {stats.traits[trait]} 位：{traitNames[trait][1]}</li>)}
            </ul> : <p className="hint">大部分人很普通；有些人有自己的個性，會影響城市。</p>}
          </section>
          <TrendChart title="人口" points={trend(history, 'population')} format={value => `${Math.round(value).toLocaleString('en-US')} 人`} />
          <TrendChart title="資金" points={trend(history, 'funds')} format={money} />
          {demo && <section>
            <h2>試試看出狀況</h2>
            <div className="row">
              {demoTile(powerPlant) === 'power' ?
                <button type="button" onClick={() => command({ type: 'DEMOLISH', ...powerPlant },
                  '西邊的電廠關掉了，沒電的建築只能用一半。')}>關掉電廠</button> :
                <button type="button" onClick={() => command({ type: 'BUILD_FACILITY', ...powerPlant, facility: 'power' },
                  '電廠重新開了。')}>重開電廠</button>}
              {demoTile(waterTower) === 'water' ?
                <button type="button" onClick={() => command({ type: 'DEMOLISH', ...waterTower },
                  '西邊的水塔關掉了，沒水的建築只能用一半。')}>關掉水塔</button> :
                <button type="button" onClick={() => command({ type: 'BUILD_FACILITY', ...waterTower, facility: 'water' },
                  '水塔重新開了。')}>重開水塔</button>}
              {demoTile(works) === 'avenue' ?
                <button type="button" onClick={() => command({ type: 'DEMOLISH', ...works },
                  '通往工業區的大道封起來了，工廠的人到不了公司。')}>封閉大道</button> :
                <button type="button" onClick={() => command({ type: 'BUILD_ROAD', path: [works], road: 'avenue' },
                  '大道重新開放了。')}>開放大道</button>}
            </div>
          </section>}
        </>}

        {panelTab === 'lines' && <>
          {lines.length === 0 && <p className="hint">還沒有路線。先到下面「交通」蓋至少兩個站，再按這裡的按鈕把站連起來。</p>}
          {lines.map(line => {
            const spec = transit[line.kind];
            return <section key={line.id} className="line">
              <h2><i style={{ background: lineColourCss(line.id) }} />{lineName(line)}
                <button type="button" aria-label={`刪除${lineName(line)}`}
                  onClick={() => changeLines(() => {
                    if (editingRef.current === line.id) editLine(undefined);
                    engine.city.removeLine(line.id);
                  }, '路線刪掉了。站還留著，可以再用。')}>×</button>
              </h2>
              <dl>
                <dt>站</dt><dd>{line.stops.length} 個{!line.active && (line.stops.length < 2 ? '，至少要兩個才會跑' :
                  '，但站和站之間沒有路相通')}</dd>
                {line.active && <>
                  <dt>班次</dt><dd>每 {line.headway < 10 ? line.headway.toFixed(1) : Math.round(line.headway)} 分鐘一班</dd>
                  <dt>最忙時</dt><dd className={line.busiest >= line.capacity ? 'full' : undefined}>
                    載 {line.busiest} 人，最多 {line.capacity} 人{line.busiest >= line.capacity && '（客滿）'}</dd>
                  <dt>每天</dt><dd>{line.riders} 人搭</dd>
                </>}
                <dt>車輛</dt>
                <dd className="tax" title={`多一輛 ${money(spec.vehicleCost)}，每輛每月維護 ${money(spec.vehicleUpkeep)}。車越多班次越密，載得越多。`}>
                  <button type="button" aria-label="減少車輛" disabled={line.vehicles <= 1}
                    onClick={() => changeLines(() => engine.city.setVehicles(line.id, line.vehicles - 1), '少了一輛車。')}>−</button>
                  {line.vehicles} 輛
                  <button type="button" aria-label="增加車輛" disabled={line.vehicles >= transit.maxVehicles}
                    onClick={() => changeLines(() => engine.city.setVehicles(line.id, line.vehicles + 1),
                      `多了一輛車，花了 ${money(spec.vehicleCost)}。`)}>+</button>
                </dd>
              </dl>
              {editing === line.id ?
                <button type="button" aria-pressed="true" onClick={() => editLine(undefined)}>完成</button> :
                <button type="button" onClick={() => editLine(line.id)}>改站</button>}
            </section>;
          })}
          {lines.length < transit.maxLines && <div className="row">
            <button type="button" onClick={() => startLine('bus')}>新公車路線</button>
            <button type="button" onClick={() => startLine('metro')}>新捷運路線</button>
          </div>}
        </>}

        {panelTab === 'goals' && <ul className="goals">
          {goals.map(goal => {
            const done = stats.goals.includes(goal.id);
            return <li key={goal.id} className={done ? 'done' : undefined}>
              <b>{done ? '✓' : '□'} {goal.title}</b>
              <span>{done ? '完成了' : goal.hint} 獎金 {money(goal.reward)}</span>
            </li>;
          })}
        </ul>}

        {panelTab === 'log' && (events.length ? <ul>{events.map(event => {
          const day = dateAt(event.tick);
          return <li key={`${event.tick}-${event.kind}`}>{day.month} 月 {day.day} 日：{eventText[event.kind]}</li>;
        })}</ul> : <p className="hint">還沒有事情發生。城市超過 {services.fires.population} 人後，偶爾會失火、遭小偷或有人生病。</p>)}
      </aside>

      <div className="hud views" role="group" aria-label="地圖顯示">
        <span>地圖顯示</span>
        {overlays.map(([value, label, tip]) => (
          <button key={value} type="button" aria-pressed={overlay === value} onClick={() => {
            activeOverlay.current = value;
            setOverlay(value);
            setMessage(tip);
            rendererRef.current?.refresh?.();
          }}>{label}</button>
        ))}
      </div>

      <nav className="hud build" aria-label="工具">
        <div className="tray" role="group" aria-label={group[0]}>
          {group[1].map(([value, label]) => (
            <button key={value} type="button" data-tool={value} aria-pressed={tool === value} onClick={() => pick(value)}>
              <i style={iconStyle(value)} />
              <span>{label}</span>
              <small>{money(toolCost(value)!)}</small>
            </button>
          ))}
        </div>
        <div className="tabs">
          <button type="button" className="look" aria-pressed={tool === 'inspect'} title="快速鍵：Esc"
            onClick={() => pick('inspect')}>查看</button>
          {toolGroups.map(([name], index) => (
            <button key={name} type="button" role="tab" aria-selected={toolTab === index}
              onClick={() => setToolTab(index)}>{name}</button>
          ))}
        </div>
      </nav>

      {failed && <p className="hud toast" role="alert">地圖無法顯示。</p>}

      {stats.bankrupt && <div className="hud over" role="alertdialog" aria-label="破產">
        <h2>城市破產了</h2>
        <p>欠的錢超過 {money(-economy.bankrupt)}，什麼都蓋不了。可以借錢撐過去、回到之前存的城市，或是重新開始。</p>
        <div className="row">
          <button type="button" disabled={stats.loans.length >= economy.loan.max}
            onClick={() => changeLines(() => engine.city.borrow(), `借到 ${money(economy.loan.amount)}。`)}>借 {money(economy.loan.amount)}</button>
          <button type="button" onClick={() => void load()}>讀取</button>
          <button type="button" onClick={startNew}>新地圖</button>
        </div>
      </div>}

      <p className="dev">
        <button type="button" aria-pressed={debug} onClick={() => setDebug(!debug)}>開發用資料</button>
        {debug && <span>第 {tick} 步　每秒 {fps} 張畫面　每步計算 {tickMs.current.toFixed(3)} 毫秒</span>}
      </p>
    </main>
  );
}
