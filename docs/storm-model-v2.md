# Storm Model v2

## Status

This document freezes the provider-neutral meteorological Storm Model v2
contract.

It sits downstream of:

    Normalized Storm Evidence v1
            |
            v
    storm-observation
            |
            v
    storm-tracker
            |
            v
    storm-motion
            |
            v
    storm-evolution
            |
            v
    storm-forecast
            |
            v
    Storm Model v2

Vessel-relative interaction is deliberately outside the meteorological storm
model:

    Storm Model v2
            |
            v
    storm-threat

The governing architecture remains:

- architecture.md
- storm-intelligence-model.md
- normalized-storm-evidence-v1.md
- inference-algorithm-specification.md

## 1. Core invariant

Storm Model v2 represents a persistent meteorological phenomenon.

It MUST NOT represent vessel-relative operational threat.

Meteorological severity and vessel-relative threat are separate concepts and
MUST remain separate throughout the runtime.

## 2. Top-level schema

The frozen top-level contract is:

    schema
    stormId
    observedAt
    observation
    track
    motion
    evolution
    severity
    forecast
    uncertainty
    evidence
    provenance

The schema identifier is:

    storm-model/2

A conceptual object is:

    {
      schema: 'storm-model/2',
      stormId: '...',
      observedAt: '...',

      observation: {...},
      track: {...},
      motion: {...} | null,
      evolution: {...} | null,
      severity: {...} | null,
      forecast: [...],
      uncertainty: {...},

      evidence: {...},
      provenance: {...}
    }

Missing scientific state remains null or absent according to the rules below.
It MUST NOT be fabricated.

## 3. Identity

### stormId

stormId is the persistent local identity of the meteorological storm object.

During migration it may be backed by the current trackId implementation.

The identity:

- is created by storm-tracker;
- is provider-independent;
- is not an upstream provider feature ID;
- survives ordinary temporal association;
- may participate in split/merge lineage;
- MUST NOT be created by storm-observation;
- MUST NOT be based on vessel state.

Compatibility during migration:

    stormId == current trackId

The compatibility field trackId may remain temporarily, but new modules SHOULD
use stormId when operating on Storm Model v2.

## 4. Observation

The current spatial observation is:

    observation:
      observationId
      observedAt
      geometry
      centroid
      areaKm2
      reflectivity
      evidence
      provenance

### observationId

observationId identifies one derived spatial observation in one evidence frame.

It is not persistent storm identity.

### observedAt

The observation timestamp is inherited from the physical evidence observation
time.

It MUST NOT be replaced by receipt time, generation time, or future valid time.

### geometry

geometry is the primary spatial representation.

The initial contract uses GeoJSON-compatible polygonal geometry in WGS84
longitude/latitude.

Geometry is authoritative for:

- spatial extent;
- overlap;
- distance;
- intersection;
- split/merge lineage evidence;
- forecast geometry.

### centroid

centroid is a derived diagnostic location.

It MAY be used for:

- association support;
- motion estimation;
- display;
- diagnostics.

It MUST NOT replace geometry when polygon geometry is available.

### areaKm2

areaKm2 is the area of the current observed geometry.

It is an observation property, not an evolution trend.

## 5. Reflectivity summary

The current observation MAY contain a provider-neutral reflectivity summary:

    reflectivity:
      available
      maxDbz
      representation
      derivation
      sourceQuantity
      sourceUnits
      conversion

Allowed representation values remain those frozen by Normalized Storm Evidence
v1:

    measurement
    lower-bound
    estimate

The summary MUST preserve the scientific semantics of the normalized evidence.

A lower-bound value MUST NOT be silently promoted to an estimate or
measurement.

An estimate MUST NOT be silently promoted to a measurement.

Provider identifiers MUST NOT be used to decide how the Storm Engine
interprets reflectivity.

## 6. Track

Persistent temporal state belongs to storm-tracker:

    track:
      firstSeen
      lastSeen
      ageSec
      observationCount
      history
      missedFrames
      parentStormId
      mergedIntoStormId
      association

### firstSeen

Time of the first accepted observation in the current persistent track.

### lastSeen

Time of the most recent accepted observation.

### ageSec

Elapsed time from firstSeen to the active inference time or most recent
observation according to the tracker contract.

### observationCount

Count of accepted observations contributing to the track.

### history

history stores sufficient past spatial observations to support:

- temporal association;
- motion estimation;
- evolution estimation;
- replay;
- uncertainty estimation.

History MUST retain more than centroid-only state once Storm Model v2 is fully
implemented.

At minimum, each retained history element SHOULD support:

    observedAt
    geometry
    centroid
    areaKm2
    reflectivity summary

### missedFrames

Number of expected temporal updates without a new accepted observation.

A stale/predicted track MUST NOT be represented as newly observed.

### parentStormId

Used only when positive spatial lineage evidence supports a split.

Distance-only proximity MUST NOT establish parent lineage.

### mergedIntoStormId

Used only when positive spatial lineage evidence supports a merge.

Distance-only proximity MUST NOT establish merge lineage.

### association

Association metadata MAY include:

    method
    cost
    distanceMeters
    polygonIoU
    predictedCentroid

These fields are diagnostic and algorithm-specific.

## 7. Motion

Motion is a separate estimated state:

    motion:
      eastMps
      northMps
      speedMps
      courseDeg
      sampleCount
      residualMeters
      confidence
      method

Motion is an estimate, not an assertion that the storm will remain rigid or
move at constant velocity.

### eastMps / northMps

Local horizontal velocity components.

### speedMps

Magnitude of the horizontal velocity vector.

### courseDeg

Direction of motion in degrees according to the implementation's documented
navigation convention.

### sampleCount

Number of temporal motion samples supporting the estimate.

### residualMeters

Residual spatial inconsistency in the fitted motion model.

### confidence

Support for the motion estimate under the active method.

It is not a probability of future correctness or harm.

### method

Stable motion-estimation method identifier.

The current robust multi-observation kinematic estimator is the initial
deterministic baseline.

If motion cannot be estimated reliably:

    motion = null

Missing motion MUST NOT be replaced with zero velocity.

## 8. Evolution

Meteorological temporal development belongs to storm-evolution:

    evolution:
      intensityTrend
      areaTrend
      geometryTrend
      state
      confidence
      method

Phase 7.2 freezes the structure, not the final algorithms.

### intensityTrend

Represents change in a scientifically comparable intensity quantity over time.

It MUST preserve the underlying evidence semantics.

An evolution algorithm MUST NOT compare incompatible representations as if they
were identical measurements.

### areaTrend

Represents growth or decay in observed storm area.

### geometryTrend

Represents spatial expansion, contraction, or structural change where the
algorithm can justify such a classification.

### state

Initial allowed development vocabulary:

    intensifying
    weakening
    growing
    shrinking
    steady
    mixed
    unknown

The implementation MAY refine this vocabulary before evolution algorithms are
enabled operationally, but MUST NOT overload vessel-threat state.

### confidence

Support for the evolution estimate.

It is not probability of harm.

### method

Stable evolution method identifier.

Before deterministic evolution is implemented:

    evolution = null

## 9. Meteorological severity

Meteorological severity is:

    severity:
      level
      dimensions
      confidence
      method
      evidence

Severity describes the phenomenon.

It MUST NOT include vessel distance, CPA, intercept time, vessel course, or
operational warning state.

### level

A generic severity level MAY be exposed when an algorithm has a documented
mapping.

A missing severity estimate remains null.

No provider-specific severity key scanning is permitted in Storm Model v2.

The existing legacy scan of fields such as provider-native severity names is
not part of this contract.

### dimensions

Severity MAY later expose separate meteorological dimensions such as:

    convection
    heavyRain
    lightning
    squallPotential

A dimension may be absent when unsupported.

Missing evidence MUST NOT be interpreted as zero severity.

## 10. Forecast

Storm forecast output is owned by storm-forecast.

The frozen representation is an ordered array:

    forecast:
      [
        {
          horizonSec,
          validAt,
          geometry,
          centroid,
          uncertaintyMeters,
          confidence,
          method
        }
      ]

Initial deterministic horizons are:

    900
    1800
    3600

corresponding to:

    15 minutes
    30 minutes
    60 minutes

### horizonSec

Lead time relative to the latest physical storm observation.

### validAt

Forecast valid time.

It MUST remain distinct from observedAt.

### geometry

Forecast storm geometry.

Presentation code MUST render this geometry rather than independently
recalculating storm translation.

### centroid

Derived centroid of forecast geometry.

### uncertaintyMeters

Spatial uncertainty associated with the forecast horizon.

Uncertainty SHOULD generally not decrease with lead time unless a future
calibrated model explicitly justifies that behavior.

### confidence

Support for the forecast under its method.

It is not probability of vessel impact.

### method

Stable forecast method identifier.

The current linear geometry translation logic is the initial deterministic
baseline to be extracted from presentation code.

## 11. Uncertainty

Current storm uncertainty is first-class:

    uncertainty:
      positionMeters
      motionMeters
      evolution
      method

Not every field must be populated by every algorithm.

Unknown uncertainty remains unknown.

A missing uncertainty estimate MUST NOT be represented as zero uncertainty.

The initial deterministic implementation MAY preserve the current heuristic
while making its semantics explicit and independently testable.

## 12. Evidence

The storm model retains evidence traceability:

    evidence:
      radar
      lightning
      environment
      weather
      other

Evidence domains are optional.

Absence means unavailable or unsupported.

It MUST NOT be silently converted into a zero-value contribution.

The radar evidence summary MUST preserve representation semantics from
Normalized Storm Evidence v1.

Future evidence attachment MUST enrich the meteorological object without
introducing provider-specific branches into the Storm Engine.

## 13. Provenance

Storm Model provenance MAY include:

    provenance:
      observationMethod
      trackingMethod
      motionMethod
      evolutionMethod
      forecastMethod
      severityMethod

Provider source provenance remains attached through evidence.

Provider IDs MUST NOT control Storm Model algorithms.

## 14. Vessel-relative threat exclusion

The following fields MUST NOT exist as top-level Storm Model v2 meteorological
state:

    threatState
    intersects
    interceptSec
    minDistanceMeters
    minDistanceSec
    CPA
    TCPA
    vesselDistance
    vesselBearing
    operationalAlarm

These belong exclusively to storm-threat.

storm-threat consumes:

    Storm Model v2
    vessel navigation state
    vessel trajectory assumptions
    operational configuration

and produces a separate vessel-relative interaction object.

## 15. Storm threat boundary

The initial downstream threat contract is conceptually:

    {
      schema: 'storm-threat/1',
      stormId: '...',
      evaluatedAt: '...',
      state: 'normal' | 'warn' | 'alarm',
      intersects: true | false | null,
      interceptSec: number | null,
      minDistanceMeters: number | null,
      minDistanceSec: number | null,
      uncertaintyMeters: number | null,
      confidence: number | null,
      cpa: {...} | null,
      method: '...',
      evidence: {...}
    }

This contract is documented here only to freeze the separation boundary.

storm-threat/1 will be implemented and validated in its own phase.

## 16. Missing-data rules

Across Storm Model v2:

- missing evidence remains missing;
- unavailable quantities remain null or absent;
- unknown motion is not zero motion;
- unknown growth is not steady growth;
- unknown severity is not normal severity;
- unknown forecast is not stationary forecast;
- unknown uncertainty is not zero uncertainty;
- stale predicted state is not a fresh observation.

## 17. Provider isolation

Storm Model v2 scientific modules MUST NOT contain branches such as:

    if provider == AEMET
    if provider == IPMA
    if provider == NOA
    if product == PCR
    if product == RAIN_RATE

Provider identity is permitted only in provenance and diagnostics.

Provider-specific decoding and scientific source interpretation terminate at
the normalized evidence boundary.

## 18. Module ownership

### storm-observation

Owns:

    evidence field -> spatial observation

Does not own:

    persistent identity
    motion
    evolution
    forecast
    vessel threat

### storm-tracker

Owns:

    persistent identity
    temporal association
    lifecycle
    history
    split/merge lineage

Does not own:

    vessel threat
    meteorological severity inference

### storm-motion

Owns:

    track history -> motion estimate

Does not own:

    storm identity
    vessel threat
    severity

### storm-evolution

Owns:

    temporal intensity/area/geometry development

Does not own:

    vessel position
    CPA
    operational warning state

### storm-forecast

Owns:

    future storm geometry
    future centroid
    forecast uncertainty

Does not own:

    vessel trajectory
    alarm state

### storm-model

Owns:

    composition of current meteorological storm state

Does not own:

    vessel-relative operational interaction

### storm-threat

Owns:

    vessel-relative interaction
    interception
    closest approach
    operational threat state

## 19. Migration compatibility

The current monolithic StormEngine may continue to publish its existing output
while modules are extracted.

Extraction follows this rule:

    Extract before enhance.

Each extracted module MUST first preserve observable behavior where that
behavior remains compatible with this contract.

Behavior that violates the frozen architecture is isolated and replaced only
after an explicit testable boundary exists.

Temporary compatibility mappings may include:

    trackId -> stormId

and existing motion fields into the new motion object.

Legacy mixed severity/threat state is not part of Storm Model v2 and MUST NOT
be preserved as meteorological state.

## 20. Deterministic implementation order

The implementation order is frozen as:

    1. storm-observation
    2. storm-tracker
    3. storm-motion
    4. storm-evolution
    5. storm-forecast
    6. storm-model composition
    7. storm-threat
    8. presentation migration

Each stage requires:

    focused deterministic tests
            |
            v
    full regression
            |
            v
    Signal K runtime validation
            |
            v
    Freeboard/replay validation where applicable

No later module should absorb responsibilities from an earlier module merely
to reduce implementation effort.
