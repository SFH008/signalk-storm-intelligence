# Storm Intelligence — status and RDT handover

Date: 2026-10-10 UTC
Repository: `/projects/signalk-storm-intelligence`

## Current status

- Version: **2.4.1**.
- Production: `http://192.168.2.120:3000`, Docker container `signalk-server`.
- Latest read-only verification: container **running / healthy**, installed plugin **2.4.1**.
- Current local branch: `experiment/eumetsat-rdt`.
- Baseline commit: `19b27b6` — Enable DPC VMI on storm engine V3 and improve runtime reliability.
- `experiment/hazard-region-quality` points to the same commit.
- Working tree was clean when preparing this handover; this document is outside the repository.
- Remote publication is **not verified**. Neither of these two local branches currently shows an upstream tracking branch. Do not assume they were pushed.
- RDT investigation only: no RDT detector or alert integration has been implemented or deployed.

## Completed baseline work

- DPC VMI GeoTIFF normalization into geographic reflectivity evidence for the shared storm engine V3.
- Adapter-owned normalization for AEMET COMPO, IPMA PCR, NOA rainfall rate and DPC VMI; generic orchestration uses capabilities rather than bundled provider names.
- Native DPC input archival and checksum/projection/resampling provenance. Unsupported or invalid TIFF inputs fail explicitly.
- DPC normalization settings exposed in its adapter schema and documented for reproducibility.
- Multiple configured radar sources acquired in the background, with coverage-aware active-source selection. The active source is retained while it covers the vessel and projected position.
- Hazard-region decomposition, source-selection and normalization tests, configuration/documentation updates, and dependency maintenance included in the baseline commit.
- Dashboard inference status now reports the V3 processed observation timestamp instead of incorrectly waiting for a legacy inference cycle.

Key files: `lib/dpc-vmi-evidence.js`, `lib/dpc-provider.js`, `providers/radar-dpc.js`, `lib/storm-source-selector.js`, `lib/storm-tracker-v3/hazard-regions.js`, `index.js`, `public/dashboard.js`, `docs/dpc-vmi-normalization.md`.

## Production configuration and recovery

Configured storm sources and background acquisition: `aemet:COMPO`, `ipma:PCR`, `radar-dpc:VMI`. Existing NOA overlays remain available. DPC VMI was added without replacing the existing source order.

Plugin path inside Docker: `/home/node/.signalk/node_modules/signalk-storm-intelligence`.
Signal K data directory: `/home/node/.signalk`, bound to host `/opt/signalk`.

Deployment records:

- `/home/node/.signalk/deployments/storm-2.4.0-20261010`
- `/home/node/.signalk/deployments/storm-2.4.1-20261010`

The 2.4.1 deployment includes the release archive, previous plugin directory, configuration backup and root package/lock backups. Use these for a deliberate rollback if necessary; retain current configuration and archive data before any rollback. Do not remove backups during RDT experiments.

## Provider observations

These are time-sensitive findings from this session, not guarantees of current provider service state.

- **AEMET:** acquisition and V3 processing working during production verification.
- **DPC VMI:** live acquisition, normalization and consecutive-frame V3 processing verified. Some native LZW strips produce decoder warnings about missing end-of-information markers while decoding successfully; this remains a documented limitation.
- **IPMA PCR:** official radar timeline returned Portuguese entries with `path: null`; the user also observed an unavailable-images notice on the IPMA homepage. No downloadable observation was available. This is consistent with an upstream publication outage, whose root cause is unconfirmed. Missing imagery must not be interpreted as zero precipitation or no storms.
- **NOA XPOL:** latest timestamp endpoint returned an empty list. Archive fallback was dated 2026-10-03 21:28:50 UTC and therefore stale. Parsing/rendering worked, but current observations were unavailable.

## Validation

- The completed 2.4.1 release previously passed `npm run quality`, with zero reported audit vulnerabilities.
- Package contents were reviewed through `npm pack --dry-run` before deployment.
- Latest baseline rerun passed lint, deterministic tests and coverage gates: 94.33% lines, 79.94% branches.
- That latest full quality command **did not finish successfully**: its final npm audit request failed with registry DNS error `EAI_AGAIN`. This was a network failure, not a passing audit. Rerun with working network access before the next release.
- Production dashboard asset was previously compared with the local deployed version; production container/version were checked again for this handover.

## RDT objective

User intent: improve sailors' awareness of approaching squalls in areas between and beyond land-based radar coverage, using EUMETSAT Rapidly Developing Thunderstorms.

RDT detects and tracks convective cloud objects. It can support alerts for approaching convection and possible squall risk. It does **not** directly measure sea-level gust strength, establish a calibrated squall probability, or guarantee protection from all squalls. Cloud motion must not be reported as surface wind.

Authoritative overview: https://cwg.eumetsat.int/rapidly-developing-thunderstorm/

Documented limitations include warm-cloud detection, weaker winter performance, and forecasts that do not model new cell formation, dissipation or trajectory changes. The overview describes forecasts up to one hour; the public vector feed must be checked separately for whether it actually exposes forecast geometries.

## Findings from live EUMETView inspection

Existing adapters:

- `providers/eumetsat.js` and `lib/eumetsat-provider.js`: visual satellite products, not storm detection.
- `observation-providers/eumetsat-mtg-li-afa.js`: flash-area density imagery; does not expose point strikes or quantitative samples.

EUMETView advertises:

- `msg_fes:rdt`: Rapidly Developing Thunderstorms, a vector layer with approximately 15-minute advertised time steps.
- `mtg_fd:li_afa`: Lightning Imager accumulated flash-area imagery, potentially useful for corroboration.
- `mtg_fd:ir105_hrfi`: infrared imagery, useful as context or a later quantitative cloud-evidence input.

WFS capabilities and DescribeFeatureType succeeded. The RDT schema exposes:

- `the_geom`: MultiSurface cloud geometry.
- `time`: observation/product timestamp field, whose exact upstream meaning must be confirmed.
- `MvtDirecti`, `MvtSpeed`: motion fields; units and direction convention remain unverified.
- `PhaseLife`, `CoolingRat`, `BTmin`, `BTmoy`, `CTPressure`, `DTtropoOT`, `CRainRate`, `Duration`, and a point geometry.

Do not guess units, missing-value codes, phase meanings or object identity from abbreviated field names.

Actual GetFeature retrieval is **not yet proven**: a bounded sorted request timed out after 30 seconds; a time-filtered request returned HTTP 503. The service advertises the schema, but availability/reliability is an open blocker for live integration.

WMS dimensions advertise nearest-time selection. An adapter must verify the returned timestamp and must never silently substitute another frame for an explicitly selected historical time.

## Recommended next work on the RDT branch

1. Establish bounded, repeatable WFS retrieval with exact time filters and a fixed broad geographic test region. Check response limits, content types, service errors, empty frames, timestamps and actual spatial coverage.
2. Obtain authoritative field units, missing-value conventions, phase coding, object identity and movement semantics for this published layer. Confirm licence, attribution, redistribution and available history.
3. Preserve immutable native responses and acquisition metadata, then create deterministic offline fixtures for successful, empty, stale and malformed responses.
4. Add an adapter-owned normalized convective-object resource. Keep satellite cloud evidence distinct from radar reflectivity; never synthesize dBZ to pass existing radar thresholds.
5. Reuse suitable tracking, geometry and vessel-interception components with an explicit satellite detector/inference path. Review compatibility first: current deterministic radar inference depends on reflectivity evidence.
6. Evaluate parallel radar/satellite evidence fusion. The current single active radar selector alone will not provide simultaneous offshore satellite coverage; account for duplicate detections and retain source provenance.
7. Design alerts around approaching convection, estimated encounter time and possible squall risk, with configurable uncertainty margins, age limits and motion quality. Treat gust-front displacement from the cloud polygon as an uncertainty, not a measured boundary.
8. Use lightning, radar and onboard pressure/wind observations to corroborate hazards. Preserve the rule that environmental corroboration alone cannot invent remote storm cells.
9. Validate historical cases against independent marine wind/gust observations. Measure missed events, false alerts and useful lead time before claiming marine squall skill.
10. Complete deterministic contract, time, stale-data, geometry, inference isolation, storage/replay and read-only UI tests. Run quality and pack review before any release; deploy RDT only after a concrete tested implementation exists.

Read before implementation: `AGENTS.md`, `docs/data-provider-onboarding.md`, `docs/observation-provider-specification.md`, `docs/inference-algorithm-specification.md`, `docs/storm-intelligence-model.md`, `docs/security-privacy-licensing.md`, and `docs/reproducibility.md`.

## Reproducible investigation requests

These requests use no vessel position or credentials:

```bash
curl --fail --show-error --max-time 30 --get \
  'https://view.eumetsat.int/geoserver/wfs' \
  --data-urlencode 'service=WFS' \
  --data-urlencode 'version=2.0.0' \
  --data-urlencode 'request=DescribeFeatureType' \
  --data-urlencode 'typeNames=msg_fes:rdt'

# Previously returned HTTP 503; choose an appropriate explicit UTC window.
curl --fail --show-error --max-time 20 --get \
  'https://view.eumetsat.int/geoserver/wfs' \
  --data-urlencode 'service=WFS' \
  --data-urlencode 'version=2.0.0' \
  --data-urlencode 'request=GetFeature' \
  --data-urlencode 'typeNames=msg_fes:rdt' \
  --data-urlencode 'count=2' \
  --data-urlencode 'CQL_FILTER=time AFTER 2026-10-10T09:00:00Z' \
  --data-urlencode 'outputFormat=application/json'
```

Investigation files currently in `/tmp`: `storm-eumetsat-capabilities.xml`, `storm-eumetsat-wfs.xml`, `storm-eumetsat-rdt-schema.xml`. Temporary files may not persist between environments; archive any inputs needed for scientific replay deliberately.

## Git publication and next-session start

The baseline commit and RDT branch exist locally. If they have not already been published:

```bash
git push -u origin experiment/hazard-region-quality
git push -u origin experiment/eumetsat-rdt
```

Next session should start by checking `git status -sb`, confirming `experiment/eumetsat-rdt`, reading this handover and repository rules, and resolving reliable RDT object acquisition before changing runtime behavior. Keep production 2.4.1 running during investigation.
