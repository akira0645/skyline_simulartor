import type { TransitKind } from '../simulation/Transit';

/**
 * One colour per line, by the line's own number so it keeps its colour when other lines come
 * and go. There are as many colours as the simulation allows lines.
 */
const COLOURS = [0xe5484d, 0x3b82f6, 0xf2c94c, 0xa56eff, 0xff8a3d, 0x2ec4b6];

export const lineColour = (id: number): number => COLOURS[(id - 1) % COLOURS.length];
export const lineColourCss = (id: number): string => `#${lineColour(id).toString(16).padStart(6, '0')}`;
export const lineName = (line: { id: number; kind: TransitKind }): string =>
  `${line.kind === 'bus' ? '公車' : '捷運'} ${line.id} 號`;
