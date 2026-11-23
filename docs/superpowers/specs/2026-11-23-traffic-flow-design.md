# Traffic flow after physical body clearance

The approved direction is to retain real vehicle clearance while improving body sizing, following and junction admission. Keep existing cruising speeds. This batch does not add lane changing, additional avenue lanes or adaptive signal timing.

## Research and choice

Simply increasing speed can improve free-road capacity, but cannot resolve a blocked downstream exit. SUMO describes gross time headway as `(length + minGap) / speed + tau`: body length, standstill gap and response headway all matter. Separate the visible body from its safety gap instead of giving motorcycles the same footprint as large cars.

- [SUMO road capacity](https://sumo.dlr.de/docs/Simulation/RoadCapacity.html)
- [IDM author's model explanation](https://traffic-simulation.de/info/info_IDM.html)
- [SUMO intersection simulation](https://sumo.dlr.de/docs/Simulation/Intersections.html)
- [Factorio developer explanation of chain signals](https://www.factorio.com/blog/post/fff-81)

IDM uses own speed, bumper gap and relative speed to choose acceleration. Adapt that model to tile/millisecond game units; real-road numerical parameters would be inappropriate here. Factorio's chain signals offer a useful game analogy: do not enter a shared crossing unless the relevant exit has room. This is a road-specific implementation of that principle, not a copy of railway block rules.

## Implementation

`VehicleGeometry` supplies dimensions to rendering and occupancy. Passenger tiers retain their drawn 7x3 through 13x7 pixel bodies; outlines add two pixels to each dimension. Freight and bus bodies remain distinct. The existing one-pixel hard clearance remains separate.

`RoadFollowing` applies bounded IDM acceleration with an 80 ms simulation headway and an additional 1/64-tile standstill gap. These are game calibration values. Leader detection uses bumper clearance and projected speed, excludes the opposing lane and avoids treating rear vehicles as leaders. The existing swept rectangle checks remain the final collision constraint.

`JunctionFlow` checks the exit pose of the whole vehicle before admitting it past its stop line. Consecutive junction tiles form one protected box. Conflicting movements reserve the box until the rear clears it; opposing straight lanes may proceed together. A ready request waiting at least 500 ms temporarily prevents newer conflicting admissions so that turns can drain. Only vehicles near the stop line with no queue ahead can claim that priority; a turn behind a straight car must not trap its own leader. Red lights prevent entry; a vehicle already inside continues clearing. Admission is conservative for turns and does not model every lane connector.

Commuters, buses and freight use the same junction coordinator and following controller. Freight remains authoritative in 50 ms simulation steps. Rendered actors advance in bounded substeps against the available street occupancy snapshot; this is not a global simultaneous solver, so frame cadence can still affect transient commuters. The art preview also uses the following controller. Freight reservation and speed state is saved and validated; old saves without those fields still load. Transient commuter/bus reservations are excluded from saves and removed when actors disappear or the renderer detaches. Road edits revalidate reservations.

## Verification

- Eight vehicles following a slower leader at unchanged cruising limits, with pairwise body clearance checked every step. The regression requires over 75% fewer fully stopped samples than the previous binary controller, while retaining at least 95% of its travel distance. This is a synthetic moving-queue result, not a city-wide throughput claim.
- Stopped leader braking, gradual restart, category-specific sizes and opposing-lane exclusion.
- Occupied exit, cross traffic exclusion, opposing straight admission, adjacent junctions, red changes, waiting-turn fairness and reservation validation.
- Integrated moving straight/crossing/turning vehicles remain outside a blocked box, then all finish without overlap.
- Freight saved inside a reserved junction replays identically after loading, including cargo and reports.
- Existing pause, cadence, freight, city balance and economy suites; production build.

The existing macro congestion/load model is retained. These changes do not create unlimited capacity: sustained demand above road or junction capacity still needs a network or transit solution. Parked decorative bodies and the existing clock-derived ambulance return animation remain outside the shared moving-vehicle scheduler.

Validation on 2026-11-23: `npm run test:fast` passed 58 files / 229 tests; `npm run test:simulation` passed 11 files / 42 tests. Production build, final TypeScript check and final Vite build passed. Vite retains the existing large-bundle advisory. These checks establish automated controller and simulation behavior; city-wide visual acceptance and throughput measurement remain separate.
