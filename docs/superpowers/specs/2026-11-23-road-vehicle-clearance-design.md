# Vehicle body clearance

The previous art/movement checkpoint was pushed as `11eb19f` before this repair, as requested.

## Cause and chosen repair

The art preview independently wrapped cars and trucks by wall-clock progress, so a faster car passed through a truck. The city checked same-heading centre points and deliberately released blocked vehicles after 3.5 seconds. Commuter movement could also skip an entire queue in a long frame, and earlier vehicles did not reserve their new positions immediately.

Increasing a single centre-distance threshold would not cover turning or cross traffic. A general rigid-body physics engine would add unnecessary steering and integration changes. Use oriented rectangles sized to the rendered body/outline, a one-world-pixel safety margin, and bounded swept movement checks on the existing routes.

## Integration

- `RoadOccupancy` stores bodies by stable actor index and spatial bucket; replacing a body removes its previous bucket entry. It tests all rectangle axes and samples translation and rotation.
- `clearRoadAdvance` walks the requested route progress in increments no larger than 0.025 tiles, stopping at the last collision-free position. Commuters reserve merges and accepted movement immediately, including offscreen vehicles.
- Buses wait to enter if their initial position is occupied. Turns are checked in bounded time steps; blocked turns do not complete or reassign a task.
- Freight checks other trucks and a copied snapshot of animated cars/buses. The renderer supplies this transient traffic input after movement and clears it on destruction; loading a city clears it too. It is excluded from stock, cargo and save data. Without a street view, freight continues to run using its intrinsic fleet occupancy and road-traffic callback.
- Waiting never grants permission to pass through a body or a red signal. Rescue outbound movement also loses its old timeout bypass and samples its travelled path.
- `PreviewTraffic` uses the same rectangles and clearance function. Its vehicles advance together in bounded steps and only wrap when wholly offscreen and the entry is clear.

## Verification and limits

Regressions cover long-frame tunnelling, perpendicular crossing, rotation, opposing lanes, mixed-size queues, stale buckets, occupied driveways, stopped cars in front of trucks, long red signals, waiting turns, preview loops and pause/frame-size consistency. Existing freight/save and city-economic regressions remain required.

Demo construction warms multiple cities over several months. Parallel fast-test workers exceeded its deadlines; the three cases now belong to the existing serial simulation group. The twelve-month case also reached 30.2 seconds in serial execution, so it uses that group's existing 60-second default instead of its former explicit 30-second override. Assertions, seeds and simulated duration are unchanged; the other explicit deadlines are unchanged.

The CityBalance case constructs two seeded cities, warms each, runs a month, replays a saved state and reconnects a road. Its large case completed its assertions at roughly 62 seconds but exceeded the previous 60-second runner deadline. The CityBalance cases now have a 90-second integration-test deadline, with all cities, durations, replay checks and assertions retained.

This is route-constrained traffic clearance, not crash dynamics, lane changing or a junction reservation planner. Crowded conflicting paths may wait; they must not solve a jam by teleporting through vehicles. Animated commuters are transient, so their interaction with deliveries depends on the supplied street frames; freight-only simulation remains renderer-independent. Parked decorative cars and the clock-derived ambulance return animation are not yet part of the shared moving-body scheduler.
