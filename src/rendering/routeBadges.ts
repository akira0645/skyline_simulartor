import type { Graphics } from 'pixi.js';
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
/** Tiny pixel numbers stay legible alongside the game's pixel art without allocating text each frame. */
export function numberBadge(g: Graphics, x: number, y: number, value: number, colour: number): void {
  const digits = String(value);
  const width = digits.length * 8 + 4;
  g.rect(x - 1, y - 1, width + 2, 14).fill(0x1b1d22).rect(x, y, width, 12).fill(colour);
  [...digits].forEach((digit, at) => {
    const bits = DIGITS[Number(digit)];
    for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
      if (bits[row * 3 + col] === '1') g.rect(x + 2 + at * 8 + col * 2, y + 1 + row * 2, 2, 2).fill(0xffffff);
    }
  });
}
