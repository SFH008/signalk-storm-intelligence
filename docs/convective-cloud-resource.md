# Convective cloud research resource

This is a provisional, offline research contract. It is not the observation
provider contract and is not registered with acquisition, inference, Signal K
resources or the operational WebApp. No alerts consume it.

The EUMETView layer's geometry and structural field types have been verified.
Its physical timestamp semantics, attribute units, movement convention, complete
phase vocabulary and redistribution terms remain unresolved. The normalizer
therefore sets `operationallyUsable: false`, retains `productTime`, and deliberately
does not create `observedAt`, `validAt`, motion, reflectivity, severity, confidence,
gust estimates or track identities. A future operational contract requires
documented semantics and a separate version.

## Offline boundary

`lib/eumetsat-rdt-resource.js` exports:

```js
resourceFromAcquisition(nativeBuffer, acquisitionRecord)
```

The native buffer must match the record's SHA-256 and byte count. The record
must identify `eumetsat` / `msg_fes:rdt`, HTTP 200 JSON, an exact requested UTC
product time, explicit record-count limit and UTC local receipt time. Failed,
truncated, malformed, timestamp-substituted and checksum-mismatched inputs fail
explicitly. The function performs no network requests or filesystem writes and
does not modify its arguments. Use native `response.bin` and `acquisition.json`
from the [research acquisition tool](eumetsat-rdt-investigation.md).

The shared structural validator is `lib/eumetsat-rdt-contract.js`; acquisition
and offline normalization use the same exact-time, count, CRS and ring checks.
These checks do not prove polygon topology, physical validity or full coverage.

## Resource fields

| Field | Meaning |
| --- | --- |
| `schema` | `storm-intelligence/rdt-research-resource/1` |
| `kind` | `convective-cloud-objects`; distinct from radar evidence |
| `provider`, `product` | Source identity |
| `productTime` | Canonical UTC value from the exact requested WFS feature `time`; physical meaning unverified |
| `receivedAt` | Local full-response receipt timestamp from acquisition metadata |
| `availability` | `complete` or `empty-or-unavailable`; counts describe this response, not satellite spatial coverage |
| `operationallyUsable` | Always `false` in this version |
| `timeSemantics` | `unverified-published-product-time` |
| `objects` | Deterministically sorted cloud-object records |
| `provenance` | Native checksum, transformation version, unresolved semantics and service response timestamp |

Each object has a `sourceFeatureId`, WGS84 longitude/latitude MultiPolygon
`geometry`, `nativeAttributes`, and an explicit unverified-semantics quality
marker. Source IDs are record identifiers; they are not local persistent tracks.
The geometry is a satellite cloud contour, not a measured sea-level hazard or
gust-front boundary.

`nativeAttributes` preserves the schema's numeric fields (`BTmin`, `CoolingRat`,
`DTtropoOT`, `CTPressure`, `MvtDirecti`, `MvtSpeed`, `BTmoy`, `CRainRate`,
`Duration`) and string `PhaseLife`. No unit conversions or phase mappings are
performed. Missing fields remain absent; null stays null; apparent sentinels
such as `-9999` remain unchanged. Unknown fields and the auxiliary point are
retained in the immutable native input, rather than given invented semantics.

For reproducibility, freeze the native input, acquisition record, source revision
and both normalization/contract module checksums. The named normalizer version
alone does not replace a frozen code revision. Data redistribution is conditional
on verified product-specific rights; synthetic tests can be shared without
publishing native provider responses.

## Offline transformation replay

```bash
npm run replay:rdt -- /tmp/rdt-series-20261010b /tmp/rdt-offline-output-new
```

The input is an acquisition directory containing `frame-N` directories with
`acquisition.json` and, when fully downloaded, `response.bin`. The output must
be a new directory. `replay.json` preserves normalized resources, unavailable
acquisition records, source/acquisition checksums and the current replay,
normalizer and contract module checksums. Failed acquisition text is reduced to
a fixed failure category, rather than copied from untrusted transport metadata.
An HTTP failure's archived response is checksum-verified when present.

Replay sorts by published product time and source directory as a tie breaker;
this is a transformation order, not a verified physical observation timeline.
It performs no inference, live acquisition, time substitution or missing-frame
interpolation. An unavailable frame is never transformed into an empty/all-clear
frame. Identical inputs and code under the same Node/package versions produce
identical output bytes; no current wall-clock time or absolute vessel/file paths
are added to the replay artifact.

The research command bounds each native file to 5 MB, each metadata file to
64 KiB, the frame count to 64, and total native input bytes to 32 MB. It refuses
symlink frame directories/files and validates all inputs before creating output.
These are documented research-tool limits, not hidden operational thresholds.
Native inputs remain separate from disposable derived replay output. No output
should be redistributed until product-specific rights have been established.

## Acceptance gates for an operational successor

Verify the published layer's observation/generation/forecast time mapping,
movement units and direction convention, missing-value codes, phase definitions,
object identity and motion quality. Confirm native-to-WFS field transformation
and whether forecast geometry is actually published. Establish product-specific
attribution, retention, redistribution and operational-use rights.

Then introduce freshness/quality guards with adapter-owned configuration and
deterministic replay tests. Cloud-only geometry must remain distinguishable from
radar detections through tracking, duplicate handling, fusion and presentation.
Environmental corroboration may strengthen existing evidence but must not invent
remote cells. Alerts need independent marine impact validation.
