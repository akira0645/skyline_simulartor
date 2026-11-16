/** The lists that fill the screen's menus: build tools and their pictures, panel tabs, map views, speeds. */
import cityUrl from '../assets/city.png';
import type { Overlay, Tool } from './tools';
import type { Tile } from '../simulation/TileMap';
import { type DemoSize } from './demoCity';
import { economy, tileCost } from '../simulation/Economy';
import { utilities } from '../simulation/Utilities';
import { isBig, isFacility, isService } from '../simulation/TileMap';
import { services } from '../simulation/Services';
import { money, tileNames } from './wording';

export const speeds = [0, 0.25, 0.5, 1, 2, 4] as const;

/** The build tools, one group per tab of the toolbar. */
export const toolGroups: [string, [Tool, string][]][] = [
  ['道路', [['road', '道路'], ['avenue', '大道'], ['viaduct', '高架']]],
  ['分區', [['residential', '住宅'], ['commercial', '商業'], ['industrial', '工業']]],
  ['交通', [['bus', '公車站'], ['metro', '捷運站'], ['gas', '加油站'], ['parking', '停車場']]],
  ['水電', [['power', '電廠'], ['water', '水塔']]],
  ['公共服務', [['fire', '消防局'], ['police', '警察局'], ['clinic', '診所'], ['hospital', '醫院']]],
  ['照護', [['community', '社區中心'], ['familyclinic', '家庭診所'], ['eldercare', '日間照護'], ['memorial', '紀念花園']]],
  ['教育', [['daycare', '托兒所'], ['school', '小學'], ['highschool', '高中'], ['university', '大學'], ['library', '圖書館']]],
  ['市政', [['cityhall', '市政廳'], ['bank', '銀行']]],
  ['民生', [['farm', '農田'], ['market', '市場'], ['coldstore', '冷鏈倉庫'], ['bakery', '烘焙坊'], ['florist', '花店'], ['cakeshop', '蛋糕店']]],
  ['環保', [['recycling', '回收站'], ['workshop', '維修工坊']]],
  ['休閒觀光', [['park', '公園'], ['square', '廣場'], ['temple', '廟'], ['cinema', '電影院'], ['pool', '游泳池'],
    ['ktv', 'KTV'], ['amusement', '遊樂園'], ['mall', '大型商場'], ['casino', '賭場'],
    ['museum', '博物館'], ['stadium', '體育場'], ['culture', '文化中心']]],
];

/** Where each tool's picture sits in city.png, as [column, row]; the rest are drawn in CSS. */
export const iconAt: Partial<Record<Tool, [number, number]>> = {
  familyclinic: [12, 14], bakery: [13, 14], florist: [14, 14], cakeshop: [15, 14],
  road: [10, 0], avenue: [10, 0], residential: [0, 2], commercial: [0, 3], industrial: [0, 4],
  power: [0, 5], water: [1, 5], fire: [2, 5], police: [3, 5], school: [4, 5], clinic: [5, 5], bus: [6, 5], metro: [7, 5],
  market: [8, 5], highschool: [9, 5], temple: [10, 5], cinema: [11, 5], parking: [12, 5],
  library: [13, 5], pool: [14, 5], ktv: [15, 5], cityhall: [0, 14], bank: [1, 14], culture: [2, 14], coldstore: [3, 14], square: [4, 14], daycare: [5, 14],
  recycling: [6, 14], workshop: [7, 14], gas: [8, 14], park: [9, 14], farm: [10, 14], viaduct: [11, 14],
};

/** The buildings of two tiles by two, by their place in the row of them; shown at half size. */
export const bigIconAt: Partial<Record<Tool, number>> = { hospital: 1, university: 2, museum: 3, stadium: 4,
  mall: 5, casino: 6, amusement: 7, community: 8, eldercare: 9, memorial: 10 };

export const iconStyle = (tool: Tool) => {
  const big = bigIconAt[tool];
  if (big !== undefined) {
    return { backgroundImage: `url(${cityUrl})`, backgroundSize: '256px auto',
      backgroundPosition: `-${(big % 8) * 32}px -${(big < 8 ? 6 : 15) * 16}px` };
  }
  const at = iconAt[tool];
  return at && { boxShadow: 'none', backgroundImage: `url(${cityUrl})`, backgroundPosition: `-${at[0] * 32}px -${at[1] * 32}px` };
};

export const panelTabs = [['tile', '地塊'], ['city', '城市'], ['tasks', '任務'], ['goals', '成就'], ['book', '手冊'], ['lines', '路線'], ['freight', '物流'], ['log', '紀錄']] as const;

export type PanelTab = (typeof panelTabs)[number][0];

/** What one tile of a tool costs; nothing for the tool that only looks. */
export const toolCost = (tool: Tool) =>
  tool === 'freight-line' || tool === 'land' || tool === 'pan' || tool === 'inspect' || tool === 'line' ? undefined :
  tileCost(tool === 'demolish' ? 'grass' : tool);

/** One short line on how to use each tool, shown when it is picked. */
export function toolTip(tool: Tool): string {
  if (tool === 'freight-line') return '先點工業區工廠，再依序點商業區店鋪；再次點選移除，換一座工廠可更換起點。';
  if (tool === 'land') return '買地：點選與已有土地共邊相鄰的 32×32 區塊；價格會隨擴張提高。';
  if (isService(tool)) {
    const extra = tool === 'fire' ? '沒救到的火會嚇跑附近的人。' :
      tool === 'police' ? '滿 100 人後，沒警察的地方地價低。' :
      tool === 'market' ? `讓 ${services.market.shoppers} 人買得到東西。` :
      tool === 'highschool' ? '滿 700 人後大家會要。' :
      tool === 'temple' ? '附近鄰居感情變好。' :
      tool === 'hospital' ? '也算診所。滿 1,200 人後大家會要。' :
      tool === 'university' ? '範圍很大。' :
      tool === 'parking' ? '住家 2 格內有它，車主的停車月費歸城市；開車出門的人在 2 格內的地方多 12 個車位。蓋在休閒建築 4 格內，遊客多兩成五。' :
      tool === 'casino' ? '最賺，但附近地價變低、會嫌吵。' :
      tool === 'gas' ? '範圍內有車的人在這裡加油，城市抽三成；沒有加油站的人要多花五成去外地加。' :
      tool === 'library' ? '附近地價變高，住附近的人放假會來。' :
      tool === 'ktv' ? '會賺錢，但附近地價低一點。' :
      tool === 'bakery' ? '早上 6 點開到晚上 7 點。住附近的人來買麵包，肚子餓想外食的人也會來。' :
      tool === 'florist' ? '早上 10 點開到晚上 7 點。住附近的人來買花，附近地價高一點。' :
      tool === 'cakeshop' ? '中午開到晚上 8 點。家裡有人生日會來買蛋糕，平常也有人來吃甜的。' :
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
    case 'park': return '拖曳蓋公園。橘紅色越深，污染越嚴重。';
    case 'farm': return '拖曳種田，產出民生用品。離水 3 格內收成三倍，太髒長不出來。';
    case 'demolish': return '點一下拆掉。';
    default: return '拖曳移動，點一格看資料，滾輪縮放。';
  }
}

export const overlays: [Overlay, string, string][] = [
  ['none', '一般', ''],
  ['traffic', '車流', '現在路上的車：綠色順暢，黃色車多，橘紅塞車。沒人上下班時全綠。'],
  ['pollution', '污染', '越紫越髒。太髒的住宅沒人搬來。'],
  ['value', '地價', '綠色好，紅色差。地價夠高才會升級。'],
  ['freight', '物流', '物流路線與配送站點，顏色對應物流面板。'],
  ['lines', '路線', '公車和捷運的路線，框起來的是站。'],
  ['power', '供電', '綠色有電，紅色沒有。'],
  ['water', '供水', '綠色有水，紅色沒有。'],
];

export const zones = [['residential', '住宅'], ['commercial', '商業'], ['industrial', '工業']] as const;

export const visitable: readonly Tile[] = ['community', 'familyclinic', 'eldercare', 'memorial', 'park', 'culture', 'library', 'school', 'daycare', 'clinic', 'hospital', 'bank', 'market', 'bakery', 'florist', 'cakeshop', 'mall', 'square', 'highschool', 'university', 'temple', 'cinema', 'pool', 'ktv', 'amusement', 'casino', 'museum', 'stadium'];

/** The three ready-made cities. */
export const demoList: [DemoSize, string, string, string[]][] = [
  ['small', '小鎮', '140 人', ['加州風', '四種街區組合', '東岸待開發']],
  ['medium', '城鎮', '800 人', ['紐約風', '兩條河中間的島', '中央公園']],
  ['large', '大城市', '2,100 人', ['舊金山風', '海灣和紅色大橋', '金門公園', '纜車']],
];
