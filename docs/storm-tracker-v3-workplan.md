# Storm Tracker v3 — Work Plan and Guardrails

**Status: LOCKED WORK PLAN**

Storm Tracker v3 is a clean-sheet temporal storm-tracking system.

This document is the governing work plan and architectural guardrail for the
subproject.

Previous tracking implementations are outside the design of v3 and must not be
used as fallback implementations or as sources of tracking behaviour.

---

# 1. Objective

Determine physically defensible temporal relationships between storm
observations in successive radar frames.

Storm Tracker v3 shall produce:

- continuation;
- birth;
- death;
- split;
- merge;
- persistent storm identity;
- motion;
- relationship confidence;
- uncertainty;
- diagnostics explaining every accepted relationship.

A missing relationship is preferable to an unsupported relationship.

---

# 2. Governing pipeline

Normalized radar field t-1
Normalized radar field t
        |
        v
FIELD MOTION ESTIMATION
        |
        v
Dense motion field
+ uncertainty
        |
        v
GEOMETRY ADVECTION
        |
        v
Predicted storm geometry
+ uncertainty
        |
        v
TEMPORAL CANDIDATE GRAPH
        |
        v
PHYSICAL ADMISSIBILITY
        |
        v
Sparse relationship graph
        |
        v
LINEAGE RESOLUTION
        |
        +-- continuation
        +-- birth
        +-- death
        +-- split
        +-- merge
        |
        v
PERSISTENT IDENTITY
        |
        v
TRACK-SPECIFIC MOTION
        |
        v
Persistent storm track

Forecasting, storm evolution, threat assessment and presentation are
downstream concerns.

---

# 3. Non-negotiable guardrails

1. V3 is a clean-sheet implementation.

2. V3 must not fall back to any previous tracking implementation.

3. Provider-specific tracking logic is forbidden.

4. Missing evidence remains unknown.

5. No relationship is preferable to an unsupported relationship.

6. Persistent identity is assigned only after temporal relationships have been
   established.

7. Motion used to support initial association must be measurable independently
   of persistent storm identity.

8. Birth, death, split and merge are normal outcomes.

9. Distance alone can never establish continuation.

10. Spatial overlap alone can never establish continuation.

11. Track longevity and number of matches are not optimization objectives.

12. Every accepted relationship must retain diagnostic evidence explaining why
    it exists.

13. Uncertainty is mandatory.

14. Detection and tracking remain separate.

15. Forecasting cannot influence historical association.

16. Machine learning is deferred until the deterministic tracker passes real
    replay validation.

17. No provider-specific exception may be introduced because one replay fails.

18. No threshold becomes a default based on a single provider or weather event.

19. Later functionality must never compensate for failure of an earlier
    scientific gate.

20. Production integration is forbidden until all required scientific gates
    have passed.

---

# 4. Algorithm A — Radar field motion

## Primary algorithm

Use:

**Pyramidal Lucas–Kanade feature tracking followed by robust interpolation to a
dense motion field.**

Processing:

radar fields
    |
    v
usable-data mask
    |
    v
feature detection
    |
    v
pyramidal Lucas-Kanade tracking
    |
    v
forward/backward consistency filtering
    |
    v
local vector outlier rejection
    |
    v
robust interpolation
    |
    v
dense motion field

Required output:

- east displacement / velocity;
- north displacement / velocity;
- support;
- confidence;
- uncertainty.

Unsupported areas remain unavailable.

Unsupported areas must never become zero motion.

---

# 5. Independent motion comparator

Use:

**TREC-style local normalized cross-correlation.**

Purpose:

- independently validate Lucas-Kanade motion;
- identify major disagreement;
- provide scientific comparison.

TREC is initially a validation comparator.

It is not an automatic runtime fallback.

If Lucas-Kanade fails validation, stop and review the motion algorithm.

---

# 6. Motion uncertainty

Motion uncertainty shall be derived from observable evidence such as:

- feature-tracking residual;
- forward/backward error;
- local vector spread;
- number of supporting vectors;
- interpolation distance;
- disagreement between independent estimators;
- radar-data availability.

Insufficient evidence means:

motion unavailable

not:

0 m/s

---

# 7. STOP GATE A — Synthetic motion recovery

No association code may be implemented until this passes.

Synthetic test cases:

- stationary;
- east;
- west;
- north;
- south;
- diagonal;
- different speeds;
- partial data loss;
- added noise;
- intensity variation;
- moderate deformation.

Initial quantitative gate:

- median displacement error <= 1 radar pixel;
- median direction error <= 10 degrees for meaningful displacement;
- stationary median error <= 0.25 pixel/frame;
- no gross direction reversals in clean translation;
- no accepted vectors without support;
- uncertainty increases when data quality degrades.

If this fails:

**STOP. Redesign motion estimation.**

---

# 8. STOP GATE B — Real radar motion

Test consecutive real radar fields before object association exists.

Initially use AEMET COMPO because it provides a demanding real-data case.

Compare:

- Lucas-Kanade motion;
- TREC motion;
- actual next-frame radar structure.

Required properties:

- coherent vectors over coherent precipitation regions;
- unsupported areas remain unsupported;
- no dependence on persistent storm identity;
- advected radar structure agrees better with the next frame than a no-motion
  prediction;
- major disagreement between independent estimators reduces confidence;
- no widespread physically implausible motion.

No artificial global storm-speed limiter may be used to make this gate pass.

If this fails:

**STOP. Redesign motion estimation.**

---

# 9. Algorithm B — Geometry advection

For each previous storm observation:

1. sample valid field-motion vectors over and around the storm geometry;
2. calculate a robust local motion estimate;
3. calculate local motion spread and uncertainty;
4. advect the storm geometry;
5. produce predicted geometry and prediction uncertainty.

Initial robust estimator:

**component-wise median of valid local vectors.**

Persistent storm history must not be required for this prediction.

---

# 10. Geometry prediction gate

Before association exists, compare predicted geometry with the next radar frame.

Measure:

- predicted-centroid error;
- predicted polygon overlap;
- geometry distance;
- intersection/coverage;
- prediction uncertainty.

Required property:

The physically corresponding next-frame structure should generally agree
better with the advected geometry than unrelated nearby structures.

If advection does not materially improve prediction:

**STOP.**

---

# 11. Algorithm C — Temporal relationship graph

Represent observations in consecutive frames as a bipartite graph.

Previous observations are one node set.

Current observations are the second node set.

Edges represent possible physical temporal relationships.

An edge is not an identity.

Persistent identity does not exist yet.

---

# 12. Algorithm D — Physical admissibility

Candidate relationships initially use four evidence groups:

## Predicted spatial agreement

Compare the current geometry with the advected previous geometry.

Possible measures:

- intersection;
- IoU;
- predicted-centroid residual;
- geometry distance.

## Motion residual

Measure candidate displacement relative to field-derived prediction and its
uncertainty.

Distance alone cannot create an edge.

## Scale consistency

Compare storm-object scale across frames.

Large changes do not automatically reject a relationship, but they may indicate:

- split;
- merge;
- unstable segmentation;
- unrelated object.

## Reflectivity compatibility

Compare normalized radar evidence while preserving its measurement semantics.

Measurement, estimate and lower-bound values must not be silently treated as
equivalent exact observations.

---

# 13. Hard admissibility before scoring

Relationship processing is:

physical admissibility
        |
        v
surviving edges
        |
        v
relationship scoring

A strong score in one dimension must never rescue a physically inadmissible
candidate.

Thresholds must be established through validation rather than guessed in
advance.

---

# 14. Relationship scoring

Only admissible edges receive scores.

Initial score evidence:

- predicted geometry agreement;
- normalized motion residual;
- area compatibility;
- reflectivity compatibility.

All score components must remain inspectable.

A single opaque score is insufficient.

Diagnostic output should include values such as:

- predicted overlap;
- motion residual;
- normalized residual;
- area ratio;
- reflectivity compatibility;
- support;
- uncertainty;
- confidence.

---

# 15. No maximum-match objective

The tracker shall not optimize for the largest possible number of continuations.

When continuation is unsupported:

death + birth

is preferable to forcing:

old identity -> unrelated new observation

Persistent-track count is not a quality metric.

---

# 16. STOP GATE C — Candidate graph purity

Test before persistent IDs exist.

Synthetic cases:

- simple continuation;
- nearby unrelated storm;
- crossing storms;
- disappearance;
- new nearby appearance;
- rapid growth;
- rapid decay;
- one-to-two split;
- two-to-one merge.

Required:

- true relationships are represented;
- clearly unrelated observations receive no edge;
- the candidate graph remains sparse;
- distance alone never creates an edge;
- disappearance does not force continuation;
- nearby appearance does not inherit identity.

If obvious false edges remain common:

**STOP. Redesign admissibility.**

---

# 17. Algorithm E — Lineage resolution

Graph topology defines relationship type:

1 -> 1
continuation

1 -> 0
death

0 -> 1
birth

1 -> N
split

N -> 1
merge

N -> M
complex / ambiguous

Complex ambiguous structures remain unresolved unless a deterministic validated
decomposition exists.

They must not be forced into convenient one-to-one matches.

---

# 18. Initial lineage implementation

Implement first:

- continuation;
- birth;
- death.

Do not implement split or merge until basic lineage passes real validation.

This is an explicit early scientific gate.

---

# 19. Algorithm F — Persistent identity

Persistent identity is assigned only after lineage is resolved.

Validated continuation:
retain identity.

Birth:
create identity.

Death:
terminate identity.

Identity itself must never influence relationship acceptance.

---

# 20. STOP GATE D — Real tracking challenge

Run continuation/birth/death tracking against demanding real radar sequences.

Initially use AEMET sequences because they expose dense and unstable radar-object
situations.

Evaluate:

- continuations;
- births;
- deaths;
- unresolved observations;
- track duration;
- motion residual;
- area discontinuity;
- reflectivity discontinuity;
- trajectory-speed distribution;
- relationship confidence.

Failure indicators include:

- widespread unsupported spatial jumps;
- widespread extreme apparent velocities caused by association;
- extreme scale discontinuity treated as ordinary continuation;
- identity preservation despite weak predicted relationship;
- dependence on a global emergency speed limiter.

The tracker must produce plausible temporal relationships without requiring a
global speed ceiling to prevent bad identities.

If this fails:

**STOP before split, merge, persistence, evolution or forecast.**

---

# 21. Algorithm G — Split lineage

Implement only after STOP GATE D passes.

A one-to-many topology may represent a split when multiple child observations
have independently supported relationships with one parent.

Retain:

- parent identity;
- child relationships;
- supporting evidence;
- confidence;
- time.

Proximity alone cannot establish split lineage.

---

# 22. Algorithm H — Merge lineage

Implement only after split validation.

A many-to-one topology may represent a merge when multiple parents have
independently supported relationships with the same child.

All supported parent lineage must remain visible.

Nearby unrelated tracks must not be consumed.

---

# 23. Algorithm I — Storm-specific motion

Only after validated lineage exists.

Use:

**robust linear regression over accepted storm positions through time.**

Output:

- eastMps;
- northMps;
- speedMps;
- courseDeg;
- sampleCount;
- residual;
- confidence;
- method.

Track-derived motion is compared with field-derived motion.

Large disagreement must lower confidence or leave motion unavailable.

Track motion must not manufacture lineage.

---

# 24. Persistence

Persistence and restore are implemented only after the scientific tracking model
passes.

Persistence must preserve:

- identity;
- lineage;
- accepted history;
- uncertainty;
- diagnostics.

Persistence must not change tracking semantics.

---

# 25. Forecast

Forecast is downstream.

Initial method:

validated geometry
    +
validated motion
    +
uncertainty
    |
    v
geometry advection

No valid motion means no motion forecast.

Unknown motion must not become stationary motion.

Forecast uncertainty increases with horizon.

Forecast never modifies historical identity.

---

# 26. Reserved Plan B

If field motion passes but storm-object association remains unstable because the
object representation itself fragments or merges physical storms, investigate:

**hierarchical radar-region tree tracking.**

This changes the storm-object representation and therefore remains a separate
future architecture decision.

It must not be introduced as an ad-hoc patch to the relationship graph.

---

# 27. Algorithms rejected for initial v3

Do not use initially:

- nearest-centroid tracking;
- fixed-distance continuation;
- maximum-cardinality assignment;
- centroid history as the primary initial predictor;
- global speed limiting as the primary association defence;
- Kalman filtering as the primary identity mechanism;
- provider-specific tracking rules;
- machine-learning association.

Reconsideration requires explicit architecture review and validation evidence.

---

# 28. Development sequence

V3.0
Architecture isolation

V3.1
Lucas-Kanade synthetic motion
-> STOP GATE A

V3.2
TREC comparison + real radar motion
-> STOP GATE B

V3.3
Geometry advection
-> geometry prediction gate

V3.4
Candidate graph + physical admissibility
-> STOP GATE C

V3.5
Continuation / birth / death

V3.6
Real radar tracking challenge
-> STOP GATE D

V3.7
Split lineage

V3.8
Merge lineage

V3.9
Storm-specific motion

V3.10
Persistence / restore

V3.11
Multi-provider falsification

V3.12
Downstream integration

No phase may proceed past a failed hard gate.

---

# 29. Multi-provider validation

AEMET is an initial falsification dataset.

It is not sufficient validation by itself.

Once the model passes the initial real-data challenge, replay other normalized
radar sources without altering tracking semantics.

A provider failure is evidence against the tracking model.

It is not permission to introduce provider-specific tracking logic.

---

# 30. Validation categories

Each stage must identify applicable validation as:

STRUCTURAL
Architecture and dependency boundaries.

SCIENTIFIC
Physical/model validity.

REGRESSION
Previously demonstrated behaviour remains intact.

Unit-test success alone does not constitute scientific validation.

---

# 31. Absolute stop gates

## STOP GATE A

Known synthetic motion cannot be recovered.

**STOP.**

## STOP GATE B

Real radar motion is physically incoherent.

**STOP.**

## STOP GATE C

Clearly unrelated observations receive candidate relationships.

**STOP.**

## STOP GATE D

Real replay produces widespread implausible identity or motion unless protected
by an artificial global limiter.

**STOP.**

No later algorithm may compensate for a failed stop gate.

---

# 32. Locked starting algorithm stack

FIELD MOTION

Pyramidal Lucas-Kanade feature tracking
+ robust interpolation.

INDEPENDENT MOTION COMPARATOR

TREC / local normalized cross-correlation.

OBJECT PREDICTION

Radar-field advection of previous storm geometry.

RELATIONSHIP REPRESENTATION

Sparse bipartite temporal graph.

ADMISSIBILITY

Predicted spatial agreement
+ uncertainty-normalized motion residual
+ scale consistency
+ reflectivity compatibility.

LINEAGE

Graph topology.

IDENTITY

Assigned only after lineage resolution.

TRACK MOTION

Robust regression over validated lineage.

FORECAST

Validated-motion geometry advection with explicit uncertainty.

---

# 33. Governing development rule

The algorithms in this document are locked as the starting scientific
hypothesis.

They are not protected from falsification.

If an algorithm fails its hard gate:

1. stop downstream development;
2. diagnose the failed model;
3. revise or replace that algorithm;
4. rerun its gate;
5. proceed only after the gate is GREEN.

Do not patch downstream functionality to conceal an upstream scientific failure.

---

# 34. Change control

This document is the authoritative Storm Tracker v3 work plan and guardrail.

Changes to its architecture, algorithms or hard gates require an explicit
architecture decision supported by evidence.

Future development sessions must resume from this document rather than from
previous tracking implementations.

## Future data improvement — NWP steering-flow validation

Add an independent meteorological plausibility layer for radar-derived motion.

Goal:
- compare radar motion against upper-air/NWP steering winds;
- do not compare radar advection directly with surface wind alone.

Initial candidate data:
- ECMWF IFS pressure-level winds;
- 700 hPa, 600 hPa and 500 hPa;
- derive provider-neutral u/v steering vectors;
- sample spatially across the active radar field rather than at one point;
- consider a 700–500 hPa layer mean initially;
- later allow weighting by storm depth / echo-top evidence.

Independent comparator:
- DWD ICON pressure-level winds where useful.

Potential acquisition:
- direct ECMWF operational/open data for authoritative implementation;
- Open-Meteo may be useful for development/prototyping access.

Architecture rule:
NWP steering flow is supporting plausibility/quality evidence.
It must not become a provider-specific association rule or silently override
radar-observed motion.

Deferred until after the deterministic Storm Tracker v3 gates.

---

# 35. Implementation status — 2026-09-30 baseline

This section records the validated implementation state. It does not alter the
architecture, algorithms or stop gates defined above.

## Completed scientific gates

### V3.0 — Architecture isolation

**COMPLETE / GREEN**

Storm Tracker v3 is implemented independently of previous tracking
implementations. The v3 tracking modules contain no provider-specific tracking
branches and do not fall back to the legacy tracker.

### V3.1 — Synthetic field motion

**COMPLETE / GREEN — STOP GATE A PASSED**

Pyramidal Lucas-Kanade motion estimation has been validated against known
synthetic translation, stationary fields, directional motion, deformation,
moderate intensity changes and missing evidence.

Forward/backward disagreement is retained as explicit motion uncertainty.

### V3.2 — Independent comparator and real radar motion

**COMPLETE / GREEN — STOP GATE B PASSED**

TREC/local cross-correlation is retained as an independent comparator.

Real IPMA PCR replay produced physically plausible motion without requiring a
global speed cap. Fast motion is not rejected merely because it is fast.

### V3.3 — Geometry advection

**COMPLETE / GREEN**

Polygon and MultiPolygon geometry can be advected using provider-neutral radar
motion fields.

Missing motion support remains missing. Limited short boundary gaps may be
repaired only under the explicitly tested support rules.

### V3.4 — Temporal relationship graph

**COMPLETE / GREEN — STOP GATE C PASSED**

Temporal relationships are represented as a sparse graph built from predicted
geometry and current observations.

Clearly unrelated observations are not forced into relationships. Split,
merge, continuation and unresolved complex relationships remain explicit graph
topologies.

### V3.5 — Lineage and persistent identity

**COMPLETE / GREEN**

Persistent identity is assigned only after lineage resolution.

One-to-one continuation retains identity. Birth creates identity. Death ends
identity. Split, merge and complex topology remain unresolved unless their
identity semantics are explicitly validated.

### V3.6 — Real radar tracking challenge

**COMPLETE / GREEN — STOP GATE D PASSED**

The real IPMA replay challenge passed without an artificial global motion
limiter and without widespread physically implausible continuation.

The validated replay baseline included persistent multi-frame tracks,
unsupported-motion handling, births, deaths, split/merge topology and zero
remaining gross false continuations in the reviewed challenge.

V3.6 is frozen unless an operational blocker is demonstrated.

## Operational hazard-region layer

The operational PCR path intentionally tracks coherent marine hazard regions
rather than every detector component.

Current locked defaults:

- candidate reflectivity threshold: 24 dBZ;
- candidate minimum area: 5 km²;
- proximity clustering distance: 25 km;
- promoted tracked-region minimum area: 25 km².

Nearby candidate components may be grouped into one operational hazard region.
The original member observations are retained as evidence.

For a multi-member region, the current operational geometry is a coherent
convex envelope. This geometry is used for tracking, forecast and presentation.

## Operational forecast

Authoritative Storm Tracker v3 forecast horizons are:

- +5 minutes;
- +10 minutes;
- +20 minutes;
- +30 minutes.

Forecast geometry is produced by motion-field advection of the current
operational hazard geometry.

Unknown or invalid motion does not create a stationary forecast. The current
hazard remains present and its forecast is empty.

Forecast output must never influence historical association.

## IPMA PCR runtime status

IPMA PCR is the first production-integrated Storm Tracker v3 radar source.

The authoritative runtime path is:

    normalized IPMA PCR evidence
        -> detector candidates
        -> operational hazard regions
        -> Inference Engine v2 observation inference
        -> Storm Runtime v3
        -> Storm Engine v3
        -> Storm Tracker v3 lineage / identity
        -> +5/+10/+20/+30 forecast
        -> Signal K hazard presentation

IPMA PCR is explicitly prohibited from entering the legacy storm-processing
path.

Provider-native IPMA raster rows are normalized at the provider boundary into
the provider-neutral geographic grid required by the detector, motion field and
geometry-advection layers.

Live Freeboard alignment, multi-frame identity persistence and authoritative
forecast presentation have been operationally validated.

## Transitional legacy runtime

The following modules remain in the repository because they still have live or
shared dependencies outside the authoritative IPMA PCR v3 path:

- `lib/storm-engine.js`;
- `lib/storm-tracker.js`;
- `lib/storm-evolution.js`;
- shared geographic utilities currently exported by `lib/storm-engine.js`.

They are not fallback implementations for Storm Tracker v3.

Their removal requires separate dependency migration and regression proof.

The experimental StormEngine v2 runtime bundle has been removed after proving
that it had no production runtime callers:

- `lib/storm-engine-v2.js`;
- `lib/storm-forecast.js`;
- `lib/storm-model.js`.

Inference Engine v2 is not obsolete and remains part of the active
provider-neutral architecture.

## Multi-provider status

Provider-neutral Storm Tracker v3 semantics remain mandatory.

IPMA PCR is currently the validated production-integrated v3 radar source.

AEMET and NOA must be integrated and validated against the same v3 contracts
without introducing provider-specific tracking rules. Provider-native
georeferencing must be established independently for each provider rather than
copying IPMA-specific raster assumptions.

Failure of another provider replay is evidence to investigate acquisition,
normalization or the provider-neutral model. It is not permission to add
provider-specific tracker behaviour.

## Repository baseline rule

Before this baseline is committed:

1. obsolete files may be removed only after proving that no runtime or required
   test dependency remains;
2. historical architecture documents must be retained or clearly marked as
   superseded rather than silently rewritten;
3. the full regression suite must pass;
4. syntax/lint checks must pass;
5. package dry-run inspection must contain the intended runtime and
   documentation files;
6. `git diff --check` must be clean;
7. only reviewed project files are staged.

This section records implementation status only. Sections 1–34 remain the
authoritative Storm Tracker v3 scientific work plan and guardrails.
