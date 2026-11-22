"""Run pixel-art-studio checks on native code art; preserve warnings for visual review.

python tools/check-handmade.py
Hard failures: non-binary alpha, >40 colours, >5% isolated colour pixels, or accidental doublies.
Whole-image pillow-shading warnings require visual review because roofs and walls differ in value.
"""
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SKILL = Path.home() / '.claude/skills/pixel-art-studio/scripts/quality_check.py'


def main():
    spec = importlib.util.spec_from_file_location('pixel_studio_quality', SKILL)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    art = ROOT / 'docs/design-assets/handmade'
    paths = sorted((art / 'people').glob('*.png')) + sorted(art.glob('*-view-*.png'))
    paths += [ROOT / f'docs/design-assets/street/{name}-source.png' for name in
              ['house', 'apartment', 'shop', 'office', 'factory', 'school', 'tree', 'power', 'water', 'fire', 'police', 'clinic', 'warehouse']]
    results, hard = [], []
    for path in paths:
        result = module.evaluate_image(str(path), palette_cap=40)
        image = np.array(Image.open(path).convert('RGBA'))
        findings = result['findings']
        if not set(np.unique(image[..., 3])).issubset({0, 255}):
            hard.append(f'{path.name}: fractional alpha')
        if findings['palette']['over_cap']:
            hard.append(f'{path.name}: over palette cap')
        if findings['orphans']['orphan_ratio'] > 0.05:
            hard.append(f'{path.name}: orphan ratio > 5%')
        if findings['doublies']['doublies_count'] > 2:
            hard.append(f'{path.name}: accidental double lines need review')
        results.append(result)
    output = dict(art_source='code', image_model_used=False, frames_checked=len(results), hard_failures=hard,
                  automated_results=results, note='Pillow-shading, hue and other warnings are retained, not silently waived. See independent visual review.')
    (art / 'quality-report.json').write_text(json.dumps(output, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(frames_checked=len(results), hard_failures=hard,
                         warnings=sum(bool(x['summary']['issues'] or x['summary']['warnings']) for x in results))))
    if hard:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
