# Configuration

## 1. Configuration model

Configuration is capability-driven. Generic settings control runtime behavior, while provider/algorithm-specific settings remain namespaced.

```text
providerSettings.<radar-provider>
lightningProviderSettings.<observation-provider>
inferenceAlgorithmSettings.<algorithm>
```

Provider-qualified radar products use `provider:PRODUCT`, preventing collisions between national services which use similar product names.

## 2. Radar providers and layers

`enabledProviders` selects radar providers. `displayLayers` selects raster products to advertise as chart overlays. `acquisitionTargets` selects provider-native products for background acquisition when supported. `prefetchTargets` selects rendered products for operating-area storage.

Configuring a provider-qualified layer/target can implicitly require that provider to be instantiated; the runtime validates product existence against discovered adapter metadata.

Radar-DPC keeps its REST, v2 WebP tile, legacy WMS and HRD binary-product endpoints in the adapter-owned `providerSettings.radar-dpc` namespace. VMI, SRI and accumulated-rain overlays use immutable, time-qualified Radar-DPC v2 WebP data tiles and are decoded into the normalized PNG chart contract with provider-owned palettes. They do not silently fall back to the legacy WMS because the legacy and v2 rendering pipelines may publish different pixels for the same timestamp. Products not published through the documented v2 tile client retain their existing WMS transport inside the adapter. HRD discovery uses the latest VMI observation only as a bounded time index, then verifies the exact HRD object before reporting that timestamp; unavailable frames are not silently substituted.

`stormSources` is an ordered, unique array of provider-qualified storm sources. The default contains the legacy default source; an existing `stormSource` migrates to a one-element array when `stormSources` is absent. Invalid targets are filtered, duplicates removed, and required providers enabled. `stormSource` remains a compatibility alias for the first configured source. Add standby sources to `acquisitionTargets` to keep their inputs warm.

One source is authoritative at a time. At each acquisition cycle, selection uses adapter product bounds and the vessel position projected over `horizonMinutes` using Signal K SOG (m/s) and true COG (radians). The active source stays selected while both positions are covered; otherwise selection prefers the first source covering both, then the first covering the current position. Missing projection uses the current position. If no source covers it, the runtime currently retains its selected source; this is not evidence of radar coverage. Rectangular product bounds do not establish radar quality. A source change preserves the V3 runtime/tracker but clears its previous motion frame: the first new-source frame has unknown motion, and later motion requires supported source-local evidence. Inactive configured sources do not advance either storm engine.

## 3. Background acquisition

Important controls include acquisition enablement/poll interval and archive retention by maximum age/bytes. Raw acquisition is capability-dependent; WMS-only providers are not treated as raw-download providers.

## 4. Prefetch/offline

Prefetch configuration controls operating-area radius, zoom levels, maximum tiles per cycle, concurrency and independent storage retention. Large radii/high zooms can generate substantial bandwidth/storage use.

## 5. Temporal playback

Playback configuration controls enablement, number of advertised frame slots, timeline lookback and UI animation interval. Slots are a plotter compatibility mechanism rather than provider time semantics.

## 6. Storm tracking and alarms

Configuration includes warning/alarm distance thresholds, severity thresholds, prediction horizon, matching radius, track-history length, path-sampling interval and uncertainty bounds.

Threshold changes alter operational behavior and should be versioned/frozen in scientific experiments.

## 7. Lightning

Lightning configuration selects observation providers, query lookback/radius, map visibility and proximity alarm thresholds. `lightningAssociationRadiusNm` controls how far a point strike may be from an existing storm-cell geometry and still corroborate that cell; it never creates a cell. `lightningEvidenceWeight` bounds the confidence contribution from associated strikes. Provider-specific credentials/endpoints live under the observation-provider settings namespace.

The Radar-DPC v2 lightning event-map adapter consumes the current `LGT` binary frame independently of the radar provider adapter. DPC does not document trustworthy per-event timestamps in that frame, so the adapter provides a plotter density/event-map capability but deliberately does not emit normalized point strikes into inference. Point-based lightning fusion requires a separately configured provider that supplies trustworthy event timestamps.

## 8. Onboard environmental evidence

Onboard values are accepted as fresh corroborating evidence only when a source timestamp is available and their age is at most `onboardEnvironmentMaxAgeSeconds` (the boundary is inclusive). Missing timestamps are reported explicitly and handled conservatively; stale values remain visible in status metadata but do not contribute fresh evidence.

Onboard environment controls include history length, maximum accepted sample age (`onboardEnvironmentMaxAgeSeconds`) and maximum confidence/evidence contribution. Local environmental signals remain bounded corroboration in the default algorithms.

## 9. Signal K Weather API evidence

Weather API controls include sample radius, number of bearings/locations, maximum returned observations, maximum age and evidence weight.

A scientific replay should freeze the resulting normalized observations rather than querying live Weather Providers.

## 10. Inference algorithms

`inferenceAlgorithms` is an ordered list. Order matters because refiners receive `baseCells` produced by earlier algorithms.

Default operational inference is deterministic (`kinematic-polygon`, `multisensor-evidence`). Experimental DNN and LLM algorithms are disabled by default.

`inferenceStrategy` currently supports:

- `max-severity`;
- `weighted-confidence`.

Each algorithm has an independent object under `inferenceAlgorithmSettings`. Every bundled algorithm exposes its ensemble `weight`, including the deterministic kinematic and multisensor algorithms. Weights range from 0 to 5; zero keeps execution/provenance while removing ensemble influence. Registry defaults are merged before user overrides, so a partial settings object does not discard unspecified algorithm defaults.

`stormBaseUncertaintyNm` accepts zero. This disables the fixed base term only; motion confidence and residual error can still produce non-zero track uncertainty.

## 11. Configuration completeness contract

Every core key in the runtime defaults must have a corresponding top-level Signal K schema property. Provider-, observation-provider- and inference-specific settings must be declared by their adapter/algorithm schema and remain namespaced. A deterministic test enforces top-level coverage; contributors must add schema, normalization, documentation and tests together whenever an operational threshold, retention limit, endpoint behavior or scientific weighting becomes configurable.

## 12. Multimodal DNN

The DNN settings can select a model path, confidence threshold, completeness penalty and algorithm weight. A replacement model must satisfy the exact feature schema expected by the runtime and should carry immutable provenance/checksum metadata.

See [`multimodal-dnn.md`](multimodal-dnn.md).

## 13. OpenAI-compatible LLM

Important settings include:

```text
baseUrl
protocol
model
apiKeyEnv
minimumConfidence
maxEscalationLevels
timeoutMs
maxRetries
maxCandidatesPerRequest
cacheTtlSec
disableStorage
```

The API secret itself belongs in the named process environment variable, never in JSON configuration. Remote inference may disclose normalized vessel/weather evidence to the configured endpoint.

See [`llm-openai-compatible.md`](llm-openai-compatible.md).

## 14. Secrets

Do not commit secrets or place them in exported benchmark configurations. Research manifests should record secret-variable **names** only when necessary to explain execution configuration.

## 15. Configuration reproducibility

Published/replayed experiments must archive the complete non-secret resolved configuration, not merely the differences from defaults. Defaults can change between releases.

Include plugin version/Git commit so a future researcher can reconstruct the same schema/default behavior.

## Normalized radar hazard decomposition

Operational V3 hazards use connected reflectivity bodies and qualified cores independently of the filtered development-candidate list. `hazardBodyReflectivityDbz` defaults to 30 dBZ and `hazardSeedReflectivityDbz` to 36 dBZ (both bounded to −20 through 80 dBZ). `hazardMinSeedAreaKm2` and `hazardMinRegionAreaKm2` default to 25 km² (bounded to 0 through 1,000,000 km²). Persisted non-finite values use defaults. Core support must also meet the body threshold. Multiple qualified cores partition a body by deterministic eight-neighbour breadth-first expansion; small resulting regions are suppressed. Bodies without qualified cores cannot become hazards. Reflectivity fractions retain their fixed 30/36/42 dBZ meanings when thresholds change. These thresholds are operational heuristics, not calibrated storm probabilities.

## DPC VMI with Storm Runtime V3

Select `radar-dpc:VMI` as the authoritative storm source and include it in acquisition:

```json
{
  "stormSources": ["radar-dpc:VMI", "aemet:COMPO", "ipma:PCR"],
  "acquisitionTargets": ["radar-dpc:VMI", "aemet:COMPO", "ipma:PCR"],
  "providerSettings": {
    "radar-dpc": {
      "vmiGridWidth": 600,
      "vmiGridHeight": 700,
      "vmiMaxInputPixels": 4000000,
      "vmiMaxRawBytes": 33554432
    }
  }
}
```

Source order and vessel coverage determine which source is authoritative. Existing default/explicit HRD settings remain on the legacy path; enabling VMI is an explicit configuration choice. Map overlays continue to use the existing time-qualified WebP rendering path, while V3 acquires the native GeoTIFF. `radar-dpc:VMI` uses the same hazard-region, source-local motion, tracking, severity and forecast pipeline as AEMET COMPO and IPMA PCR.

DPC-owned grid dimensions are integers from 32 through 1600 pixels; maximum native raster size is 1 through 16,000,000 pixels; maximum download size is 1024 through 134,217,728 bytes. Defaults appear above. Partial provider settings merge with adapter defaults; invalid non-finite values use defaults and finite persisted values are clamped. Grid settings change spatial resolution and hazard/motion results; choose them before freezing an experiment. No-data and unsupported reflectivity samples remain unknown, including for motion. See [DPC VMI normalization](dpc-vmi-normalization.md) for scientific semantics and upstream documentation.
