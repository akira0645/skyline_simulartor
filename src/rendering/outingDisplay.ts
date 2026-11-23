/** Reserve one bounded display slot for a real bicycle; no extra or invented trips. */
export function acceptOutingForDisplay(vehicle: number, shown: number, motors: number, limit: number): boolean {
  return shown < limit && (vehicle === 0 || motors < limit - 1);
}
