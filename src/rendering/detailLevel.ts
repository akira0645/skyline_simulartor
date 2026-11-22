/** Preserve half-pixel detail at medium zoom and quarter-pixel representative art close up. */
export const DETAIL_ZOOM = 1.75;

export function terrainResolution(zoom: number): number {
  return zoom >= 3 ? 4 : zoom >= DETAIL_ZOOM ? 2 : zoom >= 1 ? 1 : zoom >= 0.5 ? 0.5 : 0.25;
}
