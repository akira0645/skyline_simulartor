# 手繪感像素素材：code-drawn, no image model

本輪依使用者要求，將先前生圖製作的汽車、貨車、六種代表建築、樹木與人物，全部重作為程式繪製。沒有描摹或讀取舊生成圖片，也沒有呼叫影像模型。

## 來源與風格

- 可編輯來源：`tools/draw-handmade.py`，逐像素使用整數座標、有限色盤、三至四階材質明暗。
- 每個原型的 sparse pixel JSON：`specs/`。來源 PNG 由本機 `pixel-art-studio/scripts/render.py` 從這些像素資料渲染。
- 建築原生 64×64；樹木 64×128；人物 32×48，每個方向包含一個站立 pose 與六個行走 pose。
- 保留像素群組、少量不對稱裝飾、屋瓦筆觸與不同窗戶反光，不使用模糊、照片紋理或隨機像素噪點。
- 四種城市配色共享本輪代表原型。完整建築庫的各城市獨立造型仍是後續階段，不把原有其他建築誤記為已全部重畫。

## 重製

```powershell
python tools/draw-handmade.py
python tools/bake-cars.py
python tools/bake-street.py
python tools/check-handmade.py
```

人物與車體結構在 `tools/pixel_actors.py`。車輛以同一組程式像素體積輸出切片與四視圖，沿用 sprite-stacking 的現成切片渲染流程；四視圖只作診斷，不再重新雕刻，避免車頂、玻璃與輪胎尺寸互相衝突。舊 `hatchback-check.png` 與 `truck-check.png` 是先前雕刻結果，不代表目前素材；目前結構以 `actor-review.jpg` 與烘焙圖集為準。

`draw-handmade.py --skill-dir <pixel-art-studio目錄>` 可指定 skill 路徑，預設為使用者主目錄下 `.claude/skills/pixel-art-studio`。Pillow 與 NumPy 是必要依賴。`check-handmade.py` 預設使用同一位置的品質檢查工具。

## 遊戲與預覽

遊戲從 `src/assets/street/` 與 `src/assets/vehicles/` 讀取烘焙圖集，來源記錄為 `artSource: code`；不執行 Python、不讀取舊生圖素材。

`/tools/street-preview.html` 使用與遊戲相同的 `StreetArt`、`CarSprites`，可選四種城市配色、1／3／6 倍縮放及播放／暫停。遊戲從 1.75 倍使用新近看素材；最高縮放 6 倍，底圖快取在 3 倍後提高至四倍解析度。

## 品質紀錄

`quality-report.json` 保留 53 張原生圖的完整自動檢查結果，並檢查實色像素、40 色上限、孤立像素比例及意外雙線。自動工具的枕頭式陰影／色相警告不能直接等同實際美術缺陷：深色屋頂與淺色牆面會影響整張圖的明度比較，因此另有獨立目視審查。不要將接觸表的文字、底色或多方向的總色數當成單張原生素材結果。

`provenance.json` 記錄來源與色盤。先前的生成原型保留於 `../generated-archive/`，只作歷史備份，不是本輪素材來源。

`review.json` 保留舊版審閱歷史。目前 53 張原生圖無硬性失敗，14 張有啟發式警告；人物與車輛的獨立目視審查在 `actor-review.json`（86 分），新增六種公共建築在 `civic-review.json`（88 分），均無阻擋問題。警局盾牌與消防火焰已放大重畫並再次複查；小尺寸下電廠標誌及藍色車窗對比仍有改善空間。各自的自動警告與目視解釋均保留，沒有以單一分數抹去問題。

人物依實際位移累積步行距離，停步不繼續踏步，轉向使用位移方向並保留對角附近的朝向，減少來回翻面。預覽的「檢查人物與車體」提供四方向及車體角度對照，「下一幀」可逐格查看；檢查模式刻意原地播放。遊戲與完整街景則依路徑移動。


## 第二批公共建築與道路間距

`tools/pixel_civic.py` 以相同色盤和 64×64 原生網格繪製發電廠、水塔、消防局、警察局、診所及倉庫。圖集目前包含 12 種建築；公共設施已接入遊戲近看顯示，可在預覽點「公共設施」切換。另有四種 2×2 建築已在下一批完成；其他地標與交通站點仍使用既有素材，未宣稱全部重畫。

車身間距與路徑檢查使用 `src/simulation/RoadOccupancy.ts`；預覽的快車會等待慢貨車，畫面在 `traffic-spacing.jpg`。詳細交通修正與範圍見 `docs/superpowers/specs/2026-11-23-road-vehicle-clearance-design.md`。

## 第三批大型公共建築

`tools/pixel_landmarks.py` 繪製醫院、大學、博物館及體育場，原生 128×128，世界占地 64×64；四城市圖集在 `src/assets/street/landmarks-*.png`，每個 frame 為 256×256。畫面以完整大圖接到既有建築錨點，沒有把四個小格各貼一棟。預覽按「大型建築」查看；截圖在 `landmark-street.jpg`。

獨立審查在 `landmark-review.json`，88 分、沒有阻擋問題。體育場看台的方向明暗較簡化，大學與博物館仍需遊戲標籤精確指明用途。球場白線、照明燈及鐘面已獨立保護，避免城市配色吞掉辨識細節。其餘後續素材見 `remaining-assets.md`。
