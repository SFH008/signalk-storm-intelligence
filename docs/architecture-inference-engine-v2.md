# Architecture Addendum A — InferenceEngine v2

**Status: ARCHITECTURE LOCKED**

## 1. Purpose

InferenceEngine v2 is the scientific reasoning layer.

Its responsibility is to answer:

> Given the normalized evidence available for a detected meteorological object, what can we scientifically infer about that object, with what confidence and uncertainty?

It does **not** own storm identity, tracking, motion, vessel-relative threat, or provider acquisition.

## 2. Position in the pipeline

```text
Provider evidence
      ↓
Normalized Storm Evidence v1
      ↓
Storm Detector
      ↓
Storm Observation
      ↓
InferenceEngine v2
      ↓
Enriched / classified observation
      ↓
StormEngine v2
```

A second inference stage may later operate on an already-tracked Storm Model:

```text
Storm Model v2
      ↓
InferenceEngine v2 — temporal/storm stage
      ↓
classification / severity evidence
```

InferenceEngine does not own the temporal state; it consumes it.

## 3. Responsibilities

InferenceEngine v2 owns scientific/statistical inference including:

- observation quality assessment;
- convective-cell classification;
- heavy-rain classification/evidence;
- thunderstorm classification;
- squall-potential assessment;
- multisensor evidence fusion;
- confidence and uncertainty assessment;
- deterministic/statistical algorithms;
- later ML/neural algorithms;
- algorithm provenance and model provenance;
- missing-modality handling;
- algorithm health and failure isolation.

Provider-specific product names must never become generic classification semantics.

## 4. Explicit non-responsibilities

InferenceEngine v2 MUST NOT own:

```text
stormId
track association
split / merge lifecycle
motion estimation
forecast trajectory
CPA / TCPA
vessel path
navigation advice
vessel-relative threat
provider acquisition
provider-native parsing
```

## 5. Initial algorithm families

The deterministic/statistical baseline must precede ML:

```text
Evidence validation
    ↓
Deterministic scientific rules
    ↓
Statistical baseline
    ↓
Multisensor fusion
    ↓
Calibration
    ↓
ML / neural augmentation
```

Candidate model families for validation include:

```text
logistic regression / GAM
gradient-boosted trees
Bayesian evidence fusion
robust change-point detection
later multimodal neural networks
```

No algorithm becomes operational merely because it produces a plausible result.

## 6. Confidence and probability

`confidence` and calibrated probability must remain distinct.

A heuristic support score must never silently be described as:

```text
P(thunderstorm)
P(squall)
P(convective)
```

If probability is exposed, it requires calibration and explicit validation.

The legacy weighted/max-severity ensemble remains a historical operational idea, but is **not automatically a statistically valid v2 combination rule**.

## 7. Missing evidence

The following rules are mandatory:

```text
missing ≠ zero
missing ≠ false
unavailable ≠ negative evidence
stale evidence cannot increase confidence
incompatible measurement semantics cannot be combined
```

Pretrained models must retain explicit modality masks and model/version/checksum provenance.

## 8. Two-stage inference model

InferenceEngine v2 may eventually support two distinct scientific inference stages without owning tracking state.

### 8.1 Observation-stage inference

Consumes current-frame normalized evidence and Storm Observation.

Responsibilities may include:

- observation quality;
- convective likelihood/classification;
- heavy-rain evidence;
- thunderstorm evidence;
- squall potential;
- multisensor corroboration;
- classification confidence and uncertainty.

### 8.2 Storm-stage inference

Consumes an already-tracked Storm Model v2, including temporal information supplied by StormEngine v2.

Responsibilities may include:

- persistence-aware classification;
- rapid-development assessment;
- change-point evidence;
- temporal multisensor fusion;
- severity refinement;
- calibrated storm-level classification.

The tracking history remains owned by StormEngine v2.

## 9. Statistical and ML direction

InferenceEngine v2 should establish an interpretable deterministic/statistical reference before neural models are enabled operationally.

Priority model families:

1. Deterministic scientific rules.
2. Logistic regression and/or generalized additive models.
3. Multisensor probabilistic/Bayesian fusion where scientifically valid.
4. Robust change-point methods for rapid development.
5. Gradient-boosted trees when adequate labelled history exists.
6. Multimodal neural models after deterministic/statistical baselines are established.

ML models must support incomplete heterogeneous evidence, explicit availability/provenance/quality, modality dropout/loss during training, and provider-independent validation.

## 10. Legacy InferenceEngine treatment

The legacy InferenceEngine is:

```text
LEGACY / REFERENCE ONLY
```

Useful concepts that may be retained:

- pluggable algorithms;
- common evidence snapshot;
- algorithm provenance;
- failure isolation;
- explicit detector/refiner distinction;
- runtime algorithm health;
- reproducible replay.

The following legacy concepts must not be transplanted unchanged:

- vessel-relative threat in scientific inference;
- additive confidence boosts treated as calibrated science;
- provider-native severity semantics;
- tracking/motion responsibilities;
- max-severity or weighted-confidence treated as calibrated probabilities.

## 11. Validation gate

InferenceEngine v2 cannot feed production StormEngine v2 until the dedicated 7.4b validation gate passes.

The gate must evaluate at minimum:

```text
precision / recall
false-positive rate
false-negative rate
calibration / Brier score where probability is claimed
provider invariance
missing-modality degradation
outlier robustness
small-perturbation stability
replay reproducibility
algorithm failure isolation
provenance completeness
```

Historical train/calibration/test splits must be by storm/event or geographically/temporally separated period, not random frame splits, to avoid temporal leakage.

## 12. Architectural invariant

The permanent boundary is:

```text
InferenceEngine v2
    decides WHAT the meteorological evidence supports
```

It must remain provider-neutral, scientifically explicit, reproducible, and independent of vessel-relative threat.
