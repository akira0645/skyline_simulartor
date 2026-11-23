# 汽車素材：程式繪製，無影像模型

目前 `hatchback-views.png` 與 `hatchback-slices.png` 由 `tools/bake-cars.py` 呼叫 `tools/vehicle_master.py`，從同一份 48×88×48 程式立體原稿輸出。先畫完整結構、再烘焙 192px 原稿並縮小成 96px 遊戲圖集。`car-master-turntable.png` 保留未縮小原稿。沿用 pixel-art-studio 的原配色與人工／自動品質檢查。舊生圖原型已封存於 `../generated-archive/`，遊戲與重製流程均不讀取它們。

目前沿用專案內 [sprite-stacking](https://github.com/danielwh2/sprite-stacking) skill（MIT）的切片渲染流程，汽車共 48 層。不要把診斷四視圖再次雕刻成切片，否則會破壞同一體積的車頂、玻璃與輪軸尺寸。`hatchback-check.png` 與 `../handmade/specs/hatchback-view-*.json` 保留舊版結果；目前輸出以這裡的原稿、切片與 `cars-preview.png` 為準。

```powershell
python tools/bake-cars.py
python tools/draw_bicycles.py
python tools/check-vehicle-art.py
```

需要 Python、Pillow 與 NumPy，不需要網路或生成工具。遊戲建置直接使用已保存的 PNG 與 JSON，不執行 Python。`draw-handmade.py` 仍會輸出舊版汽車診斷稿；若執行了它，請最後執行上述汽車烘焙指令，恢復目前原稿。

圖集規格：96×96 的固定 frame、每列 16 個方向，方向 0 朝東，順時針；支點固定為 (48,56)。每個汽車尺寸各有九列車色：五種一般色、三種高級色、黃色計程車。素材密度為每個世界像素四個素材像素。車頭朝向用地面座標判斷；整個物件烘焙完才加外框，禁止逐層加框。

## 建築

`buildings-preview.png` 保留原有建築的程式細節補強對照，由 `tools/draw_tiles.py` 與 `tools/detail-buildings.py` 產生，無影像模型。目前十二種代表建築及公共設施改用獨立的程式繪製素材，詳見 `../handmade/README.md`。
