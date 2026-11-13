# Pixel City Simulator

首頁提供 128 × 128 格草地地圖。選道路拖曳鋪設直線，選住宅、商業或工業拖曳劃設矩形分區，選拆除後點擊地塊。選移動或按住滑鼠中鍵拖曳地圖，使用滾輪縮放。重新整理會重置地圖。

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
- `src/simulation/` 包含純 TypeScript 的 `SimulationEngine` 與 `WorldState` 骨架。獨立的 TypeScript 設定只載入 ECMAScript 標準函式庫。未來可由 Web Worker 匯入核心，並傳送可結構化複製的狀態快照。

## 模擬時間

上方顯示目前 Tick，可切換暫停、1×、2× 或 4×。1× 每秒推進一個 Tick，畫面幀率不影響模擬進度。
