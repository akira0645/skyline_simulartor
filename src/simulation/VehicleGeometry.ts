import { TILE_SIZE } from './TileMap';

/** World pixels, shared by rendering and physical traffic. Include the outline in road bodies. */
export const passengerVehicleSizes = [[7, 3], [8, 4], [10, 6], [12, 6], [13, 7]] as const;
export const vehicleSizes = {
  freight: { length: 16, width: 7 }, bus: { length: 17, width: 7 }, metro: { length: 16, width: 8 },
  fire: { length: 14, width: 7 }, crime: { length: 11, width: 6 }, sick: { length: 13, width: 7 },
} as const;
export const passengerBodySize = (tier: number) => {
  const [length, width] = passengerVehicleSizes[tier] ?? passengerVehicleSizes[4];
  return { length: (length + 2) / TILE_SIZE, width: (width + 2) / TILE_SIZE };
};
export const roadBodySize = (kind: keyof typeof vehicleSizes) => ({
  length: (vehicleSizes[kind].length + 2) / TILE_SIZE, width: (vehicleSizes[kind].width + 2) / TILE_SIZE,
});
