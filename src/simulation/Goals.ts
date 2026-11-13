/** What a goal can look at: the city's figures as `BuildingSystem.getStats()` reports them. */
export interface GoalView {
  population: number;
  employed: number;
  buildings: number;
  riders: number;
  budget: { net: number };
  complaints: Record<string, number>;
  goods: { made: number; needed: number };
  /** Buildings at levels 1, 2, 3 and 4. */
  levels: number[];
  bigParks: number;
  complexes: number;
}

/**
 * Things to aim for, roughly from first to last. Each pays its reward once, the first time
 * its condition holds; the ones done are saved by id, so ids must not change.
 */
export const goals: readonly { id: string; title: string; hint: string; reward: number;
  done: (city: GoalView) => boolean }[] = [
  { id: 'first-homes', title: '讓 10 個人搬進來', hint: '鋪一條路，在路旁劃住宅區。', reward: 500,
    done: city => city.population >= 10 },
  { id: 'jobs', title: '讓 30 個人有工作', hint: '在路旁劃商業區和工業區。', reward: 500,
    done: city => city.employed >= 30 },
  { id: 'utilities', title: '10 棟以上的建築全部有水有電', hint: '在路旁蓋電廠和水塔，看框線照顧得到哪裡。', reward: 1000,
    done: city => city.buildings >= 10 && city.complaints['no-power'] === 0 && city.complaints['no-water'] === 0 },
  { id: 'profit', title: '每月淨賺 $1,000', hint: '人越多稅收越多；少蓋用不到的設施。', reward: 1500,
    done: city => city.budget.net >= 1000 },
  { id: 'village', title: '人口達到 150 人', hint: '需求的長條告訴你現在缺哪一種分區。', reward: 2000,
    done: city => city.population >= 150 },
  { id: 'level3', title: '有一棟建築升到 3 級', hint: '有水電、有服務、靠近公園的地段，住滿了就會升級。', reward: 1500,
    done: city => city.levels[2] + city.levels[3] > 0 },
  { id: 'goods', title: '100 人以上，民生用品自己做得夠', hint: '工廠的員工越多，做的民生用品越多。', reward: 1500,
    done: city => city.population >= 100 && city.goods.made >= city.goods.needed },
  { id: 'transit', title: '有 20 個人搭公車或捷運', hint: '在住宅和工作的地方各蓋一站，再到「路線」把站連起來。', reward: 2000,
    done: city => city.riders >= 20 },
  { id: 'big-park', title: '蓋出一座大公園', hint: '把 6 格以上的公園連在一起。', reward: 1000,
    done: city => city.bigParks > 0 },
  { id: 'complex', title: '蓋出一座集合住宅', hint: '讓排成 2 × 2 的四棟住宅都升到 3 級並住滿。', reward: 3000,
    done: city => city.complexes > 0 },
  { id: 'town', title: '人口達到 500 人', hint: '路開始塞的時候，改鋪大道或拉公車、捷運。', reward: 5000,
    done: city => city.population >= 500 },
  { id: 'city', title: '人口達到 1,500 人', hint: '往河的另一邊發展需要橋。', reward: 10000,
    done: city => city.population >= 1500 },
];
