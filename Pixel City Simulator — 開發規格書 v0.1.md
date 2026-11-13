# Pixel City Simulator — 開發規格書 v0.1

## 1. 專案目標

開發一款以 2D 像素風格呈現、具備深度城市經營模擬的網頁遊戲。

參考《Cities: Skylines》與《TheoTown》的城市發展機制，但自行實作城市模擬演算法與遊戲系統。

核心特色：

- 玩家自由規劃道路及土地用途。
- 建築物根據需求自動發展。
- 居民具有居住、就業與交通需求。
- 道路壅塞影響城市發展。
- 市政府必須維持財政平衡。
- 各個城市系統彼此影響。

## 2. 技術規格

| 項目 | 技術 |
|---|---|
| 程式語言 | TypeScript |
| 前端框架 | React |
| 2D 渲染 | PixiJS |
| 專案工具 | Vite |
| 模擬引擎 | 獨立 TypeScript 模組 |
| 背景運算 | Web Worker |
| 資料儲存 | IndexedDB |
| 單元測試 | Vitest |
| 版本管理 | Git |

開發原則：

1. 遊戲邏輯與畫面渲染完全分離。
2. 模擬核心不依賴 React 或 PixiJS。
3. 所有遊戲操作透過統一 Command API 執行。
4. 採用固定時間步長，避免模擬速度受 FPS 影響。
5. 複雜計算可轉移至 Web Worker。
6. 模擬結果必須能透過自動化測試驗證。
7. 遊戲參數集中管理，避免散落在程式碼中。

## 3. 第一版開發範圍

版本：v0.1 — City Foundation

### 3.1 地圖系統

- 建立 128 × 128 格地圖。
- 每格邏輯尺寸對應 32 × 32 像素。
- 支援草地、道路、住宅分區、商業分區、工業分區。
- 支援滑鼠拖曳地圖。
- 支援滾輪縮放。
- 支援滑鼠點擊與拖曳建造。
- 地圖資料使用一維陣列或 TypedArray 管理。
- 預留 Chunk 管理介面。

### 3.2 道路系統

- 支援直線道路鋪設。
- 支援拆除道路。
- 支援道路自動連接貼圖。
- 支援道路交叉口與轉角。
- 建立道路連通關係。
- 建築必須有有效道路接入點才能發展。
- 預留 RoadGraph 介面供後續交通尋路。

### 3.3 分區系統

提供三種類型：

- Residential：住宅
- Commercial：商業
- Industrial：工業

規則：

- 玩家可透過拖曳劃設分區。
- 分區不得直接覆蓋道路。
- 分區必須具有有效道路連接才可產生建築。
- 建築會根據需求逐步生成。
- 第一版採用 1 × 1 格建築，預留多格建築支援。

### 3.4 基礎人口與需求

- 每棟住宅具有居住容量。
- 每棟商業及工業建築具有工作容量。
- 系統定期統計人口、職缺及空屋。
- 使用簡化的住宅、商業、工業需求模型。
- 新建築出現後，人口與就業統計逐步更新。
- 需求與人口成長公式集中在設定檔，可由測試驗證。

此階段不建立完整的個別家庭 AI。

### 3.5 時間系統

- 支援暫停。
- 支援 1×、2×、4× 速度。
- 採固定模擬 Tick。
- 城市發展以遊戲時間推進。
- 不允許畫面 FPS 直接控制模擬結果。

### 3.6 存檔系統

- 儲存完整城市地圖及模擬狀態。
- 支援手動存檔和讀取。
- 使用 IndexedDB。
- 存檔具有 schemaVersion。
- 載入時必須檢查資料版本與完整性。

## 4. 核心資料結構

```ts
type ZoneType =
  | "none"
  | "residential"
  | "commercial"
  | "industrial";

type TerrainType = "grass" | "water";

interface Tile {
  terrain: TerrainType;
  zone: ZoneType;
  roadId: number | null;
  buildingId: number | null;
}

interface Building {
  id: number;
  type: Exclude<ZoneType, "none">;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  capacity: number;
  occupants: number;
  roadAccessId: number | null;
}

interface CityStats {
  population: number;
  availableHousing: number;
  totalJobs: number;
  occupiedJobs: number;
  residentialDemand: number;
  commercialDemand: number;
  industrialDemand: number;
}

interface WorldState {
  version: number;
  seed: number;
  tick: number;
  width: number;
  height: number;
  tiles: Tile[];
  buildings: Building[];
  stats: CityStats;
  treasury: number;
}
```

RoadGraph、Household 與 Economy 的完整介面在後續階段擴充，不在 v0.1 實作未使用的複雜資料。

## 5. Command API

所有玩家操作必須經過統一指令系統。

預計支援：

```ts
type GameCommand =
  | {
      type: "BUILD_ROAD";
      path: Array<{ x: number; y: number }>;
    }
  | {
      type: "REMOVE_ROAD";
      x: number;
      y: number;
    }
  | {
      type: "SET_ZONE";
      tiles: Array<{ x: number; y: number }>;
      zone: ZoneType;
    }
  | {
      type: "DEMOLISH";
      x: number;
      y: number;
    };
```

每個指令必須：

1. 驗證座標和操作合法性。
2. 成功時更新城市資料。
3. 失敗時回傳明確錯誤。
4. 通知需要重新渲染的地圖區域。
5. 不允許 UI 直接修改 WorldState。

## 6. 遊戲介面

主畫面包含：

- 中央：城市地圖。
- 頂部：城市名稱、人口、資金、日期。
- 底部：道路、分區、拆除等工具。
- 側邊：選取地塊或建築的詳細資訊。
- 時間控制：暫停、1×、2×、4×。
- 除錯模式：Tick、FPS、建築數及模擬耗時。

像素風格規則：

- 以 32 × 32 像素格為基本單位。
- 使用適合像素風的縮放與貼圖設定。
- 避免模糊插值。
- 先使用簡單暫用素材，再替換正式美術。
- 像素素材應有清楚的格線與一致的視角。

## 7. Codex 開發任務

### Task 01 — 初始化專案

建立 React、TypeScript、Vite、PixiJS、Vitest 專案。

驗收：
- `npm run dev` 可以啟動。
- `npm run build` 成功。
- `npm run test` 成功。

### Task 02 — 地圖與攝影機

實作 TileMap、Camera、TileRenderer。

驗收：
- 地圖正確顯示。
- 可以拖曳和縮放。
- 滑鼠座標可正確轉換至格子座標。
- 攝影機移動不會修改地圖資料。

### Task 03 — 遊戲工具

實作工具列、道路建造、拆除和分區繪製。

驗收：
- 道路可連續鋪設。
- 分區可使用拖曳方式建立。
- 不合法的操作不會破壞世界狀態。
- 畫面可即時更新。

### Task 04 — 模擬時鐘

建立 SimulationEngine 與 SimulationClock。

驗收：
- 暫停時模擬停止。
- 2× 和 4× 正確增加模擬推進速度。
- 相同的模擬輸入與隨機種子產生相同結果。

### Task 05 — 建築與城市成長

建立 BuildingSystem、ZoneDemandSystem。

驗收：
- 有道路接入的分區可產生建築。
- 無道路接入的分區不能發展。
- 建築容量正確影響人口與職缺統計。
- 人口成長由明確規則控制，不使用無限制隨機成長。

### Task 06 — 儲存與讀取

實作 SaveManager。

驗收：
- 儲存後重新開啟遊戲可還原城市。
- 建築、道路、分區、人口和時間資料一致。
- 損壞或不相容存檔不會造成遊戲崩潰。

### Task 07 — 整合與測試

整合完整遊戲流程。

驗收：
- 玩家能從空白地圖發展出小型城市。
- 支援連續運行多個遊戲月份。
- 沒有明顯的記憶體持續增長。
- 所有單元測試與建置檢查通過。

## 8. 後續版本

### v0.2 — Traffic Foundation

- RoadGraph
- A* 尋路
- 住宅與工作地點配對
- 道路容量
- 交通流量分配
- 通勤時間
- 壅塞熱力圖

### v0.3 — Population Simulation

- Household 模型
- 家庭收入
- 就業配對
- 通勤成本
- 居民滿意度
- 遷入與遷出

### v0.4 — Economy Simulation

- 政府稅收
- 維護費用
- 財政預算
- 土地價值
- 企業經營
- 城市需求與經濟回饋

### v0.5 — Advanced City

- 公共運輸
- 教育
- 醫療
- 公共安全
- 污染
- 進階交通 AI

## 9. Codex 工作規則

Codex 必須遵循：

1. 一次只實作目前指定的 Task。
2. 開始修改前先檢查既有架構。
3. 不擅自引入大型依賴。
4. 不破壞已通過的功能。
5. 每個模組具有明確輸入與輸出。
6. 新增模擬演算法時應提供單元測試。
7. 完成任務後執行測試和建置。
8. 說明修改檔案、測試結果與已知限制。
9. 不自行宣稱未執行的測試已通過。
10. 除非必要，不提前實作下一階段功能。

## 10. 第一個可玩版本完成定義

v0.1 完成時，玩家應能：

進入一張空白地圖，建造道路，劃設住宅、商業和工業區，觀察建築物隨時間出現及城市人口增加，並可儲存、重新載入城市。

此版本的主要成果是建立可持續擴充的城市模擬基礎，而不是一次完成全部經營功能。
