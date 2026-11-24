# 建築外型原稿

使用者確認的方向是外型差異，不是只細化原來的方塊。`exteriors/silhouette-studies.png` 保存確認用的 15 款量體草案；草案本身不是正式圖集。

`tools/building_exteriors.py` 以原生幾何繪製斜屋頂、退縮樓層、騎樓、分翼、圓筒、穹頂與橢圓建築，再由 `tools/building_masters.py` 映射到原有圖集位置。原稿是 256px／大型 512px，輸出近看 128px／大型 256px，一般圖從相同外觀縮小成 32px／大型 64px。沒有影像生成。

```powershell
python tools/building_masters.py
python tools/check-building-masters.py
```

需要 Python、Pillow、NumPy；一般遊戲打包只讀取保存的 PNG。原有 `draw_tiles.py`／`draw_tiles_hd.py` 仍供構圖歷史及未更新特殊設施使用，若執行它們，須最後執行新的原稿產生器，避免覆蓋本批外型。

本批更新 127 個原有建築框格中的 108 個，四種城市共 432 個外觀框格；未更新 19 個特殊設施保留發布版內容。`manifest.json` 逐項標出 `updated` 與外型家族，不把所有框格算成全新建築。

`city-master.png` 僅保存本批更新原稿，不載入遊戲。`before-after-6x.png` 是同倍率的前後對照，`master-to-game.png` 比較原稿與 1×／3×／6×。`all-buildings-*.png` 標示 NEW／retained，`verification.json` 記錄框格、縮小來源、輪廓改變、未更新框格及地面保留檢查。

遊戲圖集尺寸維持一般 512×544、近看 2048×2176；每套近看 RGBA 仍為 17 MiB。原有各主題按需載入與地圖快取不變。
