# Normalized Storm Evidence v1

## Status

This document freezes the provider-neutral scientific evidence boundary for
Storm Engine v2.

The governing architectural documents remain:

- architecture.md
- storm-intelligence-model.md
- radar-provider-specification.md
- inference-algorithm-specification.md

Normalization preserves scientific differences between sources. Numerically
similar values from different sources are not automatically scientifically
equivalent.

## 1. Radar reflectivity evidence

Required fields:

    schema
    domain
    quantity
    units
    observedAt
    width
    height
    bounds
    values
    valueSemantics
    availability
    provenance

For the current radar reflectivity domain:

    schema   = storm-normalized-evidence/1
    domain   = radar
    quantity = reflectivity
    units    = dBZ

The provider-neutral numerical field is:

    values

For raster fields:

    values.length == width * height

Unavailable or scientifically undefined reflectivity is represented by NaN.

Missing evidence MUST NOT be encoded as zero.

## 2. Time semantics

observedAt is the physical observation time.

Where supplied by a source, additional times remain distinct:

    validAt
    generatedAt
    receivedAt

These values are not interchangeable.

Replay MUST NOT substitute future valid time for observation time.

## 3. Value semantics

Each numerical field carries:

    valueSemantics.representation
    valueSemantics.derivation
    valueSemantics.sourceQuantity
    valueSemantics.sourceUnits
    valueSemantics.intervalSemantics
    valueSemantics.conversion

Allowed representation values:

    measurement
    lower-bound
    estimate

measurement:
A native measured value.

lower-bound:
A conservative lower limit of an interval or class.

estimate:
A discrete or derived point estimate.

Allowed derivation values:

    native
    converted

native:
The normalized quantity is the source physical quantity.

converted:
The normalized quantity was produced through a documented scientific
transformation.

Converted evidence MUST retain conversion metadata.

## 4. Current validated provider mappings

### AEMET COMPO

    sourceQuantity = reflectivity
    sourceUnits    = dBZ
    representation = lower-bound
    derivation     = native

AEMET COMPO classes represent reflectivity intervals. The normalized value is
the conservative lower edge of the interval.

### IPMA PCR

    sourceQuantity = rainfallRate
    sourceUnits    = mm/h
    representation = lower-bound
    derivation     = converted
    conversion     = Marshall-Palmer Z-R

The normalized reflectivity is derived using:

    Z = 200 * R^1.6

Because the source rainfall values are conservative lower bounds, the derived
reflectivity also retains lower-bound semantics.

### NOA RAIN_RATE

    sourceQuantity = rainfallRate
    sourceUnits    = mm/h
    representation = estimate
    derivation     = converted
    conversion     = Marshall-Palmer Z-R

The normalized reflectivity is derived using:

    Z = 200 * R^1.6

NOA rainfall classes represent discrete estimates. The derived reflectivity is
therefore an estimate and MUST NOT be labelled as a lower bound.

## 5. Availability

Availability may expose:

    available
    physicalPixels
    unavailablePixels
    unknownPixels
    totalPixels

Not every provider distinguishes unavailable and unknown pixels.

Missing categories remain absent rather than being fabricated.

available=true means usable physical evidence exists somewhere in the field.
It does not imply complete spatial coverage.

## 6. Provenance

Normalized evidence retains traceability.

At minimum current radar evidence preserves:

    provider
    product
    method

Provider and product identifiers exist for provenance only.

Downstream scientific modules MUST NOT branch on provider ID or product ID.

## 7. Compatibility aliases

During Phase 7 migration, these existing fields remain compatibility aliases:

    reflectivityLowerBoundDbz
    reflectivityDbz

All new modules MUST consume:

    values
    valueSemantics

Compatibility aliases may be removed only after all downstream consumers have
migrated.

## 8. Scientific boundary

Normalized evidence contains physical evidence and its scientific semantics.

It MUST NOT contain downstream storm state such as:

    trackId
    parentTrackId
    mergedInto
    motion
    growth
    decay
    storm severity
    storm forecast
    CPA
    TCPA
    vessel-relative warning state
    arrival time

Those belong to later modules.

A radar echo polygon is therefore not normalized evidence. It is a derived
storm observation.

## 9. Missing-data invariant

Missing evidence remains missing.

Specifically:

- no-data is not zero;
- unavailable reflectivity is NaN;
- unsupported quantities remain absent;
- unknown source classes remain unavailable;
- scientific conversions are not invented when semantics are insufficient;
- downstream modules MUST NOT silently replace missing values with physical
  zero.

## 10. Storm Engine v2 modular sequence

    normalized evidence
            |
            v
    storm-observation
            |
            v
    storm-tracker
            |
            v
    storm-evolution
            |
            v
    storm-forecast
            |
            v
    storm-model
            |
            v
    storm-threat
            |
            v
    presentation

Implementation rule:

Extract before enhance.

Preserve observable behavior while splitting the monolith.

Add new science only after the extracted module is independently tested.
