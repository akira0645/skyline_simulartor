# Pixel City Simulator

首頁提供 128 × 128 格草地地圖。選道路拖曳鋪設直線，選住宅、商業或工業拖曳劃設矩形分區，選拆除後點擊地塊。選查看後點擊地塊，右側面板會顯示該地塊的類型、道路接入與建築狀態。按「除錯」顯示 Tick、FPS 與每個 Tick 的模擬耗時。選移動或按住滑鼠中鍵拖曳地圖，使用滾輪縮放。

按「儲存」把城市寫入瀏覽器的 IndexedDB，按「讀取」還原上次儲存的城市。只有一個存檔欄位，再次儲存會覆寫。重新整理後地圖會重置，需按「讀取」取回城市。

目前的實作狀態、與規格書的差異，以及 v0.2 的設計提案，見 [`docs/v0.2-design-proposal.md`](docs/v0.2-design-proposal.md)。

## 本機啟動

需要 Node.js 20.19+（20.x）或 22.12+，以及 npm。

```sh
npm ci
npm run dev
```

在瀏覽器開啟 Vite 終端機顯示的網址。若 PowerShell 封鎖 npm.ps1，請以 npm.cmd 執行上述指令。重新安裝依賴前，先用 Ctrl+C 停止開發伺服器。

```sh
npm run build
npm run test
```

建置先獨立檢查模擬核心，再檢查應用程式並輸出至 `dist/`。Vitest 在 Node 環境執行。

## 專案架構

- `src/app/` 負責 React 主畫面及畫布生命週期。
- `src/rendering/` 管理 PixiJS 畫布。
- `src/assets/city.png` 是自製的道路、分區空地與建築圖塊，由 `python tools/draw_tiles.py`（需要 Pillow）產生；要改圖就改腳本再重跑。草地、樹與灌木沿用 `tiles.png`（Kenney，CC0）。
- `src/storage/` 透過 IndexedDB 存取存檔。存檔格式與完整性檢查在 `src/simulation/SaveData.ts`。
- `src/simulation/` 包含純 TypeScript 的 `SimulationEngine` 與 `WorldState` 骨架。獨立的 TypeScript 設定只載入 ECMAScript 標準函式庫。未來可由 Web Worker 匯入核心，並傳送可結構化複製的狀態快照。

## 模擬時間

上方顯示遊戲日期，可切換暫停、1×、2× 或 4×。1× 每秒推進一個 Tick，一個 Tick 是一天，每月 30 天、每年 12 個月（設定在 `src/simulation/calendar.ts`），畫面幀率不影響模擬進度。

## 城市成長

鋪路後在道路正旁邊劃分區。每兩個 Tick 最多生成一棟建築，依劃設順序檢查道路接入和需求。住宅提供 4 人容量，商業與工業分別提供 3、5 個職缺。現階段住宅完工即入住，就業總數取人口與職缺的較小值。拆除或改劃地塊會移除該地塊的建築。
