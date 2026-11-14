/**
 * How people change jobs. Everyone keeps the job they have for as long as the workplace stands,
 * has room and can be reached. Once a day a few homes are looked at, and one person in each
 * may move to another workplace that has room.
 */
export const jobs = {
  /** The share of homes looked at each day, and the least and most of them. */
  review: { share: 0.1, min: 1, max: 40 },
  /** Someone moves to a job that is at least this many minutes nearer. */
  nearer: 6,
  /** For the kind of work they like, or for a change, someone accepts a commute this much longer. */
  extra: 6,
  /** The chance that someone who is looked at changes jobs just for a change. */
  restless: 0.03,
};
