import type { Service } from './TileMap';

/**
 * Public services. A station covers every tile within its radius (horizontal plus vertical
 * distance); unlike power and water there is no limit on how many buildings it serves.
 */
export const services = {
  radius: { fire: 12, police: 12, school: 10, clinic: 10, market: 8, highschool: 14, hospital: 18,
    university: 22, museum: 16, stadium: 20, temple: 8, mall: 14, casino: 10, cinema: 8, parking: 3,
    library: 8, pool: 8, ktv: 6, amusement: 16 } satisfies Record<Service, number>,
  /** What each service a tile is covered by adds to its land value. */
  value: { fire: 5, police: 6, school: 8, clinic: 6, market: 4, highschool: 5, hospital: 5,
    university: 6, museum: 6, stadium: 5, temple: 3, mall: 4, casino: -4, cinema: 3, parking: 0,
    library: 4, pool: 3, ktv: -1, amusement: 4 } satisfies Record<Service, number>,
  /**
   * The city rank (how many population milestones it has passed) from which each may be
   * built. Bigger cities get bigger buildings.
   */
  unlock: { library: 1, pool: 2, ktv: 2, amusement: 3, temple: 1, parking: 1, cinema: 2, mall: 3, casino: 4, market: 1, highschool: 2, hospital: 3, museum: 3, university: 4, stadium: 5 } as
    Partial<Record<Service, number>>,
  /** A market lets this many residents do their shopping, on top of what the shops manage. */
  market: { shoppers: 120 },
  /** Sights bring visitors: money per resident of the city each month, up to `most`. */
  visitors: { museum: { perResident: 0.8, most: 1500 }, stadium: { perResident: 1.2, most: 4500 },
    cinema: { perResident: 0.3, most: 600 }, mall: { perResident: 1, most: 3000 },
    casino: { perResident: 1.6, most: 5000 }, pool: { perResident: 0.2, most: 400 },
    ktv: { perResident: 0.4, most: 800 }, amusement: { perResident: 1.2, most: 3500 } } as
    Partial<Record<Service, { perResident: number; most: number }>>,
  /** A car park within `reach` tiles of a sight brings it this many times the visitors. */
  parking: { reach: 4, boost: 1.25 },
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
export const expectations: readonly { population: number; service: 'school' | 'clinic' | 'highschool' | 'hospital';
  penalty: number }[] = [
  { population: 150, service: 'school', penalty: 8 },
  { population: 400, service: 'clinic', penalty: 8 },
  { population: 700, service: 'highschool', penalty: 6 },
  { population: 1200, service: 'hospital', penalty: 6 },
];

/**
 * A fire nobody put out or a theft nobody stopped frightens the neighbourhood. For `days` days,
 * within `reach` tiles of it: nobody moves into the homes, land is worth `value` less, shops keep
 * only a `shops` share of their jobs because customers stay away, and a school, high school or
 * university stops serving anyone because parents keep their children at home.
 */
export const scare = { reach: 4, days: 30, value: 8, shops: 0.6 };
export const SCHOOLS: readonly Service[] = ['school', 'highschool', 'university'];

export const SERVICES: readonly Service[] = ['fire', 'police', 'school', 'clinic',
  'market', 'highschool', 'hospital', 'university', 'museum', 'stadium', 'temple',
  'mall', 'casino', 'cinema', 'parking', 'library', 'pool', 'ktv', 'amusement'];

/** What else a building does for the tiles in its reach: a hospital is also a clinic. */
export const alsoServes: Partial<Record<Service, Service>> = { hospital: 'clinic' };
