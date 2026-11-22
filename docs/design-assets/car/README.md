# 汽車素材：程式繪製，無影像模型

目前 `hatchback-views.png` 與 `hatchback-slices.png` 都由 `tools/draw-handmade.py` 呼叫 `tools/pixel_actors.py`，從同一組程式像素立體結構輸出。四個診斷視圖的像素 JSON 在 `../handmade/specs/hatchback-view-*.json`，由本機 pixel-art-studio renderer 輸出。舊生圖原型已封存於 `../generated-archive/`，遊戲與重製流程均不讀取它們。

目前沿用專案內 [sprite-stacking](https://github.com/danielwh2/sprite-stacking) skill（MIT）的現成切片渲染流程，汽車共 24 層。不要把診斷四視圖再次雕刻成切片，否則會破壞同一體積的車頂、玻璃與輪軸尺寸。`hatchback-check.png` 保留先前雕刻結果，不代表目前車體；目前結構審查見 `../handmade/actor-review.json` 與 `cars-preview.png`。遊戲內使用淺高度投影，與轉盤預設角度不同。

```powershell
python tools/draw-handmade.py
python tools/bake-cars.py
```

需要 Python、Pillow 與 NumPy。第一步使用本機 pixel-art-studio renderer，路徑設定見 `../handmade/README.md`；第二步只需已保存的切片，不需要網路或生成工具。遊戲建置直接使用 `src/assets/vehicles/cars.png` 與 `cars.json`，不執行 Python。

圖集規格：96×96 的固定 frame、每列 16 個方向，方向 0 朝東，順時針；支點固定為 (48,56)。每個汽車尺寸各有九列車色：五種一般色、三種高級色、黃色計程車。素材密度為每個世界像素四個素材像素。車頭朝向用地面座標判斷；整個物件烘焙完才加外框，禁止逐層加框。

## 建築

`buildings-preview.png` 保留原有建築的程式細節補強對照，由 `tools/draw_tiles.py` 與 `tools/detail-buildings.py` 產生，無影像模型。目前十二種代表建築及公共設施改用獨立的程式繪製素材，詳見 `../handmade/README.md`。
