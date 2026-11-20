import { VehiclePanel } from './VehiclePanel';
import { cellFromId } from '../simulation/FacilityAccess';
import { weatherAt, weatherNames } from '../simulation/Weather';
import { AutosaveSession, type AutosaveStatus } from '../storage/AutosaveSession';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FreightPanel, type FreightActions } from './FreightPanel';
import { VisitorGroups } from './VisitorGroups';
import { visitReasons } from '../simulation/ActivityDiary';
import { needs as needLevels, needWords, eatingWords } from '../simulation/Needs';
import { delivery } from '../simulation/Delivery';
import { CityRenderer } from '../rendering/CityRenderer';
import { TrendChart, type TrendPoint } from './TrendChart';
import { lineColourCss, lineName } from './lineColours';
import { transit } from '../simulation/Transit';
import { landValue } from '../simulation/LandValue';
import type { Overlay, Tool } from './tools';
import type { Cell, Tile } from '../simulation/TileMap';
import { powerPlant, waterTower, works, type DemoSize } from './demoCity';
import { workShift, rushShifts, shifts } from '../simulation/WorkShift';
import { ISSUES, type Issue } from '../simulation/BuildingSystem';
import { cycle, economy, milestones, type Mood } from '../simulation/Economy';
import { dateAt, hourAt, weekdayAt } from '../simulation/calendar';
import { traffic } from '../simulation/Traffic';
import { pollution } from '../simulation/Pollution';
import { industryAt, industryNames } from '../simulation/Industry';
import { isService, MAP_SIZE, TILES } from '../simulation/TileMap';
import { SimulationClock, type SimulationSpeed } from '../simulation/SimulationClock';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { THEMES, type Theme } from '../simulation/SaveData';
import { AUTO_SLOT, BACKUP_SLOT, writeAutosave, deleteSave, listSaves, readSave, SLOTS, writeSlot, type SaveNote } from '../storage/SaveManager';
import { brands } from '../simulation/Dilemmas';
import { goals } from '../simulation/Goals';
import { COMBOS, taskList, type Combo } from '../simulation/Combos';
import { challenges, festivals, POLICIES, seasons, visitorsToday, type FestivalId, type Policy } from '../simulation/Seasons';
import { weekendAt } from '../simulation/calendar';
import { TRAITS } from '../simulation/Residents';
import { mind, thoughts as thoughtWeights, type Thought } from '../simulation/Mind';
import { bond, circle, PLACES } from '../simulation/Community';
import { vehicles } from '../simulation/Wealth';
import { speeds, toolGroups, iconStyle, panelTabs, type PanelTab, toolCost, toolTip, overlays, zones, visitable, demoList } from './menus';
import {
  moodNames, rankNames, percent, money, facilityUse, issueNames, issueHelp, tileNames, homeKindNames, eventText,
  traitNames, newsText, howLong, wayNames, vehicleNames, placeNames, bondWord, doingText, thoughtNames,
  thoughtTags, tradeNames, comboNames, PLACES_OF, nickNames, taskNames, seasonNames, festivalNames, policyNames,
  challengeNames, brandNames, dilemmaNames, themeNames, thoughtTone, moodWord, reasonNote, serviceNames, trafficName,
} from './wording';
import { land, parcelCentre } from '../simulation/Land';
import { Meter, PersonRow, Tag } from './Tag';

/** A new city on a map nobody has seen: the seed, and so the water, is different every time. */
function freshCity(): SimulationEngine {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const engine = new SimulationEngine({ version: 1, seed, tick: 0 });
  engine.city.map.generateTerrain(seed);
  engine.city.startExpansion();
  // Every new map wears one of the looks, by its seed.
  engine.city.theme = THEMES[seed % THEMES.length];
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
  const [message, setMessage] = useState('先鋪路，再在路旁劃住宅、商業、工業。');
  const [tick, setTick] = useState(0);
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const [engine] = useState(() => freshCity());
  const [clock] = useState(() => new SimulationClock(engine));
  const [stats, setStats] = useState(() => engine.city.getStats());
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>({ phase: 'loading' });
  const preserveBackup = useRef(false);
  const [autosave] = useState(() => new AutosaveSession({
    read: () => readSave(AUTO_SLOT), restore: data => engine.load(data),
    snapshot: () => ({ save: engine.save(), note: note() }),
    write: async ({ save, note: metadata }) => {
      await writeAutosave(save, metadata, preserveBackup.current);
      preserveBackup.current = false;
    }, now: () => Date.now(),
  }, setAutosaveStatus));
  const rendererRef = useRef<CityRenderer>(null);
  const lastTime = useRef(0);
  const tickMs = useRef(0);
  const [selected, setSelected] = useState<Cell>();
  // The resident whose card is open, by home and place in it.
  const [who, setWho] = useState<{ home: number; slot: number }>();
  // The thought whose sentence is shown, on a resident's card and in the city's voices.
  const [said, setSaid] = useState<Thought>();
  // The problem whose explanation is shown, and whether the list of ready-made cities is open.
  const [asked, setAsked] = useState<Issue>();
  const [choosing, setChoosing] = useState(false);
  // The city's look, kept here so the button shows it.
  const [look, setLook] = useState<Theme>(() => engine.city.theme);
  // The special group whose recipe is shown, and the tick of the last finished task that was announced.
  const knownTask = useRef(0);
  const knownCombos = useRef(0);
  const knownFeast = useRef(0);
  const knownDilemma = useRef(0);
  // The list of saves while it is open: what each slot holds.
  const [saves, setSaves] = useState<Record<string, SaveNote | null>>();
  const knownChallenge = useRef(0);
  // The festival or policy whose explanation is shown.
  const [about, setAbout] = useState<FestivalId | Policy>();
  const seenCombos = useRef<readonly Combo[]>([]);
  // What is framed on the map, and which of them the view is on.
  const spot = useRef({ key: '', index: 0 });
  const [debug, setDebug] = useState(false);
  const [fps, setFps] = useState(0);
  const [hour, setHour] = useState(() => hourAt(0));
  const [demo, setDemo] = useState(false);
  const activeOverlay = useRef<Overlay>('none');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const knownRank = useRef(0);
  const knownEvent = useRef(0);
  const knownGoals = useRef(0);
  const knownMood = useRef<Mood>('normal');
  const [buildOpen, setBuildOpen] = useState(true);
  const [viewsOpen, setViewsOpen] = useState(true);
  const [sideOpen, setSideOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolTab, setToolTab] = useState(0);
  const [panelTab, setPanelTab] = useState<PanelTab>('city');
  // The line whose stops are being picked on the map, if any.
  const [editing, setEditing] = useState<number>();
  const editingRef = useRef<number>(undefined);
  const [editingFreight, setEditingFreight] = useState<number>();
  const editingFreightRef = useRef<number>(undefined);
  const [selectedFreight, setSelectedFreight] = useState<string>();
  const [showAllFreight, setShowAllFreight] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<string>();
  // A sample of the city every five game days, for the charts. Kept for this visit only.
  const [history, setHistory] = useState<{ tick: number; population: number; funds: number }[]>([]);

  function updateClock() {
    setTick(step(engine, clock, lastTime, tickMs));
  }

  /** What the list of saves shows for the city as it is now. */
  function note(): SaveNote {
    const now = engine.city.getStats();
    return { population: now.totalPopulation, funds: now.funds, rank: now.rank, tick: engine.getSnapshot().tick, at: Date.now() };
  }

  async function openSaves() {
    try {
      setSaves(await listSaves());
    } catch {
      setMessage('讀不到存檔清單。');
    }
  }

  async function save(slot: string) {
    updateClock();
    try {
      await writeSlot(engine.save(), slot, note());
      setSaves(await listSaves());
      setMessage('存好了。');
    } catch (error) {
      console.error('Save failed', error);
      setMessage('存不起來，請再試一次。');
    }
  }

  async function load(slot: string) {
    let data: unknown;
    try {
      data = await readSave(slot);
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
    if (autosave.status.phase === 'failed') {
      preserveBackup.current = true;
      autosave.resumeAfterRecovery();
    }
    resetLoadedCity();
  }

  function resetLoadedCity() {
    editingFreightRef.current = undefined; setEditingFreight(undefined); setSelectedFreight(undefined);
    setSelectedVehicle(undefined); setShowAllFreight(false);
    activeTool.current = 'inspect'; setTool('inspect');
    clock.reset();
    lastTime.current = performance.now();
    setTick(engine.getSnapshot().tick);
    setStats(engine.city.getStats());
    knownRank.current = engine.city.getStats().rank;
    knownGoals.current = engine.city.getStats().goals.length;
    seenCombos.current = engine.city.getStats().combosSeen;
    knownCombos.current = seenCombos.current.length;
    knownMood.current = engine.city.getStats().mood;
    rendererRef.current?.refresh?.();
    setDemo(false);
    setSaves(undefined);
    if (rendererRef.current) {
      rendererRef.current.marks = [];
      rendererRef.current.focus = undefined;
    }
    rendererRef.current?.resetView?.();
    setMessage('讀好了。');
  }

  async function retryAutosave() {
    clock.suspended = true;
    try {
      const restored = await autosave.retry();
      if (restored) resetLoadedCity();
    } finally {
      clock.reset();
      lastTime.current = performance.now();
      clock.suspended = document.hidden;
      rendererRef.current?.setPlaying?.(!clock.suspended && clock.speed !== 0);
    }
  }

  useEffect(() => {
    lastTime.current = performance.now();
    const timer = window.setInterval(() => {
      const next = step(engine, clock, lastTime, tickMs);
      if (clock.interrupted) {
        clock.interrupted = false;
        setSpeed(0);
        setMessage('長時間離開後已暫停，按速度按鈕繼續。');
      }
      setTick(next);
      setHour(hourAt(next, clock.tickProgress));
    }, 100);
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
    clock.suspended = true;
    void autosave.initialize().then(restored => {
      if (cancelled) return;
      clock.reset();
      clock.suspended = document.hidden;
      lastTime.current = performance.now();
      const now = engine.city.getStats();
      knownRank.current = now.rank;
      knownGoals.current = now.goals.length;
      seenCombos.current = now.combosSeen;
      knownCombos.current = now.combosSeen.length;
      knownMood.current = now.mood;
      setTick(engine.getSnapshot().tick);
      setStats(now);
      rendererRef.current?.refresh?.();
      if (restored) rendererRef.current?.resetView?.();
      if (restored) setMessage('回到上次離開的城市。');
    });
    const keep = () => { void autosave.save(); };
    const timer = window.setInterval(keep, 15000);
    const onVisibility = () => {
      clock.suspended = document.hidden || autosave.status.phase === 'loading';
      clock.reset();
      lastTime.current = performance.now();
      rendererRef.current?.setPlaying?.(!clock.suspended && clock.speed !== 0);
      if (document.hidden) keep();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [engine, clock, autosave]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (rendererRef.current) {
      rendererRef.current.marks = [];
      rendererRef.current.focus = undefined;
    }
      activeTool.current = 'inspect';
      editingFreightRef.current = undefined;
      setEditingFreight(undefined);
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
      () => hourAt(engine.getSnapshot().tick, clock.tickProgress), () => activeOverlay.current, () => step(engine, clock, lastTime, tickMs));
    rendererRef.current = renderer;
    void renderer.mount(host, lifetime.signal, () => activeTool.current, message => {
      setMessage(message);
      setStats(engine.city.getStats());
    }, cell => {
      setSelectedVehicle(undefined);
      setWho(undefined);
      setSelected(cell);
      const match = /^tools:(\d+)(?::|$)/.exec(spot.current.key);
      if (!match || !renderer.focus) return;
      const map = engine.city.map;
      const anchor = map.anchorOf(cell) ?? cell;
      if (!renderer.focus(anchor)) return;
      const index = Number(match[1]);
      const station = map.hasStation(anchor) && toolGroups[index][1].some(([type]) => type === 'metro');
      const type = station ? 'metro' : map.get(anchor);
      if (type) highlightTools(index, type);
    }).then(() => {
      if (!lifetime.signal.aborted) renderer.setPlaying?.(!document.hidden && clock.speed !== 0);
    }).catch((error: unknown) => {
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
    rendererRef.current?.setPlaying?.(!document.hidden && speed !== 0);
  }, [speed]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.freightVisible = panelTab === 'freight';
    renderer.allFreightRoutes = showAllFreight;
    renderer.selectedFreight = selectedFreight;
    renderer.refresh?.();
  }, [panelTab, selectedFreight, editingFreight, showAllFreight]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.selectedVehicle = selectedVehicle;
    renderer.refresh?.();
  }, [selectedVehicle]);

  useEffect(() => {
    const next = engine.city.getStats();
    setStats(next);
    setLook(engine.city.theme);
    setHistory(past => {
      const last = past.at(-1);
      // Going back in time means another city was loaded: start the charts again.
      if (last && tick < last.tick) return [{ tick, population: next.population, funds: next.funds }];
      if (last && tick - last.tick < 40) return past;
      return [...past.slice(-179), { tick, population: next.population, funds: next.funds }];
    });
    if (next.rank > knownRank.current) {
      setMessage(`升級成「${rankNames[next.rank]}」，獎金 ${money(milestones[next.rank - 1].grant)}。`);
    }
    knownRank.current = next.rank;
    if (next.goals.length > knownGoals.current) {
      const goal = goals.find(candidate => candidate.id === next.goals.at(-1));
      if (goal) setMessage(`完成「${goal.title}」，獎金 ${money(goal.reward)}。`);
    }
    knownGoals.current = next.goals.length;
    const { taskDone, challengeEnd } = engine.city.getNotices();
    if (taskDone && taskDone.tick > knownTask.current) {
      const done = taskList.find(task => task.id === taskDone.id)!;
      setMessage(`完成任務「${taskNames[done.id]}」，獎金 ${money(done.reward)}。`);
    }
    knownTask.current = Math.max(knownTask.current, taskDone?.tick ?? 0);
    if (challengeEnd && challengeEnd.tick > knownChallenge.current) {
      setMessage(challengeEnd.won ?
        `限時挑戰「${challengeNames[challengeEnd.id]}」達成，獎金 ${money(challenges.list.find(entry => entry.id === challengeEnd.id)!.reward)}。` :
        `限時挑戰「${challengeNames[challengeEnd.id]}」沒趕上。`);
    }
    knownChallenge.current = Math.max(knownChallenge.current, challengeEnd?.tick ?? 0);
    const feast = engine.city.getFeasts().at(-1);
    if (feast && feast.tick > knownFeast.current) {
      setMessage(feast.income ? `今天是${festivalNames[feast.id][0]}，收入 ${money(feast.income)}。` :
        `今天是${festivalNames[feast.id][0]}，可惜城裡沒地方辦（${festivalNames[feast.id][1]}）。`);
    }
    knownFeast.current = Math.max(knownFeast.current, feast?.tick ?? 0);
    const { dilemmaEnd } = engine.city.getNotices();
    if (dilemmaEnd && dilemmaEnd.tick > knownDilemma.current && dilemmaEnd.answer < 0) {
      setMessage(`「${dilemmaNames[dilemmaEnd.id][0]}」沒人回覆，對方走了。`);
    }
    knownDilemma.current = Math.max(knownDilemma.current, dilemmaEnd?.tick ?? 0);
    if (next.combosSeen.length > knownCombos.current) {
      setMessage(`湊出「${comboNames[next.combosSeen.find(combo => !seenCombos.current.includes(combo)) ?? next.combosSeen[0]][0]}」，記進手冊了。`);
    }
    knownCombos.current = next.combosSeen.length;
    seenCombos.current = next.combosSeen;
    if (next.mood !== knownMood.current) {
      setMessage(next.mood === 'boom' ? '景氣變好：想來的人變多，稅收多一成。' :
        next.mood === 'slump' ? '景氣變差：店和工廠少請人，有人會丟工作。' : '景氣回到普通。');
    }
    knownMood.current = next.mood;
    const latest = engine.city.getEvents().at(-1);
    if (latest && latest.tick > knownEvent.current) {
      knownEvent.current = latest.tick;
      // Only what went wrong, and fires, interrupt; routine calls just go in the list.
      if (latest.kind.endsWith('-late') || latest.kind === 'fire' || latest.kind === 'fire-out' || latest.kind === 'crime' || latest.kind === 'robbery' || latest.kind === 'robbery-stopped' || latest.kind === 'sick') {
        setMessage(`${eventText[latest.kind]}。`);
      }
    }
    rendererRef.current?.refresh?.();
  }, [engine, tick]);

  /** Frames these tiles on the map and brings one into view; asking again for the same thing moves to the next. */
  function locate(key: string, cells: Cell[], focus?: (cell: Cell) => boolean) {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.marks = focus ? [] : cells;
    if (!key.startsWith('tools:')) renderer.focus = focus;
    if (!cells.length) {
      renderer.refresh?.();
      if (!key.startsWith('tools:')) setMessage('地圖上現在沒有。');
      return;
    }
    const index = spot.current.key === key ? (spot.current.index + 1) % cells.length : 0;
    spot.current = { key, index };
    renderer.lookAt?.(cells[index]);
    if (!focus && !key.startsWith('tools:')) setMessage(`已定位 ${index + 1} / ${cells.length}。`);
  }

  function selectMapTool(value: 'inspect' | 'demolish') {
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.focus = undefined;
      renderer.marks = [];
    }
    pick(value);
    if (value === 'inspect') setMessage('');
  }

  function selectToolTab(index: number) {
    setToolTab(index);
    setBuildOpen(true);
    pick('inspect');
    highlightTools(index);
  }

  function highlightTools(index: number, only?: Tile) {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const types = new Set<string>(only ? [only] : toolGroups[index][1].map(([type]) => type));
    const map = engine.city.map;
    const matches = (cell: Cell) => {
      const tile = map.get(cell);
      return tile !== undefined && (types.has(tile) ||
        (types.has('avenue') && tile === 'bridge') ||
        (types.has('metro') && map.hasStation(cell)));
    };
    renderer.focus = matches;
    renderer.marks = [];
    setMessage('');
    if (only) {
      spot.current = { key: `tools:${index}:${only}`, index: 0 };
      renderer.refresh?.();
      return;
    }
    const cells: Cell[] = [];
    for (let id = 0; id < MAP_SIZE ** 2; id++) {
      const cell = { x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) };
      if (matches(cell)) cells.push(cell);
    }
    spot.current = cells.length ? spot.current : { key: `tools:${index}`, index: 0 };
    locate(`tools:${index}`, cells);
  }

  /** Runs a command from a button rather than the map, then shows the result. */
  function command(action: Parameters<typeof engine.city.execute>[0], done: string) {
    const result = engine.city.execute(action);
    setStats(engine.city.getStats());
    rendererRef.current?.refresh?.();
    setMessage(result.error ?? done);
  }

  /** Asks before a city with anything on it is thrown away. */
  const mayReplace = (question: string) =>
    !engine.city.map.save().some(code => code !== 0 && TILES[code] !== 'river') || window.confirm(question);

  /** Swaps the whole city for another one. */
  function replaceCity(next: SimulationEngine, isDemo: boolean, done: string) {
    engine.load(next.save());
    editingFreightRef.current = undefined; setEditingFreight(undefined); setSelectedFreight(undefined);
    setSelectedVehicle(undefined); setShowAllFreight(false);
    activeTool.current = 'inspect'; setTool('inspect');
    clock.reset();
    lastTime.current = performance.now();
    // The demo town opens with some history behind it, so not everything starts from nothing.
    const opening = engine.city.getStats();
    setTick(engine.getSnapshot().tick);
    setHour(hourAt(engine.getSnapshot().tick));
    setDemo(isDemo);
    setSelected(undefined);
    setWho(undefined);
    rendererRef.current?.deselect?.();
    knownRank.current = opening.rank;
    knownEvent.current = engine.getSnapshot().tick;
    knownTask.current = engine.getSnapshot().tick;
    knownFeast.current = engine.getSnapshot().tick;
    knownDilemma.current = engine.getSnapshot().tick;
    knownChallenge.current = engine.getSnapshot().tick;
    knownGoals.current = opening.goals.length;
    seenCombos.current = opening.combosSeen;
    knownCombos.current = opening.combosSeen.length;
    if (rendererRef.current) {
      rendererRef.current.marks = [];
      rendererRef.current.focus = undefined;
    }
    knownMood.current = opening.mood;
    void autosave.save();
    setStats(engine.city.getStats());
    rendererRef.current?.refresh?.();
    rendererRef.current?.resetView?.();
    setMessage(done);
  }

  function startDemo(size: DemoSize) {
    if (!mayReplace('會蓋掉現在的地圖，確定嗎？')) return;
    setChoosing(false);
    const done = size === 'small' ? '交給你了。先過橋，把東岸的水電、警察、消防補上。' :
      size === 'medium' ? '交給你了。過東邊那條河，對岸的新街區還沒有水電、警察、消防。' :
      '交給你了。往南過紅色大橋，海灣對岸的新街區還沒有水電、警察、消防。';
    const open = (save: unknown) => {
      const sample = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
      sample.load(save as ReturnType<SimulationEngine['save']>);
      replaceCity(sample, true, done);
    };
    setMessage('正在打開城市…');
    // The city was built and saved when the game was (tools/build-demos.mjs), so it only has to be read.
    fetch(`./demo/${size}.json`).then(reply => reply.json()).then(save => open({ ...save, tiles: Uint8Array.from(save.tiles) })).catch(() => {
      // No saved city to read, as when the game is run straight from its source: build it now.
      // The larger ones live through years first, so that is done off the page, which stays alive.
      setMessage('正在蓋城市…');
      const builder = new Worker(new URL('./demoWorker.ts', import.meta.url), { type: 'module' });
      const failed = () => {
        builder.terminate();
        setMessage('城市蓋不起來，請再試一次。');
      };
      builder.onerror = failed;
      builder.onmessage = event => {
        builder.terminate();
        try { open(event.data); } catch { failed(); }
      };
      builder.postMessage(size);
    });
  }

  function startNew() {
    if (mayReplace('會丟掉現在的城市，確定嗎？')) replaceCity(freshCity(), false, '新地圖。先鋪路，再在路旁劃分區。');
  }

  const date = dateAt(tick);
  const info = useMemo(() => selected && engine.city.inspect(selected), [engine, selected, stats, tick]);
  const monthlyVisits = selected && engine.city.visitCountAt(selected);
  const siteSummary = selected && engine.city.siteSummary(selected);
  const meals = engine.city.deliveriesToday();
  const roadNow = selected ? rendererRef.current?.crowdOn?.(selected) ?? 0 : 0;
  const crowd = selected && panelTab === 'tile' && !who ? engine.city.crowdAt(selected, clock.tickProgress) : undefined;
  const visitors = selected && info && panelTab === 'tile' && !who && visitable.includes(info.tile) ?
    engine.city.visitorGroupsAt(selected, clock.tickProgress) : undefined;
  const parked = selected && visitors ? engine.city.carsAt(selected) : undefined;
  const building = selected && engine.city.getBuilding(selected);
  const demoTile = (cell: Cell) => engine.city.map.get(cell);
  const shift = building && building.zone !== 'residential' ? workShift(building.zone, building.id) : undefined;
  const nextRank = milestones[stats.rank];
  // The resident being looked at. The map moves people slower than the clock runs, so while it
  // shows them on the road, that is what they are doing.
  const seen = who && engine.city.person(who.home, who.slot, hour);
  const trip = seen && seen.jobId >= 0 ? rendererRef.current?.tripOf?.(seen.homeId, seen.jobId) : undefined;
  const doing = !seen ? undefined : trip === 'to-work' || trip === 'to-home' ? trip :
    seen.doing === 'to-work' && trip === 'work' ? 'working' :
    seen.doing === 'to-home' && trip === 'home' ? 'home' : seen.doing;
  const pickPerson = (person: { homeId: number; slot: number }) => { setSelectedVehicle(undefined); setWho({ home: person.homeId, slot: person.slot }); };
  const voices = useMemo(() => panelTab === 'city' ? engine.city.voices() : undefined, [engine, panelTab, stats, tick]);
  const worries = voices?.thoughts.filter(([thought]) => thoughtWeights[thought] < 0).slice(0, 3) ?? [];
  const joys = voices?.thoughts.filter(([thought]) => thoughtWeights[thought] > 0 && thought !== 'new-here').slice(0, 2) ?? [];
  // The sentence on show: the picked thought if this person has it, or else their first.
  const spoken = seen && (said && seen.thoughts.includes(said) ? said : seen.thoughts[0]);
  const personCard = seen && doing && <section className="person">
    <button type="button" className="back" onClick={() => setWho(undefined)}>← 回上一頁</button>
    <h2>{seen.name}</h2>
    <div className="tags">
      <Tag label={`${seen.age} 歲`} />
      {seen.trait && <Tag label={traitNames[seen.trait][0]} tip={traitNames[seen.trait][1]} />}
      {seen.kids > 0 && <Tag label="小孩" value={seen.kids} />}
      {seen.birthday && <Tag label="今天生日" tone="good" tip="附近有蛋糕店的話，家裡會有人去買蛋糕" />}
      {seen.school && <Tag label={seen.school === 'university' ? '讀過大學' : '讀過高中'} tone="good"
        tip={seen.school === 'university' ? '家在大學範圍內，薪水多兩成五' : '家在高中範圍內，薪水多一成'} />}
    </div>
    <dl className="meters">
      <dt>心情</dt>
      <Meter full={seen.mood} word={moodWord(seen.mood)} tone={seen.mood >= mind.glad ? 'good' : seen.mood < mind.low ? 'bad' : 'mid'}
        tip="想的事情好的多就開心，壞的多就不開心。看最下面「心裡在想」" />
      <dt>飽足</dt>
      <Meter full={100 - seen.needs.hunger} word={needWords.hunger(seen.needs.hunger)}
        tone={seen.needs.hunger >= 75 ? 'bad' : seen.needs.hunger >= needLevels.hungry ? 'mid' : 'good'}
        tip={seen.needs.wantsFood ? '這一餐想在外面吃：附近有市場、烘焙坊、大型商場或夜市就會去' : '三餐多半在家或公司吃；有時會想出門吃'} />
      <dt>體力</dt>
      <Meter full={100 - seen.needs.fatigue} word={needWords.fatigue(seen.needs.fatigue)}
        tone={seen.needs.tired ? 'bad' : seen.needs.fatigue >= 60 ? 'mid' : 'good'}
        tip={seen.needs.tired ? '太累了，除了接送小孩不會再出門' : '上班久、通勤遠、家裡小孩多、年紀大，都會比較累'} />
      <dt>社交</dt>
      <Meter full={100 - seen.needs.social} word={needWords.social(seen.needs.social)}
        tone={seen.needs.lonely ? 'bad' : seen.needs.social >= 20 ? 'mid' : 'good'}
        tip={seen.needs.lonely ? '好幾天沒遇到人，會先去社區中心、廟、KTV 或夜市' : '在同一個地方一起活動就會認識人'} />
    </dl>
    <dl>
      <dt>現在</dt>
      <dd title={seen.activityReason}>{doingText(doing, seen.shift, seen.way)}
        {seen.activityWhy && reasonNote[seen.activityWhy] && `（${reasonNote[seen.activityWhy]}）`}
        {seen.weatherReason && <small>{seen.weatherReason}</small>}</dd>
      <dt>住在</dt><dd className="tags">{seen.kind ? homeKindNames[seen.kind][0] : '一般住宅'}，{howLong(seen.days)}
        <Tag label="定位" tip="把地圖移到這個人的家" onPick={() => rendererRef.current?.lookAt?.(cellFromId(seen.homeId))} /></dd>
      <dt>吃飯</dt>
      <dd title={eatingWords[seen.eating][1]}>{eatingWords[seen.eating][0]}{seen.rider &&
        <span title={`還在騎腳踏車或機車的人，沒上班、不太累的時候會接單送餐。每單賺 ${money(delivery.fee)}，但會更累`}>
          ，兼職外送{seen.rider.runs ? `（今天跑 ${seen.rider.runs} 趟）` : ''}</span>}</dd>
      <dt>健康</dt><dd>{seen.waitingFor ? `${tileNames[seen.waitingFor]}客滿，在家等候看診` : seen.health ? seen.health.state === 'recovering' ? '康復中，正在休養' : seen.health.severe ? '需要醫院治療' : '身體不舒服，安排休息或就醫' : '健康'}</dd>
      <dt>工作</dt>
      <dd className="tags">{seen.age >= 65 ? '已退休（基本年金支應生活）' : seen.shift === undefined ? '尋找中' :
        `${shifts[seen.shift].title} ${shifts[seen.shift].start}–${shifts[seen.shift].end} 點，${howLong(seen.workDays ?? 0)}`}
        {seen.jobId >= 0 && <Tag label="定位" tip="把地圖移到這個人上班的地方" onPick={() => rendererRef.current?.lookAt?.(cellFromId(seen.jobId))} />}</dd>
      {seen.way && seen.minutes !== undefined && <>
        <dt>上班</dt><dd>{wayNames[seen.way]} {Math.max(1, Math.round(seen.minutes))} 分鐘</dd>
      </>}
      <dt>錢</dt>
      <dd>日薪 {money(seen.pay)}，{seen.bank ? '銀行存款' : '現金'} {money(seen.money)}</dd>
      <dt>車子</dt>
      <dd>{vehicleNames[seen.car]}
        {seen.car > 0 && <span title={`牌照稅、油錢${seen.car >= 2 ? `、停車費（${{ lot: '停車場，歸城市', garage: '大樓地下室', kerb: '門口路邊，免費' }[seen.parking]}）` : ''}。付不起就會賣掉`}>
          ，養車每天 {money(seen.keep)}</span>}
        {vehicles[seen.car + 1] && <small>存到 {money(vehicles[seen.car + 1].price)} 會換{vehicleNames[seen.car + 1]}</small>}</dd>
    </dl>
    <h2 className="sub">今天的活動</h2>
    {seen.activities.length ? <ol className="activity-diary">{[...seen.activities].sort((a, b) => a.started - b.started).map(entry => {
      const minutes = Math.round(hourAt(entry.started) * 60) % 1440;
      return <li key={`${entry.started}:${entry.destination}`}>
        <time>{String(Math.floor(minutes / 60)).padStart(2, '0')}:{String(minutes % 60).padStart(2, '0')}</time>
        <span title={visitReasons[entry.reason]}>{doingText(entry.doing, undefined, undefined)}</span>
        <small>{[reasonNote[entry.reason], entry.arrived === undefined && '路上'].filter(Boolean).join('・')}</small>
      </li>;
    })}</ol> : <p className="hint">今天還沒有外出活動紀錄。</p>}
    <h2 className="sub">認識的人</h2>
    <div className="tags">{seen.contacts.length ? seen.contacts.map(contact => <Tag key={contact.id}
      label={contact.name} value={contact.label} tip={`熟悉度 ${contact.familiarity}/100`}
      onPick={() => pickPerson(contact)} />) : <span>還沒有熟悉的鄰居，去公共場所一起活動會慢慢認識人。</span>}</div>
    <h2 className="sub">心裡在想</h2>
    <div className="tags">
      {seen.thoughts.map(thought => <Tag key={thought} label={thoughtTags[thought]} tone={thoughtTone(thought)}
        picked={thought === spoken} onPick={() => setSaid(thought)} />)}
    </div>
    <p className="said">{spoken ? `「${thoughtNames[spoken]}」` : ''}</p>
  </section>;
  // What happened lately, to buildings and to people, newest first.
  const lifeEventText = { birth: '出生了', adult: '成年了，開始新的人生階段', retired: '退休了', ill: '身體不適，需要照護', recovered: '恢復健康', death: '離世了', care: '安排了新的照護' };
  const happenings: { tick: number; text: string; cell?: Cell }[] = [
    ...engine.city.life.events.map(event => ({ tick: event.tick, text: `${event.name}${lifeEventText[event.kind]}` })),
    ...engine.city.getEvents().map(event => ({ tick: event.tick, text: eventText[event.kind], cell: event.cell })),
    ...engine.city.getNews().map(item => ({ tick: item.tick, text: newsText(item) })),
    ...engine.city.getFeasts().map(item => ({ tick: item.tick,
      text: item.income ? `${festivalNames[item.id][0]}，收入 ${money(item.income)}` : `${festivalNames[item.id][0]}沒辦成` })),
  ].sort((a, b) => b.tick - a.tick).slice(0, 14);
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
    if (value !== 'freight-line') { editingFreightRef.current = undefined; setEditingFreight(undefined); }
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
    rendererRef.current.follow = seen && seen.jobId >= 0 ? `${seen.homeId}:${seen.jobId}` : undefined;
    rendererRef.current.followVisitor = who;
    rendererRef.current.onPerson = (homeId, person) => {
      const slot = 'slot' in person ? person.slot : engine.city.personOn(homeId, person.workId);
      if (slot === undefined) return;
      setSelectedVehicle(undefined);
      setWho({ home: homeId, slot });
      setPanelTab('tile');
    };
    rendererRef.current.onLineClick = cell => {
      const id = editingRef.current;
      if (id === undefined) return;
      const result = engine.city.toggleStop(id, cell);
      setStats(engine.city.getStats());
      rendererRef.current?.refresh?.();
      setMessage(result.error ?? (result.added ? '加進路線了。' : '拿掉了。'));
    };
  }

  const locateFreight = useCallback((cell: Cell) => {
    editingFreightRef.current = undefined; setEditingFreight(undefined);
    activeTool.current = 'inspect';
    setTool('inspect');
    editingRef.current = undefined;
    setEditing(undefined);
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.focus = undefined;
    renderer.marks = [];
    renderer.lookAt?.(cell);
  }, []);
  const freightActions = useMemo<FreightActions>(() => {
    const update = (error: string | undefined, done: string) => {
      setStats(engine.city.getStats());
      rendererRef.current?.refresh?.();
      setMessage(error ?? done);
    };
    const edit = (id?: number) => {
      editingFreightRef.current = id; setEditingFreight(id);
      editingRef.current = undefined; setEditing(undefined);
      activeTool.current = id === undefined ? 'inspect' : 'freight-line';
      setTool(activeTool.current);
      if (id !== undefined) setSelectedFreight(`manual:${id}`);
      setPanelTab('freight');
      setMessage(id === undefined ? '' : '先點工業區工廠，再依序點商業區店鋪；再次點選移除，選另一座工廠可更換起點。');
      rendererRef.current?.refresh?.();
    };
    return {
      mode: mode => { const result = engine.city.setFreightMode(mode); edit(); setSelectedFreight(undefined); update(result.error, mode === 'manual' ? '手動配送：新增物流路線後選擇工廠與配送商店。' : '已切回自動配送，手動路線設定仍會保留。'); },
      create: () => { const result = engine.city.addFreightLine(); if (result.id !== undefined) edit(result.id); update(result.error, '已新增物流路線。先在地圖點工業區工廠，再點商業區店鋪。'); },
      remove: id => { if (editingFreightRef.current === id) edit(); engine.city.removeFreightLine(id); setSelectedFreight(undefined); update(undefined, '物流路線已刪除。'); },
      vehicles: (id, count) => { const result = engine.city.setFreightVehicles(id, count); update(result.error, count ? '物流配車已更新。' : '這條物流路線已停駛。'); },
      edit,
      stop: (id, cell) => { const result = engine.city.toggleFreightStop(id, cell); update(result.error, result.added ? '已更新物流站點。' : '站點已移除。'); },
      select: (key, cell) => { edit(); setSelectedFreight(key); const renderer = rendererRef.current; if (renderer) { renderer.selectedFreight = key; renderer.freightVisible = true; } locateFreight(cell); },
      locate: cell => { setSelectedFreight(undefined); locateFreight(cell); },
      showAll: setShowAllFreight,
    };
  }, [engine, locateFreight]);
  if (rendererRef.current) rendererRef.current.onFreightClick = cell => {
    const id = editingFreightRef.current;
    if (id !== undefined) freightActions.stop(id, cell);
  };
  if (rendererRef.current) rendererRef.current.onVehicle = key => {
    setSelectedVehicle(key); setWho(undefined); setSelected(undefined); setPanelTab('tile');
  };
  const vehicle = selectedVehicle ? rendererRef.current?.getVehicle?.(selectedVehicle) : undefined;
  const vehicleCard = selectedVehicle ? <VehiclePanel vehicle={vehicle} onClose={() => setSelectedVehicle(undefined)}
    onLocate={cell => rendererRef.current?.lookAt?.(cell)} onRoute={info => {
      if (info.kind === 'freight' && info.routeKey) { setShowAllFreight(false); freightActions.select(info.routeKey, info.cell); }
      else { setPanelTab('lines'); activeOverlay.current = 'lines'; setOverlay('lines'); rendererRef.current?.refresh?.(); }
    }} /> : undefined;
  const freightReport = useMemo(() => panelTab === 'freight' ? engine.city.getLogistics() : undefined, [engine, panelTab, stats, tick, hour]);
  const group = toolGroups[toolTab];

  return (
    <main className="game" data-side-open={sideOpen}>
      {autosaveStatus.phase === 'loading' && <div className="load-shield" role="status">正在讀取城市…</div>}
      {autosaveStatus.error && <div className="save-warning" role="alert">{autosaveStatus.error}
        {autosaveStatus.phase === 'failed' && <button type="button" onClick={() => void retryAutosave()}>重試讀取</button>}
      </div>}
      <div className="viewport" ref={viewport} data-tool={tool} role="region" aria-label="城市地圖" />

      <header className="hud top">
        <div className="clock">
          <div className="stat when">
            <span>{date.year} 年 {date.month} 月 {date.day} 日・星期{'一二三四五六日'[weekdayAt(tick)]}</span>
            <b>{String(Math.floor(hour)).padStart(2, '0')}:{String(Math.floor(hour % 1 * 60)).padStart(2, '0')}</b>
            <small>{seasonNames[stats.season][0]}</small>
          </div>
          <span className="speed-controls" role="group" aria-label="時間快慢">
            {speeds.map(value => (
              <button key={value} type="button" aria-pressed={speed === value} onClick={() => {
                updateClock();
                clock.speed = value;
                setSpeed(value);
              }}>{value === 0 ? '暫停' : `${value}×`}</button>
            ))}
          </span>
        </div>
        <div className="city-status">
          <div className="stat weather">
            <span>天氣</span>
            <b>{weatherNames[weatherAt(engine.getSnapshot().seed, tick)]}</b>
            <small>明天{weatherNames[weatherAt(engine.getSnapshot().seed, tick + 8)]}</small>
          </div>
          <div className="stat funds" title={`每月：稅收 ${money(stats.budget.tax)}，車票 ${money(stats.budget.fares)}，牌照稅 ${money(stats.budget.licence)}，油稅 ${money(stats.budget.fuel)}，停車費 ${money(stats.budget.parking)}，景點 ${money(stats.budget.visitors)}，民生用品買賣 ${money(stats.budget.trade)}，維護費 ${money(stats.budget.upkeep)}，還款 ${money(stats.budget.loans)}。每天進帳一點。`}>
            <span>資金</span>
            <b>{money(stats.funds)}</b>
            <small className={stats.budget.net < 0 ? 'loss' : undefined}>每月 {stats.budget.net >= 0 ? '+' : ''}{money(stats.budget.net)}</small>
          </div>
          <div className="stat people" title={`兒童 ${stats.children} 人，退休 ${stats.retired} 人。${nextRank ? `滿 ${nextRank.population.toLocaleString('en-US')} 人會升一級。` : ''}`}>
            <span>人口</span>
            <b>{stats.totalPopulation.toLocaleString('en-US')} 人</b>
            <small>{rankNames[stats.rank]}{nextRank && ` → ${nextRank.population.toLocaleString('en-US')}`}</small>
          </div>
          <div className="stat demand" title="住宅、商業、工業各有多少人想來；越滿越缺">
            <span>需求</span>
            <div>
              {zones.map(([zone, label]) => (
                <label key={zone}>{label}
                  <meter min={0} max={100} value={Math.max(0, stats.demand[zone])} />
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="menu" role="group" aria-label="城市">
          <button type="button" aria-pressed={saves !== undefined} onClick={() => saves ? setSaves(undefined) : void openSaves()}>存檔</button>
          <button type="button" aria-expanded={menuOpen} aria-controls="city-menu" onClick={() => setMenuOpen(open => !open)}>選單 {menuOpen ? '▴' : '▾'}</button>
        </div>
      </header>
      {menuOpen && <div className="hud menu-list" id="city-menu" role="group" aria-label="選單">
        <button type="button" onClick={() => { setMenuOpen(false); startNew(); }}>新地圖</button>
        <button type="button" onClick={() => { setMenuOpen(false); setChoosing(true); }}>示範城市</button>
        <button type="button" title="換一種城市風格（只換外觀）" onClick={() => {
          engine.city.theme = THEMES[(THEMES.indexOf(engine.city.theme) + 1) % THEMES.length];
          setLook(engine.city.theme);
          setMessage(`風格：${themeNames[engine.city.theme]}。`);
          rendererRef.current?.refresh?.();
        }}>風格：{themeNames[look]}</button>
      </div>}

      <p className="hud toast" role="status" hidden={!message}>
        <span>{message}</span>
        <button type="button" aria-label="關閉訊息" onClick={() => setMessage('')}>×</button>
      </p>

      <button type="button" className="hud panel-toggle panel-toggle-side" aria-controls="side-panel" aria-expanded={sideOpen} title={sideOpen ? '收起資料' : '打開資料'} onClick={() => setSideOpen(open => !open)}>{sideOpen ? '▸' : '◂ 資料'}</button>
      <aside className="hud side" aria-label="資料" id="side-panel" hidden={!sideOpen}>
        <div className="tabs" role="tablist">
          {panelTabs.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={panelTab === value}
              onClick={() => setPanelTab(value)}>
              {label}{value === 'city' && trouble > 0 && <i>{trouble}</i>}{value === 'tasks' && stats.tasks.length + (stats.challenge ? 1 : 0) > 0 && <i>{stats.tasks.length + (stats.challenge ? 1 : 0)}</i>}
            </button>
          ))}
        </div>

        <div className="side-content" key={panelTab}>
        {panelTab === 'tile' && (info?.tile === 'cityhall' || info?.tile === 'bank') && <section>
          <h2>{info.tile === 'cityhall' ? '市政廳' : '銀行'}</h2>
          {info.tile === 'cityhall' ? <>
            <p>目前稅率 {stats.taxRate}%</p>
            <button type="button" onClick={() => setTax(stats.taxRate - 1)}>調低稅率</button>
            <button type="button" onClick={() => setTax(stats.taxRate + 1)}>調高稅率</button>
            <button type="button" onClick={() => setPanelTab('city')}>城市政策</button>
          </> : <>
            <p>同一路網、10 格內的居民可存款，月利率 0.5%。</p>
            <p>每月還款 {money(stats.budget.loans)} · 月淨收入 {money(stats.budget.net)}</p>
            {stats.loans.length > 0 && <ul>{stats.loans.map((months, index) =>
              <li key={index}>第 {index + 1} 筆 · 剩 {months} 期 · {money(months * economy.loan.payment)}</li>)}</ul>}
            <button type="button" onClick={() => changeLines(() => engine.city.borrow(), `借到 ${money(economy.loan.amount)}。`)}>借 {money(economy.loan.amount)}</button>
          </>}
        </section>}
        {panelTab === 'tile' && (vehicleCard ? vehicleCard : personCard ? personCard : selected && info ? <section>
          <h2>{info.brand ? brandNames[info.brand] : info.nick ? nickNames[info.nick] : info.combo && PLACES_OF.includes(info.combo) ? comboNames[info.combo][0] :
            info.complex ? '集合住宅' : info.bigPark ? '大公園' : info.kind ? homeKindNames[info.kind][0] : info.tile === 'industrial' && info.building ? industryNames[industryAt(selected)] : info.tile === 'commercial' && building ? workShift('commercial', building.id).title : tileNames[info.tile]}</h2>
          {info.kind && <p className="hint">{homeKindNames[info.kind][1]}</p>}
          <dl>
            {facilityUse[info.tile] && <>
              <dt>設施用途</dt>
              <dd>{facilityUse[info.tile]}</dd>
            </>}
            {siteSummary && siteSummary.tiles > 1 && <>
              <dt>整座範圍</dt><dd>{siteSummary.tiles} 格</dd>
              {siteSummary.capacity > 0 && <><dt>整座住戶</dt><dd>{siteSummary.occupants}／{siteSummary.capacity} 人（下面是這一戶）</dd></>}
            </>}
            {monthlyVisits !== undefined && <>
              <dt>本月來訪</dt>
              <dd>{monthlyVisits.toLocaleString('zh-TW')} 人次</dd>
            </>}
            {visitors && <VisitorGroups key={`${selected.x}:${selected.y}`} {...visitors}
              activityLabel={doing => doingText(doing, undefined, undefined)}
              onPick={visit => setWho({ home: visit.home, slot: visit.slot })} />}
            {crowd && <>
              <dt>容量</dt>
              <dd className="tags">
                <Tag label={crowd.busy >= crowd.seats ? '客滿' : '還有位子'} value={`${crowd.busy}/${crowd.seats} 人`}
                  tone={crowd.busy >= crowd.seats ? 'bad' : undefined} tip="裡面的人加上正在路上的人，最多容納這麼多" />
                {crowd.turnedAway > 0 && <Tag label="擠不進去" value={`${crowd.turnedAway} 人`} tone="bad"
                  tip="這個小時想來、但已經客滿的人。他們會改去別家或做別的事；生病的人會在家等。附近再蓋一間可以分散人潮" />}
              </dd>
            </>}
            {parked && <>
              <dt>車位</dt>
              <dd className="tags">
                <Tag label={parked.cars >= parked.spaces ? '停滿' : '還有車位'} value={`${Math.min(parked.cars, parked.spaces)}/${parked.spaces} 台`}
                  tone={parked.cars >= parked.spaces ? 'bad' : undefined}
                  tip="開車來的人要有地方停：門口路邊 2 台，大的地方自己有停車場，2 格內每蓋一座停車場多 12 台。機車不占車位" />
                {parked.looking > 0 && <Tag label="找不到車位" value={`${parked.looking} 台`} tone="bad"
                  tip="這個小時開車來、但車位已滿的人。他們會在附近多繞一段路找位子，路上的車也跟著變多。2 格內蓋一座停車場就能解決" />}
              </dd>
            </>}
            {info.brand && <>
              <dt>招牌</dt>
              <dd className="tags"><Tag label={brandNames[info.brand]} tone="good" /><Tag label="收入" value={`${money(brands[info.brand])}/月`} tone="good" /></dd>
            </>}
            {engine.city.combosAt(selected).length > 0 && <>
              <dt>組合</dt>
              <dd className="tags">{engine.city.combosAt(selected).map(combo =>
                <Tag key={combo} label={comboNames[combo][0]} tone="good" tip={comboNames[combo][1]} />)}
                {info.comboEarns ? <Tag label="收入" value={`${money(info.comboEarns)}/月`} tone="good" /> : null}</dd>
            </>}
            {(() => {
              const stock = engine.city.foodStockAt(selected);
              const seats = engine.city.daycareSeatsAt(selected);
              const riders = engine.city.transferRidersAt(selected);
              return stock === undefined && seats === undefined && !riders ? null : <>
                <dt>運作</dt>
                <dd className="tags">
                  {stock !== undefined && <Tag label={stock === 0 && info.tile === 'market' ? '食材缺貨' : '食材庫存'}
                    value={stock} tone={stock ? 'good' : 'dim'} />}
                  {seats !== undefined && <Tag label="托兒名額" value={seats} />}
                  {!!riders && <Tag label="轉乘人次" value={riders} tone="good" />}
                </dd>
              </>;
            })()}
            {info.building === false && <>
              <dt>狀況</dt>
              <dd className="tags">{info.roadAccess ? <Tag label="空地" tip="有人需要就會蓋" /> :
                <Tag label="沒貼路" tone="bad" tip="旁邊要有路才會蓋" />}</dd>
            </>}
            {info.building && <>
              <dt>{info.tile === 'residential' ? '住戶' : '員工'}</dt>
              <dd className="tags">
                <Tag label="人" value={`${info.occupants}/${info.capacity}`} />
                <Tag label="等級" value={info.complex ? '集合' : info.level} tone={info.nextLevel === undefined ? 'good' : undefined} />
                {info.tile === 'residential' && <Tag label="有工作" value={info.employed} tip="點一下，在地圖上框出他們上班的地方"
                  tone={info.employed < info.occupants ? 'bad' : undefined}
                  onPick={() => locate(`works:${selected.x},${selected.y}`, engine.city.find({ worksOf: selected }))} />}
              </dd>
              {info.tile === 'residential' && <>
                <dt>上班</dt>
                <dd className="tags"><Tag label="平均" value={info.commute === undefined ? '—' : `${Math.round(info.commute)} 分`}
                  tone={(info.commute ?? 0) > traffic.longCommute ? 'bad' : undefined} /></dd>
              </>}
              {shift && <><dt>班別</dt><dd className="tags"><Tag label={shift.title} value={`${shift.start}–${shift.end} 點`} /></dd></>}
              {info.tile !== 'residential' && <>
                <dt>生意</dt>
                <dd className="tags">
                  <Tag label={info.trade ? tradeNames[info.trade][0] : '普通'} tip={info.trade ? tradeNames[info.trade][1] : '薪水照常'}
                    tone={info.trade === 'quiet' ? 'bad' : info.trade ? 'good' : undefined} />
                  {info.custom !== undefined && <Tag label="客人" value={info.custom} tip="住在 6 格內、會來這裡買東西的人" />}
                </dd>
              </>}
              <dt>水電</dt>
              <dd className="tags"><Tag label={info.power ? '有電' : '沒電'} tone={info.power ? undefined : 'bad'} />
                <Tag label={info.water ? '有水' : '沒水'} tone={info.water ? undefined : 'bad'} /></dd>
              <dt>服務</dt>
              <dd className="tags">{info.services.map(service => <Tag key={service} label={serviceNames[service]} />)}
                {info.transit && <Tag label="車站" />}
                {!info.services.length && !info.transit && <Tag label="都沒有" tone="bad" />}</dd>
            </>}
            {info.parkTiles !== undefined && <>
              <dt>大小</dt>
              <dd className="tags"><Tag label={info.bigPark ? '大公園' : '公園'} value={`${info.parkTiles} 格`}
                tone={info.bigPark ? 'good' : undefined} tip={`連滿 ${landValue.bigPark.tiles} 格是大公園`} /></dd>
            </>}
            {info.grows !== undefined && <>
              <dt>收成</dt>
              <dd className="tags"><Tag label="每月" value={`${info.grows} 份`} tone={info.grows ? undefined : 'bad'} />
                <Tag label={info.watered ? '靠水' : '離水遠'} tone={info.watered ? 'good' : 'dim'} tip="離水 3 格內收成三倍" /></dd>
            </>}
            {info.value !== undefined && <>
              <dt>地價</dt>
              <dd className="tags"><Tag label={String(info.value)} />
                {info.building && info.nextLevel !== undefined && <Tag label="升級要" value={info.nextLevel} tone="dim" />}</dd>
            </>}
            {info.pollution !== undefined && info.pollution > 0 && <>
              <dt>污染</dt>
              <dd className="tags"><Tag label={String(info.pollution)} tone={info.pollution > pollution.limit ? 'bad' : undefined}
                tip={`超過 ${pollution.limit} 沒人要住`} /></dd>
            </>}
            {info.flow !== undefined && <>
              <dt>路況</dt>
              <dd className="tags">
                <Tag label="現在" value={trafficName(roadNow)} tone={roadNow > 1 ? 'bad' : undefined}
                  tip="地圖上這一格現在有多少車、有沒有被前車擋住，跟「車流」顯示的顏色一致" />
                <Tag label="尖峰" value={`${trafficName(info.congestion)} ${info.flow}/${info.roadCapacity}`}
                  tone={info.congestion > 1 ? 'bad' : 'dim'} tip="一天裡最忙那一班：會經過這格的人數／這條路順暢時能走的人數。超過就會有人遲到" /></dd>
            </>}
            {info.running === false && <>
              <dt>狀況</dt><dd className="tags"><Tag label="沒貼路" tone="bad" tip="旁邊沒有路，沒有在運作" /></dd>
            </>}
            {info.lines !== undefined && <>
              <dt>路線</dt>
              <dd className="tags">{info.lines.length ? info.lines.map(id => <Tag key={id} label={lineName(lines.find(line => line.id === id)!)} />) :
                <Tag label="還沒加進路線" tone="dim" />}</dd>
            </>}
            {info.reaching !== undefined && <>
              <dt>範圍</dt>
              <dd className="tags"><Tag label="半徑" value={`${info.radius} 格`} /><Tag label="照顧" value={`${info.reaching} 棟`} /></dd>
            </>}
            {info.earns !== undefined && <>
              <dt>遊客</dt>
              <dd className="tags"><Tag label="收入" value={`${money(info.earns)}/月`} tone="good" />
                <Tag label={info.parked ? '有停車場' : '沒停車場'} tone={info.parked ? 'good' : 'dim'} tip="4 格內有停車場，遊客多兩成五" /></dd>
            </>}
            {info.shoppers !== undefined && <>
              <dt>買東西</dt><dd className="tags"><Tag label="夠" value={`${info.shoppers} 人`} /></dd>
            </>}
            {info.serving !== undefined && <>
              <dt>供應</dt><dd className="tags"><Tag label="棟" value={`${info.serving}/${info.capacity}`} /></dd>
            </>}
            {info.tile !== 'grass' && info.tile !== 'river' && info.building === undefined && <>
              <dt>維護</dt>
              <dd className="tags"><Tag label="每月" value={money(economy.upkeep[info.tile as keyof typeof economy.upkeep])} /></dd>
            </>}
            {info.building && <>
              {info.kids && info.kids.length > 0 && <>
                <dt>小孩</dt>
                <dd className="tags">{info.kids.map((kid, at) => <Tag key={at} label={kid.name} value={`${kid.age} 歲`} />)}</dd>
              </>}
              {info.circle && info.bond !== undefined && <>
                <dt title={`走路 ${circle.reach} 格內有什麼；灰色的是沒有的`}>生活圈</dt>
                <dd className="tags">{PLACES.map(place => <Tag key={place} label={placeNames[place]}
                  tone={info.circle!.includes(place) ? 'good' : 'dim'} />)}</dd>
                <dt>鄰居</dt>
                <dd className="tags">{info.occupants ?
                  <Tag label={`感情${bondWord(info.bond)}`} tone={info.bond >= bond.close ? 'good' : undefined}
                    value={info.bond >= bond.close ? `地價 +${bond.value}` : undefined}
                    tip="住得久、附近有廟或公園、有熱心的住戶，感情就會變好" /> : <Tag label="還沒人住" tone="dim" />}</dd>
              </>}
              <dt>問題</dt>
              <dd className="tags">{info.issues.length ?
                info.issues.map(issue => <Tag key={issue} label={issueNames[issue]} tone="bad"
                  picked={issue === asked} onPick={() => setAsked(issue)} />) : <Tag label="沒有" tone="good" />}</dd>
            </>}
          </dl>
          {info.building && info.issues.length > 0 && <p className="said">
            {asked && info.issues.includes(asked) ? issueHelp[asked] : '點問題看怎麼解決。'}</p>}
          {info.residents !== undefined && info.residents.length > 0 && <>
            <h2 className="sub">住在這裡的人</h2>
            <ul className="people">
              {info.residents.slice(0, 16).map(person => <PersonRow key={`${person.homeId}:${person.slot}`} person={person} onPick={pickPerson} />)}
            </ul>
            {info.residents.length > 16 && <p className="hint">還有 {info.residents.length - 16} 位。</p>}
          </>}
          {info.staff !== undefined && info.staff.length > 0 && <>
            <h2 className="sub">在這裡上班的人</h2>
            <ul className="people">
              {info.staff.slice(0, 16).map(person => <PersonRow key={`${person.homeId}:${person.slot}`} person={person} atWork onPick={pickPerson} />)}
            </ul>
            {info.staff.length > 16 && <p className="hint">還有 {info.staff.length - 16} 位。</p>}
          </>}
        </section> : <p className="hint">在地圖上點一格。</p>)}

        {panelTab === 'city' && <>
          <section>
            <h2>概況</h2>
            <dl>
              <dt>人口</dt>
              <dd className="tags"><Tag label="兒童" value={stats.children} /><Tag label="退休" value={stats.retired} /></dd>
              <dt>工作</dt>
              <dd className="tags"><Tag label="有工作" value={stats.employed} /><Tag label="職位" value={stats.jobs} /></dd>
              <dt>上班</dt>
              <dd className="tags">
                <Tag label="平均" value={stats.employed ? `${Math.round(stats.commute)} 分` : '—'} />
                <Tag label="搭車" value={stats.riders} tip="搭公車或捷運上班的人" />
              </dd>
              <dt>通勤狀態</dt>
              <dd className="tags"><Tag label={rush[0] ?? '沒有人'} tone={rush.length ? undefined : 'dim'} tip="現在哪一班的人在上下班" /></dd>
              <dt>遲到</dt>
              <dd className="tags"><Tag label="受壅塞影響" value={`${stats.late} 人`} tone={stats.late ? 'bad' : 'dim'}
                tip="上班被塞住的人會遲到，當天薪水少一成" /></dd>
              <dt>價格</dt>
              <dd className="tags" title="油價和物資價格會自己波動；物價在城市到過 400 人後，景氣好漲、景氣差跌。">
                <Tag label="油" value={percent(stats.prices.fuel)} tone={stats.prices.fuel >= 1.2 ? 'bad' : stats.prices.fuel <= 0.85 ? 'good' : undefined}
                  tip="有車的人每天的油錢；有加油站城市抽三成" />
                <Tag label="物資" value={percent(stats.prices.goods)} tip="民生用品賣出去和買進來的價錢" />
                <Tag label="物價" value={percent(stats.prices.level)} tone={stats.prices.level > 1.001 ? 'bad' : stats.prices.level < 0.999 ? 'good' : 'dim'}
                  tip="蓋東西、維護費、稅收、薪水都跟著物價；錢放著會變薄，借的錢會變輕" />
              </dd>
              <dt>車子</dt>
              <dd className="tags" title="存夠錢就買車，每台每月繳牌照稅">
                {stats.cars.slice(1).map((count, index) => <Tag key={index} label={vehicleNames[index + 1]} value={count}
                  tone={count ? undefined : 'dim'} />)}
                <Tag label="牌照稅" value={`${money(stats.budget.licence)}/月`} tone={stats.budget.licence ? 'good' : 'dim'} />
                <Tag label="油稅" value={`${money(stats.budget.fuel)}/月`} tone={stats.budget.fuel ? 'good' : 'dim'} tip="要有加油站才收得到" />
                <Tag label="停車費" value={`${money(stats.budget.parking)}/月`} tone={stats.budget.parking ? 'good' : 'dim'}
                  tip="住家 2 格內有停車場，車主的月費就歸城市" />
              </dd>
              <dt>景氣</dt>
              <dd className="tags">{stats.rank < cycle.rank ?
                <Tag label="尚未啟用" tone="dim" tip={`城市到過 ${cycle.population} 人以後，景氣會有好有壞`} /> :
                <Tag label={moodNames[stats.mood][0]} tip={moodNames[stats.mood][1]}
                  tone={stats.mood === 'boom' ? 'good' : stats.mood === 'slump' ? 'bad' : undefined} />}</dd>
              <dt>外送</dt>
              <dd className="tags" title="常叫外送的人，想外食的那一餐會從家附近的商店叫餐，由有空的居民兼職送">
                <Tag label="今天" value={`${meals.orders} 單`} tone={meals.orders ? undefined : 'dim'} />
                <Tag label="外送員" value={`${meals.riders} 人`} tone={meals.riders ? undefined : 'dim'} tip="今天有接單的居民" />
                <Tag label="沒人送" value={`${meals.unfilled} 單`} tone={meals.unfilled ? 'bad' : 'dim'}
                  tip="家附近沒有商店，或商店附近沒有外送員有空。在住宅旁邊劃商業區可以改善" />
              </dd>
              <dt>用品</dt>
              <dd className="tags" title="工廠和農田做民生用品；多的賣掉，不夠要買">
                {stats.goods.made >= stats.goods.needed ?
                  <><Tag label="夠用" tone={stats.goods.needed ? 'good' : 'dim'} /><Tag label="外銷" value={`+${money(stats.goods.trade)}/月`} /></> :
                  <><Tag label="不夠" tone="bad" /><Tag label="進口" value={`−${money(-stats.goods.trade)}/月`} tone="bad" /></>}
                <Tag label="市內貨運" value={`${engine.city.getFreight().reduce((sum, run) => sum + run.trucks, 0)} 趟／月`}
                  tip="查看物流總覽、補貨缺口與配送路線" onPick={() => { setPanelTab('freight'); setSideOpen(true); }} />
                <Tag label="農田" value={stats.goods.farmed} tone={stats.goods.farmed ? undefined : 'dim'} tip="農田每月種出來的份數" />
                <Tag label="購物需求未滿足" value={`${stats.goods.needed - stats.goods.served} 人`}
                  tone={stats.goods.served < stats.goods.needed ? 'bad' : 'dim'} tip="商店不夠，這麼多人買不到東西" />
              </dd>
              <dt>借款</dt>
              <dd className="tax" title={`一次借 ${money(economy.loan.amount)}，之後 ${economy.loan.months} 個月每月還 ${money(economy.loan.payment)}。最多同時借 ${economy.loan.max} 筆。`}>
                {stats.loans.length} 筆
                <button type="button" className="wide" disabled={stats.loans.length >= economy.loan.max}
                  onClick={() => changeLines(() => engine.city.borrow(), `借到 ${money(economy.loan.amount)}，之後每月要還 ${money(economy.loan.payment)}。`)}>
                  借 {money(economy.loan.amount)}</button>
              </dd>
              <dt>稅率</dt>
              <dd className="tax" title="越高收入越多，但想來的人越少">
                <button type="button" aria-label="調低稅率" disabled={stats.taxRate <= economy.taxRate.min}
                  onClick={() => setTax(stats.taxRate - 1)}>−</button>
                {stats.taxRate}%
                <button type="button" aria-label="調高稅率" disabled={stats.taxRate >= economy.taxRate.max}
                  onClick={() => setTax(stats.taxRate + 1)}>+</button>
              </dd>
            </dl>
          </section>
          <section>
            <h2>行事曆</h2>
            <div className="tags">
              <Tag label={seasonNames[stats.season][0]} tip={seasonNames[stats.season][1]} />
              <Tag label={weekendAt(tick) ? '假日' : '平日'} value={`遊客 ×${visitorsToday(tick)}`}
                tone={weekendAt(tick) ? 'good' : undefined} tip={`假日遊客收入 ×${seasons.weekend}，平日 ×${seasons.weekday}`} />
              <Tag label={festivalNames[stats.festival.id][0]} value={stats.festival.days ? `${stats.festival.days} 天後` : '今天'}
                tone={stats.festival.ready ? 'good' : 'bad'} picked={about === stats.festival.id}
                onPick={() => setAbout(stats.festival.id)} />
              {stats.boost !== 0 && <Tag label="人氣" value={`${stats.boost > 0 ? '+' : ''}${stats.boost}`}
                tone={stats.boost > 0 ? 'good' : 'bad'} tip="之前的決定，讓三種分區比較多或比較少人想來" />}
            </div>
            <h2 className="sub">政策</h2>
            <div className="tags">
              {POLICIES.map(policy => <Tag key={policy} label={policyNames[policy][0]} picked={stats.policies.includes(policy)}
                onPick={() => {
                  engine.city.setPolicy(policy, !stats.policies.includes(policy));
                  setStats(engine.city.getStats());
                  setAbout(policy);
                  rendererRef.current?.refresh?.();
                }} />)}
            </div>
            <p className="said">{!about ? `${seasonNames[stats.season][1]}。點政策開關。` :
              about in policyNames ? policyNames[about as Policy][1] :
              `${festivals.find(entry => entry.id === about)!.month} 月 ${festivals.find(entry => entry.id === about)!.day} 日。${festivalNames[about as FestivalId][1]}。${stats.festival.ready || about !== stats.festival.id ? '' : '現在還辦不成。'}`}</p>
          </section>
          <section>
            <h2>目前的問題</h2>
            <div className="tags two">
              {stats.idle > 0 && <Tag label="設施沒貼路" value={stats.idle} tone="bad" tip="旁邊沒有路，沒有在運作"
                onPick={() => locate('idle', engine.city.find({ idle: true }))} />}
              {problems.map(issue => <Tag key={issue} label={issueNames[issue]} value={`${stats.complaints[issue]} 棟`} tone="bad"
                picked={issue === asked} onPick={() => {
                  setAsked(issue);
                  locate(`issue:${issue}`, engine.city.find({ issue }));
                }} />)}
              {!trouble && <Tag label="沒有問題" tone="good" />}
            </div>
            <p className="said">{asked && problems.includes(asked) ? issueHelp[asked] : problems.length ? '點問題：看怎麼解決，地圖也會框出來。' : ''}</p>
          </section>
          <section>
            <h2>居民心聲</h2>
            {voices?.people ? <>
              <div className="tags two">
                <Tag label="心情" value={moodWord(voices.mood)} tone={voices.mood >= mind.glad ? 'good' : voices.mood < mind.low ? 'bad' : undefined} />
                <Tag label="鄰居感情" value={bondWord(voices.bond)} />
                {[...worries, ...joys].map(([thought, count]) => <Tag key={thought} label={thoughtTags[thought]} value={count}
                  tone={thoughtTone(thought)} picked={thought === said} onPick={() => setSaid(thought)} />)}
              </div>
              <p className="said">{said && [...worries, ...joys].some(([thought]) => thought === said) ?
                `「${thoughtNames[said]}」` : '點標籤看大家怎麼說。'}</p>
            </> : <p className="hint">還沒有人住進來。</p>}
          </section>
          <section>
            <h2>城裡的人</h2>
            <div className="tags">
              {TRAITS.filter(trait => stats.traits[trait] > 0).map(trait =>
                <Tag key={trait} label={traitNames[trait][0]} value={stats.traits[trait]} tip={traitNames[trait][1]}
                  onPick={() => locate(`trait:${trait}`, engine.city.find({ trait }))} />)}
              {!TRAITS.some(trait => stats.traits[trait] > 0) && <Tag label="都很普通" tone="dim" />}
            </div>
          </section>
          <TrendChart title="人口" points={trend(history, 'population')} format={value => `${Math.round(value).toLocaleString('en-US')} 人`} />
          <TrendChart title="資金" points={trend(history, 'funds')} format={money} />
          {demo && <section>
            <h2>出狀況試試</h2>
            <div className="row">
              {demoTile(powerPlant) === 'power' ?
                <button type="button" onClick={() => command({ type: 'DEMOLISH', ...powerPlant },
                  '電廠關了。')}>關掉電廠</button> :
                <button type="button" onClick={() => command({ type: 'BUILD_FACILITY', ...powerPlant, facility: 'power' },
                  '電廠重新開了。')}>重開電廠</button>}
              {demoTile(waterTower) === 'water' ?
                <button type="button" onClick={() => command({ type: 'DEMOLISH', ...waterTower },
                  '水塔關了。')}>關掉水塔</button> :
                <button type="button" onClick={() => command({ type: 'BUILD_FACILITY', ...waterTower, facility: 'water' },
                  '水塔重新開了。')}>重開水塔</button>}
              {demoTile(works) === 'avenue' ?
                <button type="button" onClick={() => command({ type: 'DEMOLISH', ...works },
                  '大道封了，工廠的人到不了。')}>封閉大道</button> :
                <button type="button" onClick={() => command({ type: 'BUILD_ROAD', path: [works], road: 'avenue' },
                  '大道重新開放了。')}>開放大道</button>}
            </div>
          </section>}
        </>}

        {panelTab === 'freight' && freightReport && <FreightPanel report={freightReport} actions={freightActions} selected={selectedFreight} editing={editingFreight} showAll={showAllFreight} />}

        {panelTab === 'lines' && <>
          {lines.length === 0 && <p className="hint">先在「交通」蓋兩個站，再按下面的按鈕連起來。</p>}
          {lines.map(line => {
            const spec = transit[line.kind];
            return <section key={line.id} className="line">
              <h2><i style={{ background: lineColourCss(line.id) }} />{lineName(line)}
                <button type="button" aria-label={`刪除${lineName(line)}`}
                  onClick={() => changeLines(() => {
                    if (editingRef.current === line.id) editLine(undefined);
                    engine.city.removeLine(line.id);
                  }, '路線刪了，站還在。')}>×</button>
              </h2>
              <dl>
                <dt>站</dt>
                <dd className="tags"><Tag label="站" value={line.stops.length} />
                  {!line.active && <Tag label={line.stops.length < 2 ? '要兩站' : '站不相通'} tone="bad" />}</dd>
                {line.active && <>
                  <dt>載客</dt>
                  <dd className="tags">
                    <Tag label="班距" value={`${line.headway < 10 ? line.headway.toFixed(1) : Math.round(line.headway)} 分`} />
                    {line.kind === 'bus' && line.delay >= 0.1 && <Tag label="塞車多花" value={`${Math.round(line.delay)} 分／單程`} tone="bad" />}
                    <Tag label="最忙" value={`${line.busiest}/${line.capacity}`} tone={line.busiest >= line.capacity ? 'bad' : undefined}
                      tip="最忙時載的人／最多能載" />
                    <Tag label="每天" value={`${line.riders} 人`} />
                  </dd>
                </>}
                <dt>車輛</dt>
                <dd className="tax" title={`一輛 ${money(spec.vehicleCost)}，每月 ${money(spec.vehicleUpkeep)}`}>
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

        {panelTab === 'tasks' && stats.challenge && <section className="timed">
          <h2>限時：{challengeNames[stats.challenge.id]}到 {stats.challenge.target}</h2>
          <div className="tags">
            <Tag label="現在" value={stats.challenge.now} />
            <Tag label="剩" value={`${Math.max(0, Math.ceil((stats.challenge.until - tick) / 8))} 天`} tone="bad" />
            <Tag label="獎金" value={money(challenges.list.find(entry => entry.id === stats.challenge!.id)!.reward)} tone="good" />
          </div>
        </section>}
        {panelTab === 'tasks' && (stats.tasks.length ? stats.tasks.map(({ id, left }) => {
          const task = taskList.find(entry => entry.id === id)!;
          return <section key={id}>
            <h2>{taskNames[id]}</h2>
            <div className="tags">
              <Tag label={issueNames[task.issue]} value={`${left} 棟`} tone="bad" />
              <Tag label="降到" value={`${task.to} 棟`} />
              <Tag label="獎金" value={money(task.reward)} tone="good" />
            </div>
            <button type="button" className="go" onClick={() => locate(`issue:${task.issue}`, engine.city.find({ issue: task.issue }))}>◎ 定位</button>
            <p className="said">{issueHelp[task.issue]}</p>
          </section>;
        }) : !stats.challenge && <p className="hint">現在沒有任務。城市出問題時，居民會來拜託。</p>)}

        {panelTab === 'goals' && <ul className="goals">
          {[...goals].sort((a, b) => Number(stats.goals.includes(a.id)) - Number(stats.goals.includes(b.id))).map(goal => {
            const done = stats.goals.includes(goal.id);
            return <li key={goal.id} className={done ? 'done' : undefined}>
              <b>{done ? '✓' : '□'} {goal.title}</b>
              {!done && <span>{goal.hint}</span>}
              <span className="tags"><Tag label="獎金" value={money(goal.reward)} tone={done ? 'dim' : 'good'} /></span>
            </li>;
          })}
        </ul>}

        {panelTab === 'book' && <>
          <p className="hint count">已發現 {stats.combosSeen.length} / {COMBOS.length}</p>
          <ul className="goals">
            {[...COMBOS].sort((a, b) => Number(stats.combosSeen.includes(b)) - Number(stats.combosSeen.includes(a))).map(combo => {
              const known = stats.combosSeen.includes(combo);
              const count = stats.combos[combo];
              return <li key={combo} className={known ? undefined : 'done'}>
                <b>{known ? comboNames[combo][0] : '？？？'}</b>
                <span>{comboNames[combo][known ? 1 : 2]}</span>
                {known && <span className="tags"><Tag label="成立中" value={count} tone={count ? 'good' : 'dim'}
                  onPick={count ? () => locate(`combo:${combo}`, engine.city.find({ combo }), cell => engine.city.hasCombo(cell, combo)) : undefined} />
                  {!count && <Tag label="待恢復" tone="dim" />}</span>}
              </li>;
            })}
          </ul>
        </>}

        {panelTab === 'log' && (happenings.length ? <ol className="log">{happenings.map((item, index) => {
          const day = dateAt(item.tick);
          const before = index > 0 ? dateAt(happenings[index - 1].tick) : undefined;
          const sameDay = before && before.year === day.year && before.month === day.month && before.day === day.day;
          const cell = item.cell;
          return <li key={`${item.tick}-${index}`} className={sameDay ? 'same' : undefined}>
            <time>{sameDay ? '' : `${day.month} 月 ${day.day} 日`}</time>
            <span>{item.text}</span>
            {cell && <button type="button" className="go" title="在地圖上找到這裡" onClick={() => {
              pick('inspect');
              locate(`event:${item.tick}:${cell.x},${cell.y}`, [cell]);
            }}>◎ 定位</button>}
          </li>;
        })}</ol> : <p className="hint">還沒有事情發生。</p>)}
        </div>
      </aside>

      <button type="button" className="hud panel-toggle panel-toggle-views" aria-controls="views-panel" aria-expanded={viewsOpen} onClick={() => setViewsOpen(open => !open)}><span>地圖顯示</span><span aria-hidden="true">{viewsOpen ? '▾' : '▴'}</span></button>
      <div className="hud views" role="group" aria-label="地圖顯示" id="views-panel" hidden={!viewsOpen}>
        {overlays.map(([value, label, tip]) => (
          <button key={value} type="button" aria-pressed={overlay === value} onClick={() => {
            activeOverlay.current = value;
            setOverlay(value);
            setMessage(tip);
            rendererRef.current?.refresh?.();
          }}>{label}</button>
        ))}
      </div>

      {tool === 'land' && <section className="hud land-purchase" aria-label="買地擴張">
        <h2>買地擴張</h2>
        <p>每區 32×32 格，只能買共邊相鄰的土地。點地圖或下方區塊購買。</p>
        <div className="land-grid">
          {engine.city.getLand().map(plot => <button type="button" key={plot.id} data-parcel={plot.id}
            disabled={!plot.available || stats.funds < plot.price} aria-label={`第 ${plot.id + 1} 區${plot.owned ? '，已擁有' : `，${money(plot.price)}`}`}
            className={plot.owned ? 'owned' : ''} onClick={() => {
              const result = engine.city.buyLand(plot.id);
              setStats(engine.city.getStats());
              setMessage(result.error ?? `買下第 ${plot.id + 1} 區，花了 ${money(result.cost)}。`);
              rendererRef.current?.refresh?.();
            }}>
            <span>第 {plot.id + 1} 區</span><small>{plot.owned ? '已擁有' : plot.available ? money(plot.price) : '未相鄰'}</small>
          </button>)}
        </div>
        <button type="button" onClick={() => pick('inspect')}>完成</button>
      </section>}
      <nav className="hud build" aria-label="工具">
        <div className="tray" role="group" aria-label={group[0]} id="build-panel" hidden={!buildOpen}>
          {group[1].map(([value, label]) => {
            // Bigger buildings open up as the city passes its population milestones.
            const locked = isService(value) ? engine.city.lockedUntil(value) : undefined;
            return <button key={value} type="button" data-tool={value} aria-pressed={tool === value}
              disabled={locked !== undefined} onClick={() => {
                pick(value);
                highlightTools(toolTab, value as Tile);
              }}>
              <i style={iconStyle(value)} />
              <span>{label}</span>
              <small>{locked !== undefined ? `滿 ${milestones[locked - 1].population.toLocaleString('en-US')} 人` :
                money(toolCost(value)! * stats.prices.level)}</small>
            </button>;
          })}
        </div>
        <div className="tabs">
          <button type="button" className="look" aria-pressed={tool === 'inspect'} title="快速鍵：Esc"
            onClick={() => selectMapTool('inspect')}>查看</button>
          <button type="button" aria-pressed={tool === 'land'} onClick={() => {
            pick('land');
            rendererRef.current?.lookAt?.(parcelCentre(land.start));
          }}>買地</button>
          <button type="button" className="remove" aria-pressed={tool === 'demolish'}
            onClick={() => selectMapTool('demolish')}>拆除</button>
          {toolGroups.map(([name], index) => (
            <button key={name} type="button" role="tab" aria-selected={toolTab === index}
              onClick={() => selectToolTab(index)}>{name}</button>
          ))}
          <button type="button" className="fold" aria-controls="build-panel" aria-expanded={buildOpen}
            title={buildOpen ? '收起工具' : '打開工具'} onClick={() => setBuildOpen(open => !open)}>{buildOpen ? '▾' : '▴'}</button>
        </div>
      </nav>

      {choosing && <div className="hud over pick" role="dialog" aria-label="示範城市">
        <h2>示範城市</h2>
        <div className="cards">
          {demoList.map(([size, name, people, has]) => <button key={size} type="button" onClick={() => startDemo(size)}>
            <b>{name}</b>
            <span>{people}</span>
            <span className="tags">{has.map(item => <Tag key={item} label={item} />)}</span>
          </button>)}
        </div>
        <button type="button" onClick={() => setChoosing(false)}>取消</button>
      </div>}

      {stats.dilemma && <div className="hud card" role="dialog" aria-label="突發事件">
        <h2>突發事件<small>剩 {Math.max(0, Math.ceil((stats.dilemma.until - tick) / 8))} 天</small></h2>
        <p>{dilemmaNames[stats.dilemma.id][0]}</p>
        {([0, 1] as const).map(answer => {
          const [word, effect] = dilemmaNames[stats.dilemma!.id][answer + 1] as [string, string];
          return <button key={answer} type="button" onClick={() => {
            engine.city.decide(answer);
            setStats(engine.city.getStats());
            const opened = engine.city.getNotices().dilemmaEnd?.opened;
            // A business that opens is framed on the map, so it can be found.
            if (opened) {
              const brand = engine.city.inspect(opened)?.brand;
              locate(`brand:${brand}`, [opened]);
              if (brand) setMessage(`${brandNames[brand]}開在黃框那間店，每月多 ${money(brands[brand])}。`);
            } else setMessage(`${word}：${effect}。`);
            rendererRef.current?.refresh?.();
          }}><b>{word}</b><span>{effect}</span></button>;
        })}
      </div>}

      {saves && <div className="hud over files" role="dialog" aria-label="存檔">
        <h2>存檔</h2>
        <p role="status">{autosaveStatus.lastSaved ? `最近自動存檔：${new Date(autosaveStatus.lastSaved).toLocaleTimeString('zh-TW')}` : '尚未完成本次自動存檔'}</p>
        <ul>
          {[...SLOTS, AUTO_SLOT, BACKUP_SLOT, 'manual'].map((slot, index) => {
            const held = slot in saves;
            const kept = saves[slot];
            const own = index < SLOTS.length;
            if (!own && !held) return null;
            const day = kept && dateAt(kept.tick);
            return <li key={slot} className={held ? undefined : 'empty'}>
              <b>{own ? `第 ${index + 1} 格` : slot === AUTO_SLOT ? '自動' : slot === BACKUP_SLOT ? '上次自動備份' : '舊存檔'}</b>
              {kept && day ? <span className="tags">
                <Tag label={rankNames[kept.rank]} value={`${kept.population.toLocaleString('en-US')} 人`} />
                <Tag label="資金" value={money(kept.funds)} />
                <Tag label={`${day.year} 年 ${day.month} 月 ${day.day} 日`} />
                <Tag label="存於" value={new Date(kept.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} tone="dim" />
              </span> : <span className="tags"><Tag label={held ? '有存檔' : '空的'} tone="dim" /></span>}
              <span className="row">
                {own && <button type="button" onClick={() => {
                  if (!held || window.confirm('要蓋掉這一格嗎？')) void save(slot);
                }}>存</button>}
                <button type="button" disabled={!held} onClick={() => void load(slot)}>讀</button>
                {own && <button type="button" disabled={!held} onClick={() => {
                  if (window.confirm('要刪掉這一格嗎？')) void deleteSave(slot).then(openSaves);
                }}>刪</button>}
              </span>
            </li>;
          })}
        </ul>
        <button type="button" onClick={() => setSaves(undefined)}>關閉</button>
      </div>}

      {failed && <p className="hud toast" role="alert">地圖無法顯示。</p>}

      {stats.bankrupt && <div className="hud over" role="alertdialog" aria-label="破產">
        <h2>城市破產了</h2>
        <p>欠超過 {money(-economy.bankrupt)}，什麼都蓋不了。</p>
        <div className="row">
          <button type="button" disabled={stats.loans.length >= economy.loan.max}
            onClick={() => changeLines(() => engine.city.borrow(), `借到 ${money(economy.loan.amount)}。`)}>借 {money(economy.loan.amount)}</button>
          <button type="button" onClick={() => void openSaves()}>讀取存檔</button>
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
