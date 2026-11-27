# ErgScan

Reads a photo of a Concept2 PM5 results screen into a workout, and keeps a history of workouts to review and compare.

## Language

**Structure**:
The shape of a workout: its machine (500 m or 1000 m splits), its type (distance piece, time piece or intervals), the size of each piece, the number of intervals and the rest after each. Uneven intervals, such as a pyramid, have no structure.
_Avoid_: Format, template, workout type

**Split**:
One row of a workout's results table: a stretch of work, or a rest between intervals.
_Avoid_: Lap, segment

**Pace**:
The time it takes to cover the workout's split distance (500 m, or 1000 m on a BikeErg) at the speed held. A lower pace is faster.
_Avoid_: Split (for this time), /500m, speed

**Matched workouts**:
Workouts with exactly the same structure, whatever they are named.
_Avoid_: Efforts, matched efforts, repeats, same workout
