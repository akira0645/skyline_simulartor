import type { Service } from './TileMap';

/**
 * Public services. A station covers every tile within its radius (horizontal plus vertical
 * distance); unlike power and water there is no limit on how many buildings it serves.
 */
export const services = {
  radius: { fire: 12, police: 12, school: 10, clinic: 10 } satisfies Record<Service, number>,
  /** What each service a tile is covered by adds to its land value. */
  value: { fire: 5, police: 6, school: 8, clinic: 6 } satisfies Record<Service, number>,
  /** From this population on, buildings without police lose land value and report crime. */
  crime: { population: 100, penalty: 10, loss: 300 },
  /**
   * Fires. From this population on there is one roll a day: the chance grows with the number
   * of buildings up to `max`, and one building is picked. A fire station in reach puts it out;
   * otherwise the building burns down and its lot stands empty.
   */
  fires: { population: 100, perBuilding: 0.0006, max: 0.1 },
};

/**
 * The three kinds of emergency, each rolled once a day with the chance above. The service in
 * reach deals with it; without one a fire burns the building down, a theft costs the city
 * `crime.loss`, and someone taken ill moves away.
 */
export const emergencies = [
  { service: 'fire', trouble: 'fire', handled: 'fire-out' },
  { service: 'police', trouble: 'crime', handled: 'crime-stopped' },
  { service: 'clinic', trouble: 'sick', handled: 'sick-helped' },
] as const;

/**
 * What a growing city expects. From each population on, a home out of reach of the service
 * loses `penalty` land value and says so.
 */
export const expectations: readonly { population: number; service: Service; penalty: number }[] = [
  { population: 150, service: 'school', penalty: 8 },
  { population: 400, service: 'clinic', penalty: 8 },
];

export const SERVICES: readonly Service[] = ['fire', 'police', 'school', 'clinic'];
