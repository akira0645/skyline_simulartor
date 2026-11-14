import { useEffect, useRef, useState } from 'react';
import { CityRenderer } from '../rendering/CityRenderer';
import cityUrl from '../assets/city.png';
import { TrendChart, type TrendPoint } from './TrendChart';
import { lineColourCss, lineName } from './lineColours';
import { transit } from '../simulation/Transit';
import { landValue } from '../simulation/LandValue';
import type { Overlay, Tool } from './tools';
import type { Cell, Tile } from '../simulation/TileMap';
import { demoCity, powerPlant, waterTower, works, type DemoSize } from './demoCity';
import { workShift, shiftPhase, rushShifts, shifts } from '../simulation/WorkShift';
import { ISSUES, type CityEvent, type Issue, type PersonNews } from '../simulation/BuildingSystem';
import { cycle, economy, milestones, tileCost, type Mood } from '../simulation/Economy';
import { dateAt, hourAt, weekdayAt } from '../simulation/calendar';
import { traffic } from '../simulation/Traffic';
import { pollution } from '../simulation/Pollution';
import { utilities } from '../simulation/Utilities';
import { isBig, isFacility, isService, TILES, type Service } from '../simulation/TileMap';
import { services } from '../simulation/Services';
import { SimulationClock, type SimulationSpeed } from '../simulation/SimulationClock';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { THEMES, type Theme } from '../simulation/SaveData';
import { AUTO_SLOT, deleteSave, listSaves, readSave, SLOTS, writeSlot, type SaveNote } from '../storage/SaveManager';
import { brands, type Brand, type DilemmaId } from '../simulation/Dilemmas';
import { goals } from '../simulation/Goals';
import { combos, COMBOS, taskList, type Combo, type TaskId } from '../simulation/Combos';
import { challenges, festivals, POLICIES, seasons, visitorsToday, type ChallengeId, type FestivalId, type Policy,
  type Season } from '../simulation/Seasons';
import { weekendAt } from '../simulation/calendar';
import { TRAITS, type HomeKind, type Trait } from '../simulation/Residents';
import { mind, thoughts as thoughtWeights, type Doing, type Thought, type Way } from '../simulation/Mind';
import { bond, circle, PLACES, type Place } from '../simulation/Community';
import { vehicles } from '../simulation/Wealth';

const speeds = [0, 1, 2, 4] as const;

/** The build tools, one group per tab of the toolbar. */
const toolGroups: [string, [Tool, string][]][] = [
  ['道路', [['road', '道路'], ['avenue', '大道'], ['viaduct', '高架']]],
  ['交通', [['bus', '公車站'], ['metro', '捷運站'], ['gas', '加油站']]],
  ['分區', [['residential', '住宅'], ['commercial', '商業'], ['industrial', '工業']]],
  ['水電', [['power', '電廠'], ['water', '水塔']]],
  ['服務', [['fire', '消防局'], ['police', '警察局'], ['clinic', '診所'], ['hospital', '醫院']]],
  ['學校', [['school', '小學'], ['highschool', '高中'], ['university', '大學']]],
  ['生活', [['park', '公園'], ['farm', '農田'], ['market', '市場'], ['temple', '廟'], ['parking', '停車場']]],
  ['休閒', [['library', '圖書館'], ['cinema', '電影院'], ['pool', '游泳池'], ['ktv', 'KTV'], ['amusement', '遊樂園']]],
  ['景點', [['mall', '大型商場'], ['casino', '賭場'], ['museum', '博物館'], ['stadium', '體育場']]],
  ['其他', [['demolish', '拆除']]],
];

/** Where each tool's picture sits in city.png, as [column, row]; the rest are drawn in CSS. */
const iconAt: Partial<Record<Tool, [number, number]>> = {
  road: [10, 0], avenue: [10, 0], residential: [0, 2], commercial: [0, 3], industrial: [0, 4],
  power: [0, 5], water: [1, 5], fire: [2, 5], police: [3, 5], school: [4, 5], clinic: [5, 5], bus: [6, 5], metro: [7, 5],
  market: [8, 5], highschool: [9, 5], temple: [10, 5], cinema: [11, 5], parking: [12, 5],
  library: [13, 5], pool: [14, 5], ktv: [15, 5],
};
/** The buildings of two tiles by two, by their place in the row of them; shown at half size. */
const bigIconAt: Partial<Record<Tool, number>> = { hospital: 1, university: 2, museum: 3, stadium: 4,
  mall: 5, casino: 6, amusement: 7 };
const iconStyle = (tool: Tool) => {
  const big = bigIconAt[tool];
  if (big !== undefined) {
    return { backgroundImage: `url(${cityUrl})`, backgroundSize: '256px 176px',
      backgroundPosition: `-${big * 32}px -96px` };
  }
  const at = iconAt[tool];
  return at && { backgroundImage: `url(${cityUrl})`, backgroundPosition: `-${at[0] * 32}px -${at[1] * 32}px` };
};

const panelTabs = [['tile', '這格'], ['city', '城市'], ['tasks', '任務'], ['goals', '成就'], ['book', '手冊'], ['lines', '路線'], ['log', '紀錄']] as const;
type PanelTab = (typeof panelTabs)[number][0];

/** What one tile of a tool costs; nothing for the tool that only looks. */
const toolCost = (tool: Tool) =>
  tool === 'pan' || tool === 'inspect' || tool === 'line' ? undefined :
  tileCost(tool === 'demolish' ? 'grass' : tool);

/** One short line on how to use each tool, shown when it is picked. */
function toolTip(tool: Tool): string {
  if (isService(tool)) {
    const extra = tool === 'fire' ? '沒救到的火會嚇跑附近的人。' :
      tool === 'police' ? '滿 100 人後，沒警察的地方地價低。' :
      tool === 'market' ? `讓 ${services.market.shoppers} 人買得到東西。` :
      tool === 'highschool' ? '滿 700 人後大家會要。' :
      tool === 'temple' ? '附近鄰居感情變好。' :
      tool === 'hospital' ? '也算診所。滿 1,200 人後大家會要。' :
      tool === 'university' ? '範圍很大。' :
      tool === 'parking' ? '住家 2 格內有它，車主的停車月費歸城市。蓋在休閒建築 4 格內，遊客多兩成五。' :
      tool === 'casino' ? '最賺，但附近地價變低、會嫌吵。' :
      tool === 'gas' ? '範圍內有車的人在這裡加油，城市抽三成；沒有加油站的人要多花五成去外地加。' :
      tool === 'library' ? '附近地價變高，住附近的人放假會來。' :
      tool === 'ktv' ? '會賺錢，但附近地價低一點。' :
      services.visitors[tool] ? '人越多賺越多，假日更多。' : '';
    return `點一下蓋${tileNames[tool]}，${isBig(tool) ? '佔 2 × 2，一格貼路就行' : '要貼著路'}。框內是照顧範圍。${extra}`;
  }
  if (isFacility(tool)) return `點一下蓋${tileNames[tool]}，要貼著路。一座供 ${utilities.capacity[tool]} 棟；綠色有、紅色沒有。`;
  switch (tool) {
    case 'road': return `拖曳鋪路。過河變橋，每格 ${money(economy.cost.bridge)}。`;
    case 'bus': return '點一下蓋站，要貼著路。再到右邊「路線」連起來。';
    case 'metro': return '蓋在道路或大道上。再到右邊「路線」連起來。';
    case 'line': return '照順序點站；再點一次拿掉。好了按「完成」。';
    case 'avenue': return '快一倍、能走三倍的車，可直接鋪在舊路上。';
    case 'viaduct': return '拖曳蓋高架，可以跨過房子、河和別的路。只有兩端會接到旁邊的路。';
    case 'residential': return '拖曳劃住宅，要貼著路。離工廠遠一點。';
    case 'commercial': return '拖曳劃商業，要貼著路。';
    case 'industrial': return '拖曳劃工業，要貼著路。會污染附近。';
    case 'park': return '拖曳蓋公園。減少污染、提高地價。';
    case 'farm': return '拖曳種田，產出民生用品。離水 3 格內收成三倍，太髒長不出來。';
    case 'demolish': return '點一下拆掉。';
    default: return '拖曳移動，點一格看資料，滾輪縮放。';
  }
}

/** How business is, in a word, and what that does. */
const moodNames: Record<Mood, [string, string]> = {
  boom: ['好', '想來的人變多，稅收多一成'],
  normal: ['普通', '沒有影響'],
  slump: ['差', '店和工廠少請一成五的人'],
};

/** City ranks, indexed by how many milestones have been reached. */
const rankNames = ['空地', '小村', '村莊', '小鎮', '城鎮', '城市', '大城市'];
/** A price as how far it is above or below the usual. */
const percent = (index: number) => `${index >= 1 ? '+' : '−'}${Math.abs(Math.round((index - 1) * 100))}%`;
const money = (amount: number) => `${amount < 0 ? '−' : ''}$${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;

const overlays: [Overlay, string, string][] = [
  ['none', '一般', ''],
  ['traffic', '車流', '現在路上的車：綠色順暢，黃色車多，橘紅塞車。沒人上下班時全綠。'],
  ['pollution', '污染', '越紫越髒。太髒的住宅沒人搬來。'],
  ['value', '地價', '綠色好，紅色差。地價夠高才會升級。'],
  ['lines', '路線', '公車和捷運的路線，框起來的是站。'],
  ['power', '供電', '綠色有電，紅色沒有。'],
  ['water', '供水', '綠色有水，紅色沒有。'],
];

const zones = [['residential', '住宅'], ['commercial', '商業'], ['industrial', '工業']] as const;

const issueNames: Record<Issue, string> = {
  'no-road': '沒貼路', 'no-power': '沒電', 'no-water': '沒水',
  'no-jobs': '找不到工作', 'long-commute': '上班太遠', pollution: '太髒', crime: '治安差', scared: '剛出事',
  'no-school': '沒小學', 'no-clinic': '沒診所', 'no-highschool': '沒高中', 'no-hospital': '沒醫院',
  vacancies: '請不到人',
};
/** What each problem does and how to put it right, shown when its tag is picked. */
const issueHelp: Record<Issue, string> = {
  'no-road': '旁邊沒有路，蓋不起來。鋪一條路貼著它。',
  'no-power': '沒電只能用一半。12 格內貼著路蓋電廠。',
  'no-water': '沒水只能用一半。12 格內貼著路蓋水塔。',
  'no-jobs': '家裡有人沒工作，再多就搬走。多劃商業或工業區。',
  'long-commute': '上班超過 40 分鐘，沒人搬來。鋪大道、拉捷運，或把工作劃近一點。',
  pollution: '太髒沒人搬來。蓋公園，或讓工廠、電廠離遠一點。',
  crime: '沒警察，地價 −10，還會遭小偷。蓋警察局。',
  scared: '附近失火沒人救或遭小偷沒人管：一個月內沒人搬來、店裡客人變少、學校沒人敢來。補上消防局和警察局。',
  'no-school': '附近沒小學，地價 −8。蓋小學。',
  'no-clinic': '附近沒診所，地價 −8。蓋診所或醫院。',
  'no-highschool': '附近沒高中，地價 −6。蓋高中。',
  'no-hospital': '附近沒醫院，地價 −6。蓋醫院。',
  vacancies: '位子沒坐滿。多劃住宅區，或讓人來得了。',
};

const tileNames: Record<Tile, string> = {
  grass: '草地', road: '道路', avenue: '大道', residential: '住宅區', commercial: '商業區',
  industrial: '工業區', power: '電廠', water: '水塔', park: '公園',
  fire: '消防局', police: '警察局', school: '小學', clinic: '診所',
  river: '河流', bridge: '橋', bus: '公車站', metro: '捷運站',
  market: '市場', highschool: '高中', hospital: '醫院', university: '大學', museum: '博物館', stadium: '體育場',
  annex: '大建築', viaduct: '高架道路', gas: '加油站', farm: '農田', library: '圖書館', pool: '游泳池', ktv: 'KTV', amusement: '遊樂園', temple: '廟', mall: '大型商場', casino: '賭場', cinema: '電影院', parking: '停車場',
};

/** What each kind of home is called, and who tends to live in it. */
const homeKindNames: Record<HomeKind, [string, string]> = {
  villa: ['高級住宅', '多有錢人、愛開車'],
  garden: ['花園住宅', '多綠手指、熱心的人'],
  worker: ['工人住宅', '多想進工廠、愛搭車'],
  downtown: ['市區住宅', '多想進店鋪或辦公室'],
  riverside: ['水岸住宅', '手頭寬，愛種花草'],
  station: ['車站住宅', '幾乎都愛搭車'],
  campus: ['學區住宅', '多熱心、想坐辦公室'],
  suburb: ['郊區住宅', '幾乎都愛開車'],
};

/** What happened, for the message line and the list of recent events. */
const eventText: Record<CityEvent['kind'], string> = {
  fire: '失火沒人救，燒掉一棟，附近的人會怕一個月',
  'fire-out': '失火了，消防車趕到撲滅了',
  crime: `遭小偷沒人管，損失 $${services.crime.loss}，附近的人會怕一個月`,
  'crime-stopped': '遭小偷，警車趕到抓到人了',
  sick: '有人生病，附近沒有診所，搬走了',
  'sick-helped': '有人生病，救護車送去診所了',
  flood: '河水淹進來沒人救，附近的人會怕一個月',
  'flood-helped': '河水淹進來，消防隊抽乾了',
  flu: '流感，附近沒有診所，有人病倒搬走了',
};

/** What each kind of person is called, and what they do to the city. */
const traitNames: Record<Trait, [string, string]> = {
  rich: ['有錢人', '繳兩倍的稅'],
  driver: ['愛開車', '絕對不搭公車和捷運'],
  rider: ['愛搭車', '有車可搭就一定搭'],
  helper: ['熱心助人', '讓失火、小偷、生病變少'],
  gardener: ['綠手指', '讓自己住的地方地價變高'],
};

/** Where the people on each shift work, in the order of `shifts`. */
const workplaceNames = ['工廠', '工廠', '店鋪', '辦公室'];

/** What happened to a resident, for the list of recent events. */
function newsText({ kind, name, shift, car }: PersonNews): string {
  const place = shift === undefined ? '' : workplaceNames[shift];
  switch (kind) {
    case 'job-nearer': return `${name}換到離家比較近的${place}上班`;
    case 'job-liking': return `${name}換到自己比較想做的${place}上班`;
    case 'job-change': return `${name}想換個環境，改到另一間${place}上班`;
    case 'job-lost': return `${name}上班的地方沒了，要重新找工作`;
    case 'left-no-work': return `${name}一直找不到工作，搬走了`;
    case 'left-no-room': return `${name}家裡住不下，搬走了`;
    case 'left-unhappy': return `${name}住得很不開心，搬走了`;
    case 'new-car': return `${name}存夠了錢，買了一台${vehicleNames[car ?? 1]}`;
    case 'sold-car': return `${name}養不起車，賣掉了`;
  }
}

/** A length of time in days, said the way people say it. */
const howLong = (days: number) =>
  days < 30 ? `${days} 天` : days < 360 ? `${Math.floor(days / 30)} 個月` : `${Math.floor(days / 360)} 年`;

type Person = NonNullable<ReturnType<SimulationEngine['city']['inspect']>>['residents'] extends
  (infer Item)[] | undefined ? Item : never;

/** One line for a resident: who they are, then what they do. */
function PersonRow({ person, atWork, onPick }: { person: Person; atWork?: boolean; onPick: (person: Person) => void }) {
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

const wayNames: Record<Way, string> = { walk: '走路', bike: '騎腳踏車', scooter: '騎機車', drive: '開車',
  bus: '搭公車', metro: '搭捷運' };
/** What people own, in the order of Wealth's `vehicles`. */
const vehicleNames = ['腳踏車', '機車', '小車', '房車', '名車'];
const placeNames: Record<Place, string> = { shops: '商店', market: '市場', park: '公園', school: '學校',
  clinic: '看病的地方', stop: '車站', temple: '廟', fun: '玩的地方' };
/** How close-knit a home is, as a word. */
const bondWord = (value: number) => value >= bond.close ? '很好' : value >= bond.distant ? '普通' : '冷淡';

/** What someone is doing right now, in a sentence. */
function doingText(doing: Doing, shift: number | undefined, way: Way | undefined): string {
  const place = shift === undefined ? '' : workplaceNames[shift];
  const going = wayNames[way ?? 'walk'];
  switch (doing) {
    case 'sleeping': return '在睡覺';
    case 'getting-ready': return '剛起床，吃早餐準備出門';
    case 'to-work': return `正${going}去${place}上班`;
    case 'working': return `在${place}上班`;
    case 'break': return shift === undefined ? '在吃午餐' : '上班到一半，休息吃飯';
    case 'to-home': return `下班了，正${going}回家`;
    case 'job-hunting': return '在外面到處找工作';
    case 'park': return '在家附近的公園散步';
    case 'shopping': return '在附近逛街買東西';
    case 'gardening': return '在整理家門口的花草';
    case 'helping': return '在幫鄰居的忙';
    case 'dining': return '在外面吃大餐';
    case 'home': return '在家休息';
    case 'temple': return '在附近的廟裡拜拜、跟鄰居聊天';
    case 'online': return '附近沒有店，在家用手機訂日用品';
    case 'outing': return '放假，去附近好玩的地方逛逛';
    case 'family': return '在家陪小孩';
    case 'day-off': return '放假，在家睡到自然醒';
  }
}

/** What is on someone's mind, in their own words. */
const thoughtNames: Record<Thought, string> = {
  'need-job': '一直找不到工作，再這樣下去只能搬走了',
  'no-power': '家裡沒有電，晚上黑漆漆的',
  'no-water': '家裡沒有水，連洗澡都成問題',
  'air-bad': '空氣好差，窗戶都不敢開',
  unsafe: '附近沒有警察局，晚上出門怕怕的',
  'far-commute': '上班太遠了，每天都在趕路',
  'no-clinic': '附近沒有診所，生病不知道找誰',
  'no-hospital': '城市這麼大了，附近卻沒有醫院',
  'no-shops': '店太少了，東西常常買不到',
  'want-other-job': '現在的工作不是我想做的',
  'slump-worry': '最近景氣不好，擔心工作保不住',
  'tax-high': '稅太重了，賺的錢都被收走',
  jam: '路上好塞，車子動都不動',
  'no-school': '附近沒有小學，小孩上學很麻煩',
  'no-highschool': '希望附近有一間高中',
  'want-ride': '希望家附近有公車或捷運可以搭',
  'new-here': '剛搬來，還在認識這個地方',
  'love-car': '開車上班最自在',
  'garden-proud': '家門口的花草被我顧得很漂亮',
  neighbours: '有空就去幫鄰居，大家感情很好',
  'tax-low': '稅很低，住這裡真划算',
  'ride-glad': '搭車上班很方便，不用自己開車',
  'old-timer': '住很久了，早就把這裡當成家',
  'nice-home': '住在好地段，很有面子',
  'near-commute': '上班很近，早上可以多睡一下',
  'boom-glad': '最近景氣好，做事特別有勁',
  'water-near': '住在水邊，風景真好',
  'park-near': '家附近就有公園，散步很方便',
  'love-job': '很喜歡現在的工作',
  'all-good': '日子過得還不錯，沒什麼好抱怨的',
  'nothing-near': '家附近什麼都沒有，做什麼都要跑很遠',
  strangers: '住了一陣子，還是不認識鄰居',
  'want-car': '上班好遠，想存錢買一台車',
  online: '附近沒有店，買東西都靠網購',
  'temple-near': '附近有廟，有事沒事都去拜一下',
  'proud-car': '自己賺錢買的車，開起來真舒服',
  handy: '走幾步什麼都有，住這裡很方便',
  'close-knit': '鄰居都認識，感情很好',
  'kids-nowhere': '附近沒有公園，小孩沒地方玩',
  'casino-near': '附近開了賭場，晚上有點吵',
  'fun-near': '附近有好玩的地方，放假不無聊',
  'kids-happy': '小孩上學近，放學還能去公園玩',
  scared: '附近才剛出事，都沒人來處理，住得心驚膽跳',
  'forest-near': '住在森林邊，空氣好又安靜',
  late: '路上塞住又遲到，被扣了薪水',
  'car-dear': '油錢、停車費、牌照稅，養一台車好花錢',
  'no-gas': '附近沒有加油站，加個油要跑好遠',
  'fuel-dear': '油價好貴，開車上班快開不起了',
  'good-pay': '最近生意好，老闆加薪了',
};

/** The same thoughts as labels of a few characters; the sentence shows when one is picked. */
const thoughtTags: Record<Thought, string> = {
  'need-job': '沒工作', 'no-power': '沒電', 'no-water': '沒水', 'air-bad': '空氣差', unsafe: '治安差',
  'far-commute': '上班遠', 'no-clinic': '沒診所', 'no-hospital': '沒醫院', 'no-shops': '店太少',
  'want-other-job': '想換工作', 'slump-worry': '怕失業', 'tax-high': '稅太重', jam: '塞車', 'no-school': '沒小學',
  'no-highschool': '沒高中', 'want-ride': '想搭車', 'new-here': '剛搬來', 'love-car': '愛開車',
  'garden-proud': '顧花草', neighbours: '幫鄰居', 'tax-low': '稅很低', 'ride-glad': '搭車方便', 'old-timer': '住很久',
  'nice-home': '好地段', 'near-commute': '上班近', 'boom-glad': '景氣好', 'water-near': '住水邊', 'park-near': '公園近',
  'love-job': '喜歡工作', 'all-good': '沒煩惱', 'nothing-near': '附近空空', strangers: '不認識鄰居', 'want-car': '想買車',
  online: '靠網購', 'temple-near': '有廟', 'proud-car': '有好車', handy: '生活方便', 'close-knit': '鄰居感情好',
  'kids-nowhere': '小孩沒處玩', 'casino-near': '賭場吵', 'fun-near': '有得玩', 'kids-happy': '小孩開心',
  scared: '怕怕的', 'good-pay': '加薪了', 'forest-near': '森林邊', late: '遲到', 'no-gas': '沒加油站', 'fuel-dear': '油太貴', 'car-dear': '養車貴',
};

/**
 * A fact in a few characters, with a number beside it when there is one. The long version is
 * the tooltip; a tag that can be picked is a button.
 */
function Tag({ label, value, tone, tip, onPick, picked }: { label: string; value?: string | number;
  tone?: 'good' | 'bad' | 'dim'; tip?: string; onPick?: () => void; picked?: boolean }) {
  const body = <>{label}{value !== undefined && <b>{value}</b>}</>;
  const name = `tag${tone ? ` ${tone}` : ''}`;
  return onPick ? <button type="button" className={name} title={tip} aria-pressed={picked} onClick={onPick}>{body}</button> :
    <span className={name} title={tip}>{body}</span>;
}
/** How business is at a workplace, and what that does to pay. */
const tradeNames = { busy: ['很好', '客人很多，薪水多五成'], good: ['好', '薪水多兩成五'], quiet: ['冷清', '客人少，薪水照常'] } as const;
/** The special groups: what each is called, how to make one and what it does, and a clue for one not yet found. */
const comboNames: Record<Combo, [string, string, string]> = {
  forest: ['森林', `公園連 ${combos.forest.tiles} 格。旁邊地價 +${combos.forest.value.amount}，住宅變森林小屋。`, '公園夠大的話…'],
  riverpark: ['河濱公園', `大公園（${combos.riverpark.tiles} 格以上）靠著水。旁邊地價 +${combos.riverpark.value.amount}。`, '公園和水…'],
  farmstead: ['農莊', `農田連 ${combos.farmstead.tiles} 格且有一格靠水。收成多五成，旁邊住宅變農家。`, '農田夠大又有水…'],
  arcade: ['商圈', `${combos.arcade.side} × ${combos.arcade.side} 的商店全部 3 級。有遊客收入。`, '一整塊最高級的商店…'],
  fair: ['廟口夜市', `廟的 ${combos.fair.reach} 格內有市場和公園。有遊客收入。`, '廟的旁邊熱鬧起來…'],
  foodstreet: ['美食街', `市場 ${combos.foodstreet.reach} 格內有 ${combos.foodstreet.shops} 間店。有遊客收入。`, '市場被店家圍起來…'],
  plaza: ['車站商圈', `捷運站 ${combos.plaza.reach} 格內有 ${combos.plaza.shops} 間店。有遊客收入。`, '捷運站出口都是店…'],
  funcity: ['娛樂城', `賭場 ${combos.funcity.reach} 格內有電影院和商場。有大筆遊客收入。`, '好玩的地方蓋在一起…'],
  campus: ['文教區', `高中 ${combos.campus.reach} 格內有小學和公園。旁邊地價 +${combos.campus.value.amount}。`, '學校聚在一起…'],
  medical: ['醫療園區', `醫院 ${combos.medical.reach} 格內有診所。旁邊地價 +${combos.medical.value.amount}。`, '看病的地方聚在一起…'],
  estate: ['工業園區', `工廠連 ${combos.estate.buildings} 棟。產量多兩成五，污染也多三成。`, '工廠連成一片…'],
  port: ['港口', '工業園區靠著水。產量和污染同工業園區，另有出口收入。', '工廠連成一片，又在水邊…'],
};
/** The groups that are a place in themselves, and so name the tile. */
const PLACES_OF: readonly Combo[] = ['forest', 'riverpark', 'farmstead'];
const nickNames = { cabin: '森林小屋', farmhouse: '農家' };
/** What each task asks for. */
const taskNames: Record<TaskId, string> = {
  power: '把電送到每一棟', water: '把水送到每一棟', police: '讓每一棟都有警察照顧', jobs: '讓大家找得到工作',
  commute: '縮短上班路程', air: '把空氣弄乾淨', school: '讓住宅附近有小學', clinic: '讓住宅附近有診所',
  highschool: '讓住宅附近有高中', hospital: '讓住宅附近有醫院', staff: '幫店家和工廠找到人',
};
/** The seasons, festivals, policies and challenges: what each is called, and what it does or needs. */
const seasonNames: Record<Season, [string, string]> = {
  spring: ['春', '一切照常'],
  summer: ['夏', '農田多兩成，電廠多花一成五，河邊可能淹水'],
  autumn: ['秋', '農田多五成'],
  winter: ['冬', '農田只剩三成，電廠多花三成，可能有流感'],
};
const festivalNames: Record<FestivalId, [string, string]> = {
  newyear: ['新年煙火', '要有大公園；有森林或河濱公園更多'],
  temple: ['廟會', '要有廟；有廟口夜市更多'],
  games: ['運動會', '要有高中；有體育場加倍'],
  harvest: ['豐年祭', '要有農田；有農莊更多'],
  market: ['歲末市集', '要有市場；有商場或商圈更多'],
};
const policyNames: Record<Policy, [string, string]> = {
  recycle: ['垃圾分類', '工廠污染少兩成。每人每月 $0.5。'],
  freeride: ['免費搭車', '搭車的人變多，但沒有車票收入。'],
  patrol: ['夜間巡邏', '遭小偷的機會減半。每人每月 $0.4。'],
  festive: ['節慶補助', '節日收入多五成。每月 $200。'],
};
const challengeNames: Record<ChallengeId, string> = { grow: '人口', riders: '搭車的人', top: '3 級建築' };
/** The businesses a decision can bring to one of the city's shops. */
const brandNames: Record<Brand, string> = { lottery: '彩券行', kiosk: '彩券小舖', branch: '外商分店', studio: '片場紀念店' };
/** Decisions that come up: the question, then what each answer does and the word on its button. */
const dilemmaNames: Record<DilemmaId, [string, [string, string], [string, string]]> = {
  investor: ['外地企業想投資', ['收下', '+$5,000，開一間外商分店，但 90 天內比較沒人想來'], ['婉拒', '扶植本地店家，60 天內更多人想來']],
  film: ['劇組想來拍片', ['免費借', '+$2,000，留下一間紀念店，60 天內更多人想來'], ['收場地費', '+$4,000']],
  volunteers: ['居民想辦掃街', ['市府出錢', '−$1,000，60 天內更多人想來'], ['發感謝狀', '−$300，小有幫助']],
  donor: ['富商想捐款', ['收進市庫', '+$3,000'], ['請他辦活動', '90 天內更多人想來']],
  fair: ['鄰鎮邀請合辦市集', ['出錢參加', '−$1,500，60 天內更多人想來'], ['只去觀摩', '拿補助 +$500']],
  lottery: ['彩券行想進駐', ['全面開放', '+$3,500，開一間彩券行，但 60 天內比較沒人想來'], ['限量開放', '+$1,500，只開一間小舖']],
};
/** How a city can look. */
const themeNames: Record<Theme, string> = { classic: '原本', sf: '舊金山', california: '加州', newyork: '紐約' };
/** The three ready-made cities. */
const demoList: [DemoSize, string, string, string[]][] = [
  ['small', '小鎮', '140 人', ['加州風', '棕櫚和海灘', '東岸待開發']],
  ['medium', '城鎮', '800 人', ['紐約風', '兩條河中間的島', '中央公園']],
  ['large', '大城市', '2,100 人', ['舊金山風', '海灣和紅色大橋', '金門公園', '纜車']],
];
const thoughtTone = (thought: Thought) => thoughtWeights[thought] < 0 ? 'bad' as const : 'good' as const;

/** A mood from 0 to 100 as a word. */
const moodWord = (mood: number) => mood >= mind.glad ? '開心' : mood >= mind.low ? '還好' : '不開心';

const serviceNames: Record<Service, string> = { fire: '消防', police: '警察', school: '小學', clinic: '診所',
  market: '市場', highschool: '高中', hospital: '醫院', university: '大學', museum: '博物館', stadium: '體育場',
  temple: '廟', mall: '商場', casino: '賭場', cinema: '電影院', parking: '停車場',
  library: '圖書館', pool: '游泳池', ktv: 'KTV', amusement: '遊樂園', gas: '加油站' };

/** How full a road is, in the words of the traffic view's four colours. */
const trafficName = (load: number) =>
  load <= 0.5 ? '順暢' : load <= 1 ? '車多' : load <= 1.5 ? '塞車' : '嚴重塞車';

/** A new city on a map nobody has seen: the seed, and so the water, is different every time. */
function freshCity(): SimulationEngine {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const engine = new SimulationEngine({ version: 1, seed, tick: 0 });
  engine.city.map.generateTerrain(seed);
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

  /** What the list of saves shows for the city as it is now. */
  function note(): SaveNote {
    const now = engine.city.getStats();
    return { population: now.population, funds: now.funds, rank: now.rank, tick: engine.getSnapshot().tick, at: Date.now() };
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
    if (rendererRef.current) rendererRef.current.marks = [];
    setMessage('讀好了。');
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
      seenCombos.current = now.combosSeen;
      knownCombos.current = now.combosSeen.length;
      knownMood.current = now.mood;
      setTick(engine.getSnapshot().tick);
      setStats(now);
      rendererRef.current?.refresh?.();
      setMessage('回到上次離開的城市。');
    }).catch(() => undefined);
    // Every quarter of a minute, and when the page is put away.
    const keep = () => void writeSlot(engine.save(), AUTO_SLOT, note()).catch(() => undefined);
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
      if (rendererRef.current) rendererRef.current.marks = [];
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
    }, cell => {
      setWho(undefined);
      setSelected(cell);
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
      if (latest.kind === 'fire' || latest.kind === 'fire-out' || latest.kind === 'crime' || latest.kind === 'sick') {
        setMessage(`${eventText[latest.kind]}。`);
      }
    }
    rendererRef.current?.refresh?.();
  }, [engine, tick]);

  /** Frames these tiles on the map and brings one into view; asking again for the same thing moves to the next. */
  function locate(key: string, cells: Cell[]) {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.marks = cells;
    if (!cells.length) {
      renderer.refresh?.();
      setMessage('地圖上現在沒有。');
      return;
    }
    const index = spot.current.key === key ? (spot.current.index + 1) % cells.length : 0;
    spot.current = { key, index };
    renderer.lookAt?.(cells[index]);
    setMessage(`黃框是它，第 ${index + 1} / ${cells.length} 處。再點看下一處，Esc 取消。`);
  }

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
    if (rendererRef.current) rendererRef.current.marks = [];
    knownMood.current = opening.mood;
    void writeSlot(engine.save(), AUTO_SLOT, note()).catch(() => undefined);
    setStats(engine.city.getStats());
    rendererRef.current?.refresh?.();
    setMessage(done);
  }

  function startDemo(size: DemoSize) {
    setChoosing(false);
    setMessage('正在蓋城市…');
    // The larger ones take a few seconds to put up, so the message gets on screen first.
    window.setTimeout(() => {
      const sample = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
      demoCity(sample, size);
      replaceCity(sample, '會蓋掉現在的地圖，確定嗎？', true,
        size === 'small' ? '交給你了。先過橋，把東岸的水電、警察、消防補上。' :
          size === 'medium' ? '交給你了。過東邊那條河，對岸的新街區還沒有水電、警察、消防。' :
          '交給你了。往南過紅色大橋，海灣對岸的新街區還沒有水電、警察、消防。');
    }, 30);
  }

  function startNew() {
    replaceCity(freshCity(), '會丟掉現在的城市，確定嗎？', false, '新地圖。先鋪路，再在路旁劃分區。');
  }

  const date = dateAt(tick);
  const info = selected && engine.city.inspect(selected);
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
  const pickPerson = (person: { homeId: number; slot: number }) => setWho({ home: person.homeId, slot: person.slot });
  const voices = panelTab === 'city' ? engine.city.voices() : undefined;
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
      <Tag label={moodWord(seen.mood)} tone={seen.mood >= mind.glad ? 'good' : seen.mood < mind.low ? 'bad' : undefined} tip="心情" />
      {seen.kids > 0 && <Tag label="小孩" value={seen.kids} />}
      {seen.school && <Tag label={seen.school === 'university' ? '讀過大學' : '讀過高中'} tone="good"
        tip={seen.school === 'university' ? '家在大學範圍內，薪水多兩成五' : '家在高中範圍內，薪水多一成'} />}
    </div>
    <dl>
      <dt>現在</dt><dd>{doingText(doing, seen.shift, seen.way)}</dd>
      <dt>住在</dt><dd>{seen.kind ? homeKindNames[seen.kind][0] : '一般住宅'}，{howLong(seen.days)}</dd>
      <dt>工作</dt>
      <dd>{seen.shift === undefined ? '還在找工作' :
        `${shifts[seen.shift].title} ${shifts[seen.shift].start}–${shifts[seen.shift].end} 點，${howLong(seen.workDays ?? 0)}`}</dd>
      {seen.way && seen.minutes !== undefined && <>
        <dt>上班</dt><dd>{wayNames[seen.way]} {Math.max(1, Math.round(seen.minutes))} 分鐘</dd>
      </>}
      <dt>錢</dt>
      <dd className="tags"><Tag label="日薪" value={money(seen.pay)} /><Tag label="存款" value={money(seen.money)} /></dd>
      <dt>車子</dt>
      <dd className="tags"><Tag label={vehicleNames[seen.car]} />
        {seen.car > 0 && <Tag label="養車" value={`${money(seen.keep)}/天`}
          tip={`牌照稅、油錢${seen.car >= 2 ? `、停車費（${{ lot: '停車場，歸城市', garage: '大樓地下室', kerb: '門口路邊，免費' }[seen.parking]}）` : ''}。付不起就會賣掉`} />}
        {vehicles[seen.car + 1] && <Tag label={`${vehicleNames[seen.car + 1]}`} value={money(vehicles[seen.car + 1].price)}
          tone="dim" tip="存到這麼多就會換車" />}</dd>
    </dl>
    <h2 className="sub">心裡在想</h2>
    <div className="tags">
      {seen.thoughts.map(thought => <Tag key={thought} label={thoughtTags[thought]} tone={thoughtTone(thought)}
        picked={thought === spoken} onPick={() => setSaid(thought)} />)}
    </div>
    <p className="said">{spoken ? `「${thoughtNames[spoken]}」` : ''}</p>
  </section>;
  // What happened lately, to buildings and to people, newest first.
  const happenings = [
    ...engine.city.getEvents().map(event => ({ tick: event.tick, text: eventText[event.kind] })),
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
    rendererRef.current.onPerson = (homeId, workId) => {
      const slot = engine.city.personOn(homeId, workId);
      if (slot === undefined) return;
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

  const group = toolGroups[toolTab];

  return (
    <main className="game">
      <div className="viewport" ref={viewport} data-tool={tool} role="region" aria-label="城市地圖" />

      <header className="hud top">
        <div className="stat" title={`每月：稅收 ${money(stats.budget.tax)}，車票 ${money(stats.budget.fares)}，牌照稅 ${money(stats.budget.licence)}，油稅 ${money(stats.budget.fuel)}，停車費 ${money(stats.budget.parking)}，景點 ${money(stats.budget.visitors)}，民生用品買賣 ${money(stats.budget.trade)}，維護費 ${money(stats.budget.upkeep)}，還款 ${money(stats.budget.loans)}。每天進帳一點。`}>
          <span>資金</span>
          <b>{money(stats.funds)}</b>
          <small className={stats.budget.net < 0 ? 'loss' : undefined}>每月 {stats.budget.net >= 0 ? '+' : ''}{money(stats.budget.net)}</small>
        </div>
        <div className="stat">
          <span>人口</span>
          <b>{stats.population.toLocaleString('en-US')} 人</b>
          <small>{rankNames[stats.rank]}{nextRank && ` → ${nextRank.population.toLocaleString('en-US')}`}</small>
        </div>
        <div className="stat demand" title="越長越缺">
          <span>缺什麼</span>
          {zones.map(([zone, label]) => (
            <label key={zone}>{label}
              <meter min={0} max={100} value={Math.max(0, stats.demand[zone])} />
            </label>
          ))}
        </div>
        <div className="clock">
          <div className="when">
            <b>{date.year} 年 {date.month} 月 {date.day} 日</b>
            <small>{seasonNames[stats.season][0]}・星期{'一二三四五六日'[weekdayAt(tick)]} {String(Math.floor(hour)).padStart(2, '0')}:{String(Math.floor(hour % 1 * 60)).padStart(2, '0')}</small>
          </div>
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
          <button type="button" aria-pressed={choosing} onClick={() => setChoosing(!choosing)}>示範</button>
          <button type="button" title="換一種城市風格（只換外觀）" onClick={() => {
            engine.city.theme = THEMES[(THEMES.indexOf(engine.city.theme) + 1) % THEMES.length];
            setLook(engine.city.theme);
            setMessage(`風格：${themeNames[engine.city.theme]}。`);
            rendererRef.current?.refresh?.();
          }}>風格：{themeNames[look]}</button>
          <button type="button" aria-pressed={saves !== undefined} onClick={() => saves ? setSaves(undefined) : void openSaves()}>存檔</button>
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
              {label}{value === 'city' && trouble > 0 && <i>{trouble}</i>}{value === 'tasks' && stats.tasks.length + (stats.challenge ? 1 : 0) > 0 && <i>{stats.tasks.length + (stats.challenge ? 1 : 0)}</i>}
            </button>
          ))}
        </div>

        {panelTab === 'tile' && (personCard ? personCard : selected && info ? <section>
          <h2>{info.brand ? brandNames[info.brand] : info.nick ? nickNames[info.nick] : info.combo && PLACES_OF.includes(info.combo) ? comboNames[info.combo][0] :
            info.complex ? '集合住宅' : info.bigPark ? '大公園' : info.kind ? homeKindNames[info.kind][0] : tileNames[info.tile]}</h2>
          {info.kind && <p className="hint">{homeKindNames[info.kind][1]}</p>}
          <dl>
            {info.brand && <>
              <dt>招牌</dt>
              <dd className="tags"><Tag label={brandNames[info.brand]} tone="good" /><Tag label="收入" value={`${money(brands[info.brand])}/月`} tone="good" /></dd>
            </>}
            {info.combo && <>
              <dt>組合</dt>
              <dd className="tags"><Tag label={comboNames[info.combo][0]} tone="good" tip={comboNames[info.combo][1]} />
                {info.comboEarns ? <Tag label="收入" value={`${money(info.comboEarns)}/月`} tone="good" /> : null}</dd>
            </>}
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
              <dd className="tags"><Tag label={trafficName(info.congestion)} tone={info.congestion > 1 ? 'bad' : undefined} />
                <Tag label="最忙" value={`${info.flow}/${info.roadCapacity}`} tip="最忙時經過的人／能走的人" /></dd>
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
                <dd className="tags">{info.kids.map(kid => <Tag key={kid.name} label={kid.name} value={`${kid.age} 歲`} />)}</dd>
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
              <dt>工作</dt>
              <dd className="tags"><Tag label="有工作" value={stats.employed} /><Tag label="職位" value={stats.jobs} /></dd>
              <dt>上班</dt>
              <dd className="tags">
                <Tag label="平均" value={stats.employed ? `${Math.round(stats.commute)} 分` : '—'} />
                <Tag label="搭車" value={stats.riders} tip="搭公車或捷運上班的人" />
              </dd>
              <dt>路上</dt>
              <dd className="tags"><Tag label={rush[0] ?? '沒有人'} tone={rush.length ? undefined : 'dim'} tip="現在哪一班的人在上下班" /></dd>
              <dt>遲到</dt>
              <dd className="tags"><Tag label="塞在路上" value={`${stats.late} 人`} tone={stats.late ? 'bad' : 'dim'}
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
                <Tag label="還沒開始" tone="dim" tip={`城市到過 ${cycle.population} 人以後，景氣會有好有壞`} /> :
                <Tag label={moodNames[stats.mood][0]} tip={moodNames[stats.mood][1]}
                  tone={stats.mood === 'boom' ? 'good' : stats.mood === 'slump' ? 'bad' : undefined} />}</dd>
              <dt>用品</dt>
              <dd className="tags" title="工廠和農田做民生用品；多的賣掉，不夠要買">
                {stats.goods.made >= stats.goods.needed ?
                  <><Tag label="夠用" tone={stats.goods.needed ? 'good' : 'dim'} /><Tag label="外銷" value={`+${money(stats.goods.trade)}/月`} /></> :
                  <><Tag label="不夠" tone="bad" /><Tag label="進口" value={`−${money(-stats.goods.trade)}/月`} tone="bad" /></>}
                <Tag label="農田" value={stats.goods.farmed} tone={stats.goods.farmed ? undefined : 'dim'} tip="農田每月種出來的份數" />
                <Tag label="買不到" value={`${stats.goods.needed - stats.goods.served} 人`}
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
            <h2>今天</h2>
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
          <p className="hint count">湊出來過 {stats.combosSeen.length} / {COMBOS.length} 種</p>
          <ul className="goals">
            {[...COMBOS].sort((a, b) => Number(stats.combosSeen.includes(b)) - Number(stats.combosSeen.includes(a))).map(combo => {
              const known = stats.combosSeen.includes(combo);
              const count = stats.combos[combo];
              return <li key={combo} className={known ? undefined : 'done'}>
                <b>{known ? comboNames[combo][0] : '？？？'}</b>
                <span>{comboNames[combo][known ? 1 : 2]}</span>
                {known && <span className="tags"><Tag label="現在有" value={count} tone={count ? 'good' : 'dim'}
                  onPick={count ? () => locate(`combo:${combo}`, engine.city.find({ combo })) : undefined} /></span>}
              </li>;
            })}
          </ul>
        </>}

        {panelTab === 'log' && (happenings.length ? <ul>{happenings.map((item, index) => {
          const day = dateAt(item.tick);
          return <li key={`${item.tick}-${index}`}>{day.month} 月 {day.day} 日：{item.text}</li>;
        })}</ul> : <p className="hint">還沒有事情發生。</p>)}
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
          {group[1].map(([value, label]) => {
            // Bigger buildings open up as the city passes its population milestones.
            const locked = isService(value) ? engine.city.lockedUntil(value) : undefined;
            return <button key={value} type="button" data-tool={value} aria-pressed={tool === value}
              disabled={locked !== undefined} onClick={() => pick(value)}>
              <i style={iconStyle(value)} />
              <span>{label}</span>
              <small>{locked !== undefined ? `滿 ${milestones[locked - 1].population.toLocaleString('en-US')} 人` :
                money(toolCost(value)! * stats.prices.level)}</small>
            </button>;
          })}
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
        <ul>
          {[...SLOTS, AUTO_SLOT, 'manual'].map((slot, index) => {
            const held = slot in saves;
            const kept = saves[slot];
            const own = index < SLOTS.length;
            if (!own && !held) return null;
            const day = kept && dateAt(kept.tick);
            return <li key={slot} className={held ? undefined : 'empty'}>
              <b>{own ? `第 ${index + 1} 格` : slot === AUTO_SLOT ? '自動' : '舊存檔'}</b>
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
