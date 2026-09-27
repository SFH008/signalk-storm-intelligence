Architecture Addendum B — StormEngine v2

Status: ARCHITECTURE LOCKED

1. Purpose

StormEngine v2 is the deterministic temporal state engine.

Its responsibility is to answer:

Is this the same storm object over time, how is it moving and evolving, and what is its best current meteorological state and forecast?

It consumes accepted/enriched storm observations. It does not perform provider-specific interpretation.

2. Position in the pipeline

InferenceEngine v2 output
      ↓
StormEngine v2
      ├── tracker
      ├── motion
      ├── evolution
      ├── forecast
      └── Storm Model v2 assembly
      ↓
Storm Model v2
      ↓
Storm Threat
      ↓
presentation / notification

3. Responsibilities

StormEngine v2 owns:

persistent storm identity
association across frames
split / merge lineage
missed-frame lifecycle
track history
motion estimation
motion confidence
evolution
forecast
storm-level uncertainty
Storm Model v2 assembly

4. Module ownership

The implementation remains modular:

storm-observation
      ↓
storm-tracker
      ↓
storm-motion
      ↓
storm-evolution
      ↓
storm-forecast
      ↓
storm-model

StormEngine v2 orchestrates these modules; it does not collapse their responsibilities into a monolith.

5. Tracking

Tracking is a primary success factor.

StormEngine v2 must support:

persistent IDs
crossing storms
irregular frame intervals
missed-frame reacquisition
split lineage
merge lineage
coverage-edge expiry
deterministic association
dateline handling

Provider identity must not influence association.

Tracking owns identity history only; provider-specific science remains outside the engine.

6. Motion

The current robust estimator remains the deterministic baseline.

Alternative methods may later be evaluated against frozen replay data:

current robust estimator
constant-velocity Kalman
constant-acceleration Kalman
IMM / multiple-model estimator
optical-flow-assisted motion

No replacement occurs because a method is theoretically elegant. It must outperform the baseline on historical storm sequences.

Kalman filtering therefore belongs in StormEngine v2 motion/forecast evaluation, not in InferenceEngine v2.

Unknown motion must remain null at the Storm Model v2 boundary and must never be represented as genuine zero motion.

7. Evolution

StormEngine v2 owns physical temporal evolution:

intensityTrend
areaTrend
geometryTrend
state
confidence
method

Only scientifically compatible quantities and representations may be compared.

Missing observations must not become zero change.

The initial deterministic state vocabulary is:

intensifying
weakening
growing
shrinking
steady
mixed
unknown

Confidence is support under the active method, not probability of harm.

8. Forecast

Forecast belongs downstream of validated motion/evolution.

Initial deterministic horizons are:

15 min
30 min
60 min

Future forecast methods may include:

linear extrapolation
acceleration-aware extrapolation
Kalman / IMM
optical flow
ensemble nowcasting
ML

Uncertainty must increase appropriately with lead time and poor motion/evolution support.

Unknown forecast must not be represented as stationary forecast.

9. Storm Model v2 assembly

StormEngine v2 assembles the frozen storm-model/2 contract.

Top-level fields include:

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

Initial migration rule:

stormId == current trackId

Persistent storm identity is owned by StormEngine v2 and must not be created by storm-observation or by provider-specific acquisition code.

10. Severity boundary

StormEngine v2 may carry meteorological severity produced from scientific inference, but severity and vessel-relative threat remain separate concepts.

Severity describes the meteorological phenomenon.

Threat describes the interaction between the phenomenon and the vessel.

A high-severity storm moving away at large distance must not automatically become a vessel alarm. A lower-severity but rapidly developing storm intersecting the vessel path may still become operationally important.

11. Threat exclusion

Storm Model v2 does not contain vessel-relative threat.

The boundary is:

Storm Model v2
      ↓
Storm Threat

The following therefore remain outside the meteorological StormEngine v2 model:

CPA / TCPA
own-ship COG / SOG
vessel route
path intersection
alarm policy
navigation advice

Storm Threat consumes Storm Model v2 plus vessel/navigation context.

12. Provider isolation

StormEngine v2 MUST NOT contain:

provider ids
provider-native product names
provider-specific thresholds
provider-specific scientific branches
provider-native parsing
provider acquisition logic

Provider identity is permitted only in evidence provenance and diagnostics.

All provider-specific handling stops at the acquisition/normalization boundary.

13. Missing-data rules

The following are mandatory:

missing evidence remains missing
unknown motion is not zero motion
unknown severity is not normal severity
unknown forecast is not stationary forecast
unknown uncertainty is not zero uncertainty
stale predicted state is not a fresh observation

14. Legacy StormEngine treatment

The legacy StormEngine is:

LEGACY / REFERENCE ONLY

Useful validated logic should be extracted into dedicated v2 modules before enhancement.

No new v2 science should be added to the legacy engine.

Legacy mixed severity/threat state is not part of Storm Model v2.

15. Validation requirements

StormEngine v2 must be validated independently before runtime replacement.

Required gates include:

tracker unit and stress tests
motion unit and stress tests
evolution unit and stress tests
forecast tests
split / merge tests
missed-frame tests
crossing-track tests
irregular-cadence tests
dateline tests
historical replay
full regression
Signal K runtime validation
Freeboard visual validation where applicable

Tracking and forecast quality must be assessed on frozen storm sequences rather than isolated synthetic frames only.

16. Architectural invariant

The permanent boundary is:

StormEngine v2
    decides WHICH persistent storm an observation belongs to,
    HOW that storm changes over time,
    and WHERE it is likely to go

It must remain provider-neutral and must not absorb vessel-relative threat logic.

17. Relationship to InferenceEngine v2 and Storm Threat

The three core boundaries are:

InferenceEngine v2
    decides WHAT the meteorological evidence supports

StormEngine v2
    decides WHICH persistent storm it belongs to,
    HOW that storm changes over time,
    and WHERE it is likely to go

Storm Threat
    decides WHAT that storm means for the vessel

These boundaries are architecture-locked and 