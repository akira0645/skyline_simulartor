# Large landmark pixel art

Continue the approved code-drawn street style with four complete 2x2 facilities: hospital, university, museum and stadium. Each has a 128x128 native integer-pixel source, twice the small-building grid, and occupies 64x64 world pixels. Details retain the small-building pixel size instead of enlarging an existing 1x1 facade.

Authoring is in `tools/pixel_landmarks.py`. `draw-handmade.py` writes sparse pixel-art-studio JSON and renders native PNGs; `bake-street.py` creates four 256-pixel-frame theme atlases using nearest-neighbor scaling. Medical crosses, badges, field markings, floodlights and the clock face retain their identifying colors during architectural recoloring.

`StreetArt.drawLandmark` renders one complete frame at the existing large-building anchor. `TileRenderer` selects it only for the four authored facilities at the established detail zoom. Existing footprint, simulation, construction costs, old distant art, housing complexes and other landmarks are preserved.

The review page adds a Large Buildings view with the same renderer and atlas. Check all four themes, native source hygiene, full-frame anchoring and opacity. Independent visual review is in `landmark-review.json`; the stadium's rings have simpler directional lighting, and the university/museum silhouettes benefit from their game labels for exact identification.
