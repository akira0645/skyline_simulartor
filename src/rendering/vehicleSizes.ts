/** World pixels: an ordinary car is 10–13×6–7; road vehicles must fit one lane. */
export const vehicleSizes = {
  freight: { length: 16, width: 7 },
  bus: { length: 17, width: 7 },
  metro: { length: 16, width: 8 },
  fire: { length: 14, width: 7 },
  crime: { length: 11, width: 6 },
  sick: { length: 13, width: 7 },
} as const;
