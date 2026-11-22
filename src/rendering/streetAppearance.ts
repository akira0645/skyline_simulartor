import atlas from '../assets/street/atlas.json';

export type StreetBuilding = 'house' | 'apartment' | 'shop' | 'office' | 'factory' | 'school';

/** Only the approved representative families are replaced in this first art pass. */
export function streetBuilding(column: number, row: number): StreetBuilding | undefined {
  if (row === 2 && [0, 1, 2, 10].includes(column)) return 'house';
  if (row === 2 && [3, 4, 6, 7].includes(column)) return 'apartment';
  if (row === 3 && [0, 1, 3].includes(column)) return 'shop';
  if (row === 3 && [2, 6].includes(column)) return 'office';
  if (row === 4 && [0, 3, 6].includes(column)) return 'factory';
  if (row === 5 && column === 4) return 'school';
  if (row === 8 && [2, 3, 14, 15].includes(column)) return 'house';
  if (row === 9 && [0, 1, 4, 5, 10, 11].includes(column)) return 'apartment';
  if (row === 11 && [0, 1].includes(column)) return 'factory';
  return undefined;
}

export function personDirection(heading: number): number {
  return ((Math.round(heading / (Math.PI / 2)) % 4) + 4) % 4;
}

const routeColours = new Map(atlas.truckColours.map((hex, row) => [parseInt(hex, 16), row]));
export function truckColourRow(colour: number): number {
  return routeColours.get(colour) ?? 0;
}
