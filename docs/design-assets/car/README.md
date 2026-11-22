# 汽車素材：程式繪製，無影像模型

目前 `hatchback-views.png` 全由 `tools/draw-handmade.py` 在整數像素網格繪製。四個原始視圖的像素 JSON 在 `../handmade/specs/hatchback-view-*.json`，由本機 pixel-art-studio renderer 輸出，再交給 sprite-stacking 切片。舊生圖原型已封存於 `../generated-archive/`，遊戲與重製流程均不讀取它們。

四視圖以專案內的 [sprite-stacking](https://github.com/danielwh2/sprite-stacking) skill（MIT）切成 24 層。四視圖與切片檢查圖已目視檢查；遊戲內使用淺高度投影，與轉盤預設角度不同。

```powershell
python tools/draw-handmade.py
python .agents/skills/sprite-stacking/scripts/views_to_slices.py docs/design-assets/car/hatchback-views.png docs/design-assets/car/hatchback-slices.png --slices 24 --order reading --top-nose down --colours 32 --shade 0.12 --preview docs/design-assets/car/hatchback-check.png --html work/car-preview/turntable.html
python tools/bake-cars.py
```

需要 Python、Pillow 與 NumPy。第二步只需已保存的切片，不需要 skill、網路或生成工具。遊戲建置直接使用 `src/assets/vehicles/cars.png` 與 `cars.json`，不執行 Python。

圖集規格：96×96 的固定 frame、每列 16 個方向，方向 0 朝東，順時針；支點固定為 (48,56)。每個汽車尺寸各有九列車色：五種一般色、三種高級色、黃色計程車。素材密度為每個世界像素四個素材像素。車頭朝向用地面座標判斷；整個物件烘焙完才加外框，禁止逐層加框。

## 建築

`buildings-preview.png` 保留原有建築的程式細節補強對照，由 `tools/draw_tiles.py` 與 `tools/detail-buildings.py` 產生，無影像模型。本輪六種代表建築改用獨立的程式繪製素材，詳見 `../handmade/README.md`。
