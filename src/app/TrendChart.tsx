import { useState } from 'react';

export interface TrendPoint {
  /** What to call the moment, e.g. "1 年 3 月 12 日". */
  when: string;
  value: number;
}

const WIDTH = 248;
const HEIGHT = 84;
const TOP = 8;
const BOTTOM = HEIGHT - 6;

/**
 * One figure over time as a single line. Hovering shows the value at that moment; without a
 * pointer the heading carries the latest value, so the number is never colour-only or hover-only.
 */
export function TrendChart({ title, points, format }:
  { title: string; points: readonly TrendPoint[]; format: (value: number) => string }) {
  const [hover, setHover] = useState<number>();
  if (points.length < 2) {
    return <section className="trend"><h2>{title}</h2><p className="hint">時間再過一下就會有線。</p></section>;
  }

  const values = points.map(point => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const x = (index: number) => index / (points.length - 1) * WIDTH;
  const y = (value: number) => BOTTOM - (value - low) / span * (BOTTOM - TOP);
  const shown = points[hover ?? points.length - 1];

  return (
    <section className="trend">
      <h2>{title}<span>{format(shown.value)}</span></h2>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
        aria-label={`${title}：從 ${format(points[0].value)} 到 ${format(values.at(-1)!)}`}
        onPointerMove={event => {
          const box = event.currentTarget.getBoundingClientRect();
          const index = Math.round((event.clientX - box.left) / box.width * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, index)));
        }}
        onPointerLeave={() => setHover(undefined)}>
        <line className="grid" x1={0} x2={WIDTH} y1={TOP} y2={TOP} />
        <line className="grid" x1={0} x2={WIDTH} y1={BOTTOM} y2={BOTTOM} />
        <polyline className="line" points={points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')} />
        {hover !== undefined && <>
          <line className="cross" x1={x(hover)} x2={x(hover)} y1={0} y2={HEIGHT} />
          <circle className="dot" cx={x(hover)} cy={y(points[hover].value)} r={4} />
        </>}
      </svg>
      <p className="scale">
        <span>最低 {format(low)}</span>
        <span>{hover === undefined ? `最高 ${format(high)}` : shown.when}</span>
      </p>
    </section>
  );
}
