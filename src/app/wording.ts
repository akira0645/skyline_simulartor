/** Every word the screen shows for a thing in the simulation, and the small helpers that phrase numbers. */
import type { Tile } from '../simulation/TileMap';
import { type CityEvent, type Issue, type PersonNews } from '../simulation/BuildingSystem';
import { type Mood } from '../simulation/Economy';
import { type Service } from '../simulation/TileMap';
import { services } from '../simulation/Services';
import { type Theme } from '../simulation/SaveData';
import { type Brand, type DilemmaId } from '../simulation/Dilemmas';
import { combos, type Combo, type TaskId } from '../simulation/Combos';
import { type ChallengeId, type FestivalId, type Policy, type Season } from '../simulation/Seasons';
import { type HomeKind, type Trait } from '../simulation/Residents';
import { mind, thoughts as thoughtWeights, type Doing, type Thought, type Way } from '../simulation/Mind';
import { bond, type Place } from '../simulation/Community';

/** How business is, in a word, and what that does. */
export const moodNames: Record<Mood, [string, string]> = {
  boom: ['好', '想來的人變多，稅收多一成'],
  normal: ['普通', '沒有影響'],
  slump: ['差', '店和工廠少請一成五的人'],
};

/** City ranks, indexed by how many milestones have been reached. */
export const rankNames = ['空地', '小村', '村莊', '小鎮', '城鎮', '城市', '大城市'];

/** A price as how far it is above or below the usual. */
export const percent = (index: number) => `${index >= 1 ? '+' : '−'}${Math.abs(Math.round((index - 1) * 100))}%`;

export const money = (amount: number) => `${amount < 0 ? '−' : ''}$${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;

export const facilityUse: Partial<Record<Tile, string>> = {
  community: '室內聚會、認識鄰居。雨天也能安排活動。',
  familyclinic: '治療一般疾病。重症仍需到醫院。',
  eldercare: '65 歲以上居民的日間活動與照護，周邊長者生病機率降低。',
  memorial: '安靜散步與追思的戶外花園，雨天會減少造訪。',
  park: '散步、休息。公園也會降低周邊污染。',
  culture: '看展覽。搭配市場和公園可形成藝文街區。',
  library: '閱讀和借書。',
  school: '家長送孩子上小學。',
  highschool: '有青少年的家庭會在平日安排上學。',
  university: '年輕居民可在平日到校上課。',
  temple: '參拜、與鄰里聚會。',
  cinema: '傍晚和晚間看電影。',
  pool: '白天游泳。',
  ktv: '晚間唱歌。',
  amusement: '白天出遊、玩遊樂設施。',
  casino: '晚間娛樂。',
  museum: '白天參觀展覽。',
  stadium: '參加運動活動或觀賽。',
  daycare: '家長接送孩子。家庭生活圈每間托兒所可提供 8 個名額。',
  clinic: '看診。附近居民生病時可以求助。',
  bank: '辦理存款。連通銀行的居民每月可領存款利息，也能支援附近商店。',
  market: '早上 7 點到晚上 7 點買菜和民生用品。接上食材配送網後會收貨並顯示庫存。',
  bakery: '早上 6 點到晚上 7 點買麵包。想外食的人也能在這裡解決一餐。',
  florist: '早上 10 點到晚上 7 點買花。',
  cakeshop: '中午到晚上 8 點買蛋糕。家裡有人生日那天會優先來。',
  square: '散步的公共空間。組成廟口夜市後，傍晚 5 點到晚上 11 點可以逛攤、吃晚餐。',
  coldstore: '收存農田食材，再配送到市場。',
  recycling: '向同一路網上的循環工坊提供回收材料。',
  workshop: '把回收材料交給附近有員工的工廠，再製成商品。',
  gas: '車輛可以在這裡加油。',
  mall: '購物和逛街。附近有停車場時，可帶來更多觀光收入。',
  parking: '附近車主可付費停車，停車費歸城市。靠近景點時也會增加觀光收入。',
  fire: '向服務範圍內的火警派出消防車。',
  police: '出勤處理犯罪並改善附近治安。',
  hospital: '提供一般看診、急診及轉診。需要進一步檢查時，優先轉到醫療園區。',
  power: '提供附近建築用電。',
  water: '提供附近建築用水。',
  bus: '讓居民搭乘已營運的公車路線。',
  metro: '讓居民搭乘已營運的捷運路線。',
};

export const issueNames: Record<Issue, string> = {
  'no-road': '沒貼路', 'no-power': '沒電', 'no-water': '沒水',
  'no-jobs': '找不到工作', 'long-commute': '上班太遠', pollution: '太髒', crime: '治安差', scared: '剛出事',
  'no-school': '沒小學', 'no-clinic': '沒診所', 'no-highschool': '沒高中', 'no-hospital': '沒醫院',
  vacancies: '請不到人', 'no-park': '公園太遠', 'no-transit': '缺大眾運輸',
};

/** What each problem does and how to put it right, shown when its tag is picked. */
export const issueHelp: Record<Issue, string> = {
  'no-park': '在住宅附近蓋公園。',
  'no-transit': '在附近設站，接到一條有營運的公車或捷運路線。',
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

export const tileNames: Record<Tile, string> = {
  community: '社區中心', familyclinic: '家庭診所', eldercare: '日間照護', memorial: '紀念花園',
  bakery: '烘焙坊', florist: '花店', cakeshop: '蛋糕店',
  grass: '草地', road: '道路', avenue: '大道', residential: '住宅區', commercial: '商業區',
  industrial: '工業區', power: '電廠', water: '水塔', park: '公園',
  fire: '消防局', police: '警察局', school: '小學', clinic: '診所',
  river: '河流', bridge: '橋', bus: '公車站', metro: '捷運站',
  market: '市場', highschool: '高中', hospital: '醫院', university: '大學', museum: '博物館', stadium: '體育場',
  annex: '大建築', viaduct: '高架道路', gas: '加油站', cityhall: '市政廳', bank: '銀行', culture: '文化中心', coldstore: '冷鏈倉庫', square: '廣場', daycare: '托兒所', recycling: '回收站', workshop: '維修工坊', farm: '農田', library: '圖書館', pool: '游泳池', ktv: 'KTV', amusement: '遊樂園', temple: '廟', mall: '大型商場', casino: '賭場', cinema: '電影院', parking: '停車場',
};

/** What each kind of home is called, and who tends to live in it. */
export const homeKindNames: Record<HomeKind, [string, string]> = {
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
export const eventText: Record<CityEvent['kind'], string> = {
  fire: '失火沒人救，燒掉一棟，附近的人會怕一個月',
  'fire-out': '失火了，消防車趕到撲滅了',
  crime: `遭小偷沒人管，損失 $${services.crime.loss}，附近的人會怕一個月`,
  robbery: `銀行遭搶，城市損失 $${services.robbery.loss}，附近居民受到驚嚇`,
  'robbery-stopped': '銀行發生搶劫，警方已阻止',
  'crime-stopped': '遭小偷，警車趕到抓到人了',
  sick: '有人生病，附近沒有診所，搬走了',
  'sick-helped': '有人生病，救護車送去診所了',
  flood: '河水淹進來沒人救，附近的人會怕一個月',
  'flood-helped': '河水淹進來，消防隊抽乾了',
  crash: '發生車禍，現場暫時壅塞',
  'crash-cleared': '發生車禍，警方到場疏導',
  'crash-hospital': '車禍有傷者，已派救護車送醫',
  'crash-no-hospital': '車禍有傷者，附近沒有可到場的醫院',
  'nightmarket-open': '週末夜市今晚出攤',
  'market-restocked': '市場已補到食材',
  flu: '流感，附近沒有診所，有人病倒搬走了',
};

/** What each kind of person is called, and what they do to the city. */
export const traitNames: Record<Trait, [string, string]> = {
  rich: ['有錢人', '繳兩倍的稅'],
  driver: ['愛開車', '絕對不搭公車和捷運'],
  rider: ['愛搭車', '有車可搭就一定搭'],
  helper: ['熱心助人', '讓失火、小偷、生病變少'],
  gardener: ['綠手指', '讓自己住的地方地價變高'],
};

/** Where the people on each shift work, in the order of `shifts`. */
export const workplaceNames = ['工廠', '工廠', '店鋪', '辦公室'];

/** What happened to a resident, for the list of recent events. */
export function newsText({ kind, name, shift, car }: PersonNews): string {
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
export const howLong = (days: number) =>
  days < 30 ? `${days} 天` : days < 360 ? `${Math.floor(days / 30)} 個月` : `${Math.floor(days / 360)} 年`;

export const wayNames: Record<Way, string> = { walk: '走路', bike: '騎腳踏車', scooter: '騎機車', drive: '開車',
  bus: '搭公車', metro: '搭捷運' };

/** What people own, in the order of Wealth's `vehicles`. */
export const vehicleNames = ['腳踏車', '機車', '小車', '房車', '名車'];

export const placeNames: Record<Place, string> = { shops: '商店', market: '市場', park: '公園', school: '學校',
  clinic: '看病的地方', stop: '車站', temple: '廟', fun: '玩的地方' };

/** How close-knit a home is, as a word. */
export const bondWord = (value: number) => value >= bond.close ? '很好' : value >= bond.distant ? '普通' : '冷淡';

/** What someone is doing right now, in a sentence. */
export function doingText(doing: Doing, shift: number | undefined, way: Way | undefined): string {
  if (doing === 'socializing') return '到社區中心聚會';
  if (doing === 'care') return '參加日間照護活動';
  if (doing === 'remembering') return '在紀念花園散步、追思';
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
    case 'nightmarket': return '到廟口逛夜市';
    case 'school': return '送孩子上小學';
    case 'highschool': return '送孩子上高中';
    case 'university': return '到大學上課';
    case 'cinema': return '到電影院看電影';
    case 'pool': return '到游泳池游泳';
    case 'ktv': return '到 KTV 唱歌';
    case 'amusement': return '到遊樂園遊玩';
    case 'casino': return '到賭場娛樂';
    case 'museum': return '參觀博物館';
    case 'stadium': return '到體育場參加活動';
    case 'delivering': return '騎車送外送';
    case 'takeout': return '叫了外送在家吃';
    case 'bakery': return '到烘焙坊買麵包';
    case 'flowers': return '到花店買花';
    case 'cake': return '到蛋糕店買蛋糕';
    case 'clinic': return '到診所看診';
    case 'hospital': return '到醫院就醫';
    case 'referred': return '轉診到醫院';
    case 'daycare': return '接送孩子';
    case 'bank': return '到銀行辦事';
    case 'exhibition': return '在文化中心看展、逛市集';
    case 'reading': return '在社區圖書館看書';
    case 'chinatown': return '在唐人街逛街、吃點心';
    case 'temple': return '在附近的廟裡拜拜、跟鄰居聊天';
    case 'online': return '附近沒有店，在家用手機訂日用品';
    case 'outing': return '放假，去附近好玩的地方逛逛';
    case 'family': return '在家陪小孩';
    case 'day-off': return '放假，在家睡到自然醒';
  }
}

/** What is on someone's mind, in their own words. */
export const thoughtNames: Record<Thought, string> = {
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
export const thoughtTags: Record<Thought, string> = {
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

/** How business is at a workplace, and what that does to pay. */
export const tradeNames = { busy: ['很好', '客人很多，薪水多五成'], good: ['好', '薪水多兩成五'], quiet: ['冷清', '客人少，薪水照常'] } as const;

/** The special groups: what each is called, how to make one and what it does, and a clue for one not yet found. */
export const comboNames: Record<Combo, [string, string, string]> = {
  forest: ['森林', `公園連 ${combos.forest.tiles} 格。旁邊地價 +${combos.forest.value.amount}，住宅變森林小屋。`, '公園夠大的話…'],
  riverpark: ['河濱公園', `大公園（${combos.riverpark.tiles} 格以上）靠著水。旁邊地價 +${combos.riverpark.value.amount}。`, '公園和水…'],
  farmstead: ['農莊', `農田連 ${combos.farmstead.tiles} 格且有一格靠水。收成多五成，旁邊住宅變農家。`, '農田夠大又有水…'],
  arcade: ['商圈', `${combos.arcade.side} × ${combos.arcade.side} 的商店全部 3 級。有遊客收入。`, '一整塊最高級的商店…'],
  arts: ['藝文街區', '文化中心附近有公園和同路網的市場。', '展覽和市集聚在一起…'],
  coldchain: ['食材配送網', '冷鏈倉庫、市場和農田以道路相連。每天收貨與配送，斷路後市場會消耗庫存。', '冷藏設備把農產品送到市場…'],
  nightmarket: ['廟口夜市', '廟、廣場和餐飲店接在同一條路網上。傍晚開攤，增加觀光收入。', '廟旁有廣場，也有吃的…'],
  interchange: ['轉乘商圈', '公車和捷運有步行轉乘點，附近有店家。要有乘客實際轉乘。', '兩種車在這裡交會…'],
  familyquarter: ['家庭生活圈', '托兒所、公園和住宅相連。每所托兒所有八個名額。', '接完孩子可以去公園…'],
  localbusiness: ['社區商業街', '銀行和附近住宅、店家相連。貸款支援正常營業的店家升級。', '銀行照顧附近的小店…'],
  workshop: ['循環工坊', '回收站、維修工坊和工廠相連。有員工上班才會把回收材料做成商品。', '舊東西也能重新利用…'],
  bookquarter: ['書香街區', '圖書館周圍 4 格內有公園及 2 棟同一路網的住宅，可提升附近地價。', '圖書館旁有住家和綠地…'],
  chinatown: ['唐人街', '廟宇周圍 5 格內有 3 棟住宅與 2 間店鋪，同一路網相連。', '廟旁逐漸形成住商街區…'],
  fair: ['廟會', `廟的 ${combos.fair.reach} 格內有市場和公園。有遊客收入。`, '廟的旁邊熱鬧起來…'],
  foodstreet: ['美食街', `市場 ${combos.foodstreet.reach} 格內有 ${combos.foodstreet.shops} 間店。有遊客收入。`, '市場被店家圍起來…'],
  plaza: ['車站商圈', `捷運站 ${combos.plaza.reach} 格內有 ${combos.plaza.shops} 間店。有遊客收入。`, '捷運站出口都是店…'],
  funcity: ['娛樂城', `賭場 ${combos.funcity.reach} 格內有電影院和商場。有大筆遊客收入。`, '好玩的地方蓋在一起…'],
  campus: ['文教區', `高中 ${combos.campus.reach} 格內有小學和公園。旁邊地價 +${combos.campus.value.amount}。`, '學校聚在一起…'],
  medical: ['醫療園區', `醫院 ${combos.medical.reach} 格內有診所。旁邊地價 +${combos.medical.value.amount}。`, '看病的地方聚在一起…'],
  estate: ['工業園區', `工廠連 ${combos.estate.buildings} 棟。產量多兩成五，污染也多三成。`, '工廠連成一片…'],
  port: ['港口', '工業園區靠著水。產量和污染同工業園區，另有出口收入。', '工廠連成一片，又在水邊…'],
};

/** The groups that are a place in themselves, and so name the tile. */
export const PLACES_OF: readonly Combo[] = ['forest', 'riverpark', 'farmstead'];

export const nickNames = { cabin: '森林小屋', farmhouse: '農家' };

/** What each task asks for. */
export const taskNames: Record<TaskId, string> = {
  power: '把電送到每一棟', water: '把水送到每一棟', police: '讓每一棟都有警察照顧', jobs: '讓大家找得到工作',
  commute: '縮短上班路程', air: '把空氣弄乾淨', school: '讓住宅附近有小學', clinic: '讓住宅附近有診所',
  parks: '讓居民走得到公園', 'transit-cover': '把路線延伸到住宅區',
  highschool: '讓住宅附近有高中', hospital: '讓住宅附近有醫院', staff: '幫店家和工廠找到人',
};

/** The seasons, festivals, policies and challenges: what each is called, and what it does or needs. */
export const seasonNames: Record<Season, [string, string]> = {
  spring: ['春', '一切照常'],
  summer: ['夏', '農田多兩成，電廠多花一成五，河邊可能淹水'],
  autumn: ['秋', '農田多五成'],
  winter: ['冬', '農田只剩三成，電廠多花三成，可能有流感'],
};

export const festivalNames: Record<FestivalId, [string, string]> = {
  newyear: ['新年煙火', '要有大公園；有森林或河濱公園更多'],
  temple: ['廟會', '要有廟；有廟口夜市更多'],
  games: ['運動會', '要有高中；有體育場加倍'],
  harvest: ['豐年祭', '要有農田；有農莊更多'],
  market: ['歲末市集', '要有市場；有商場或商圈更多'],
};

export const policyNames: Record<Policy, [string, string]> = {
  recycle: ['垃圾分類', '工廠污染少兩成。每人每月 $0.5。'],
  freeride: ['免費搭車', '搭車的人變多，但沒有車票收入。'],
  patrol: ['夜間巡邏', '遭小偷的機會減半。每人每月 $0.4。'],
  festive: ['節慶補助', '節日收入多五成。每月 $200。'],
};

export const challengeNames: Record<ChallengeId, string> = { grow: '人口', riders: '搭車的人', top: '3 級建築' };

/** The businesses a decision can bring to one of the city's shops. */
export const brandNames: Record<Brand, string> = { lottery: '彩券行', kiosk: '彩券小舖', branch: '外商分店', studio: '片場紀念店' };

/** Decisions that come up: the question, then what each answer does and the word on its button. */
export const dilemmaNames: Record<DilemmaId, [string, [string, string], [string, string]]> = {
  investor: ['外地企業想投資', ['收下', '+$5,000，開一間外商分店，但 90 天內比較沒人想來'], ['婉拒', '扶植本地店家，60 天內更多人想來']],
  film: ['劇組想來拍片', ['免費借', '+$2,000，留下一間紀念店，60 天內更多人想來'], ['收場地費', '+$4,000']],
  volunteers: ['居民想辦掃街', ['市府出錢', '−$1,000，60 天內更多人想來'], ['發感謝狀', '−$300，小有幫助']],
  donor: ['富商想捐款', ['收進市庫', '+$3,000'], ['請他辦活動', '90 天內更多人想來']],
  fair: ['鄰鎮邀請合辦市集', ['出錢參加', '−$1,500，60 天內更多人想來'], ['只去觀摩', '拿補助 +$500']],
  lottery: ['彩券行想進駐', ['全面開放', '+$3,500，開一間彩券行，但 60 天內比較沒人想來'], ['限量開放', '+$1,500，只開一間小舖']],
};

/** How a city can look. */
export const themeNames: Record<Theme, string> = { classic: '原本', sf: '舊金山', california: '加州', newyork: '紐約' };

export const thoughtTone = (thought: Thought) => thoughtWeights[thought] < 0 ? 'bad' as const : 'good' as const;

/** A mood from 0 to 100 as a word. */
export const moodWord = (mood: number) => mood >= mind.glad ? '開心' : mood >= mind.low ? '普通' : '不開心';

export const serviceNames: Record<Service, string> = { fire: '消防', police: '警察', school: '小學', clinic: '診所',
  community: '社區中心', familyclinic: '家庭診所', eldercare: '日間照護', memorial: '紀念花園',
  bakery: '烘焙坊', florist: '花店', cakeshop: '蛋糕店',
  market: '市場', highschool: '高中', hospital: '醫院', university: '大學', museum: '博物館', stadium: '體育場',
  temple: '廟', mall: '商場', casino: '賭場', cinema: '電影院', parking: '停車場',
  library: '圖書館', pool: '游泳池', ktv: 'KTV', amusement: '遊樂園', gas: '加油站', cityhall: '市政廳', bank: '銀行', culture: '文化中心', coldstore: '冷鏈倉庫', square: '廣場', daycare: '托兒所', recycling: '回收站', workshop: '維修工坊' };

/** How full a road is, in the words of the traffic view's four colours. */
export const trafficName = (load: number) =>
  load <= 0.5 ? '順暢' : load <= 1 ? '車多' : load <= 1.5 ? '塞車' : '嚴重塞車';
