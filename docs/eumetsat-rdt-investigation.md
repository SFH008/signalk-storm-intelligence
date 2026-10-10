# EUMETView RDT acquisition investigation

Checked on 2026-10-10 UTC on `experiment/eumetsat-rdt`, baseline
`19b27b6`. This is an acquisition investigation; it changes no runtime,
alerts, configuration or production installation. Service observations are
time-sensitive.

Subsequent public-source research obtained 42 native MTG v2025 test-reference
files. See [the MTG native contract](rdt-mtg-native-contract.md) for direct
metadata findings and the member checksum manifest. This is distinct from the
MSG WFS acquisitions below and from the operational v2025.2 Europe publication.

## Bounded exact-time retrieval

The fixed test domain is west 7, south 36, east 16.5, north 45 degrees.
It is a broad Mediterranean research domain, independent of vessel position.
The test time is explicitly `2026-10-10T09:00:00Z`.

```bash
curl --fail --silent --show-error --max-time 25 --max-filesize 5000000 \
  --get 'https://view.eumetsat.int/geoserver/wfs' \
  --data-urlencode 'service=WFS' \
  --data-urlencode 'version=2.0.0' \
  --data-urlencode 'request=GetFeature' \
  --data-urlencode 'typeNames=msg_fes:rdt' \
  --data-urlencode 'count=100' \
  --data-urlencode "CQL_FILTER=time = '2026-10-10T09:00:00Z' AND BBOX(the_geom,7,36,16.5,45,'EPSG:4326')" \
  --data-urlencode 'outputFormat=application/json' \
  -D rdt-response.headers -o rdt-response.json
```

Use separate output paths for every acquisition. Diagnostic requests in this
investigation omitted `--fail` to retain error bodies. Curl success alone is
not evidence of HTTP success or valid JSON. Bound retries, serialize requests,
and verify status, content type and schema before interpreting any response.

| Request | Server response time UTC | Result |
| --- | --- | --- |
| DescribeFeatureType | 11:22:58 | HTTP 200, GML schema, 2,150 bytes |
| Exact frame, count 2 | 11:23:11 | HTTP 200 JSON; matched 8, returned 2 |
| Exact 09:01 frame, count 100 | 11:23:32 | HTTP 200 JSON; matched/returned 0 |
| Exact 09:00 frame, count 100 | 11:23:42 | HTTP 503 HTML; server requested a lower request rate |
| Sequential repeat, 09:00, count 100 | 11:23:51 | HTTP 200 JSON; matched/returned 8 |

The 503 occurred while the complete and empty requests were made concurrently.
Its reported queue delay was 10,001 ms. This small sample establishes successful
retrieval, not an SLA, rate limit or a causal diagnosis of the failure.

Every feature in the complete response carries `properties.time` equal to the
requested timestamp. Response `timeStamp` is a later service response timestamp;
it must not replace the feature timestamp. The empty off-cadence request did
not substitute another time. An empty response cannot establish absence of
convection: the requested product frame may be unavailable.

Returned geometry is GeoJSON MultiPolygon with longitude/latitude coordinates
and an EPSG:4326 CRS declaration. These requests demonstrate objects intersecting
the test domain, not guaranteed full satellite coverage. Intersecting polygons
may extend outside query bounds. Count-limited results are incomplete when
`numberMatched > numberReturned`; reject or retrieve all pages with bounded
limits before treating them as a frame. Never silently discard the remainder.

## Metadata and unresolved semantics

The live WMS capabilities advertised the RDT time dimension as
`2023-03-07T11:15:00.000Z/2026-10-10T10:45:00.000Z/PT15M`, with
`nearestValue="1"`. This advertises a temporal range and cadence; it does not
prove availability of every historical frame. WMS nearest-time behavior must
not be used for exact historical acquisition.

DescribeFeatureType confirms nullable numeric fields `BTmin`, `CoolingRat`,
`DTtropoOT`, `CTPressure`, `MvtDirecti`, `MvtSpeed`, `BTmoy`, `CRainRate`,
`Duration`, plus string `PhaseLife`, dateTime `time` and point geometry.
The sample contains `Growing` and `Mature` phase strings and `-9999` values
for `DTtropoOT`. These are observed values, not a verified codebook.

Before normalization, obtain authoritative definitions for field units,
missing-value codes, direction convention, phase vocabulary and timestamp
meaning for this specific published layer. GeoServer feature IDs such as
`rdt.56327112` must not be assumed to be persistent cell-track identities.
Forecast geometries, movement quality, licensing, attribution, redistribution
and historical completeness remain unverified.

The [EUMETView product page](https://view.eumetsat.int/productviewer/productDetails/msg_fes%3Ardt?v=default)
describes convective cloud detection and tracking. The
[Convection Working Group overview](https://cwg.eumetsat.int/rapidly-developing-thunderstorm/)
provides scientific context. Neither abbreviated schema names nor plausible
sample values justify unit conversions. Cloud motion is not surface wind;
RDT does not establish calibrated marine squall probability or gust strength.

## Acquisition evidence

Native responses remain local in `/tmp`; retention is temporary and their
redistribution rights have not been established. They were not added to public
fixtures. Preserve them in an authorized immutable research archive before
using them for replay. HTTP header files are diagnostic and include service
cookies; omit cookies from shareable acquisition metadata.

| Local response | SHA-256 |
| --- | --- |
| `/tmp/rdt-schema.xml` | `fe8e9d91fc2b0601efabf9c7972f5ba1faba4a1742622440036a8d543fec0b21` |
| `/tmp/rdt-feature.json` (truncated) | `4ef1d74bca7f4a493e74048d8e0d5ee97ee4aee735450da9017ed9065856d632` |
| `/tmp/rdt-complete.json` (503 HTML) | `961ffff30f27fb9a01b56bde0fd5cfb9abe906dde8d404c14dadead44d285b07` |
| `/tmp/rdt-empty.json` | `a2cb2e53f2a63ec9ddddcd27a9fc9a28aa4a7ab8730408fabc917f390f14d15d` |
| `/tmp/rdt-repeat.json` (complete) | `4eb5771a9035807a3f11eef4edb2d4fec93eca1276ca39e008ae0990c99f4639` |
| `/tmp/rdt-wms.xml` | `ddbb21b480650f834d25d16130d5780530c34ee84bcc5a8e4b1cb17d4f225a32` |

Next acceptance gates are repeated serialized retrieval across multiple exact
frames, authoritative layer semantics and terms, then deterministic offline
contract fixtures. Operational integration must use distinct normalized
convective-cloud objects rather than fabricated radar reflectivity, and must
retain source provenance and explicit missing/stale/truncated status.

## Serialized follow-up and acquisition tool

`scripts/live-check-eumetsat-rdt.js` is a research-only checker. It makes no
operational-provider registrations and emits no hazards. Run it with a new
output directory and 1..8 explicit UTC times:

```bash
npm run live-check:rdt -- /tmp/rdt-research-new \
  2026-10-10T09:00:00Z 2026-10-10T09:15:00Z 2026-10-10T09:30:00Z
```

Requests are serialized with two seconds between requests and no automatic
retries. The CLI uses the fixed broad region above, count 100, a 25-second
whole-request timeout, and a 5 MB streamed response limit. The exported research
`acquire` function accepts explicit `count`, `timeoutMs` and `maxBytes` overrides;
these are not plugin settings. Redirects are not followed. Output directories
and files are created exclusively; existing acquisition directories are
refused. Each complete downloaded body is preserved unchanged as `response.bin`,
including HTTP error bodies, with selected non-cookie HTTP metadata, exact
request, receipt time, byte count, checksum, runtime/package version and script
checksum in `acquisition.json`. Timeout/transport/oversize failures produce
metadata without pretending a partial body is a complete archived input.

The checker rejects non-JSON success responses, malformed collections, count
truncation, unsupported CRS, duplicate IDs, substituted/mixed timestamps and
malformed polygon rings/coordinates. It does not validate polygon topology,
meteorological attributes, spatial completeness or freshness for operational
use. An old exact frame is legitimate research input; this tool is not a stale
data guard for alerts. Empty results are labelled `empty-or-unavailable`.

A serialized run on 2026-10-10 returned HTTP 200 and complete exact-time frames:

| Product time UTC | Response timestamp UTC | Objects | Native SHA-256 |
| --- | --- | --- | --- |
| 09:00 | 11:31:55.469 | 8 | `eccfd11bed521b775f156edc344c71eb3a312711b0343a463d08b407fe603638` |
| 09:15 | 11:31:57.695 | 11 | `17bd05918ffab55fc3fa38e46818f4505faec7428ac5632c0f418b94af5092fd` |
| 09:30 | 11:31:59.889 | 10 | `275e57da305be0214a0311386857990329381ee663649f54057a08107e109b63` |

Records are local in `/tmp/rdt-series-20261010b/frame-{1,2,3}`. The table uses
the response's `timeStamp`, not physical observation time or exact local receipt
time; local receipt times are in the acquisition records. All feature IDs differ
between these three responses. Persistent identity is therefore not established.
Repeated 09:00 retrieval returns identical feature content and IDs; raw-response
checksums differ because response metadata includes a new service timestamp.

The official [NWC SAF 2018.1 algorithm reference, issue 2.2](https://www.nwcsaf.org/Downloads/GEO/2018.1/Documents/Scientific_Docs/NWC-CDOP2-GEO-MFT-SCI-ATBD-Convection_v2.2.pdf)
describes weighted-centre displacement and temporal motion coherence, including
split/merge sensitivity. This explains the native algorithm; it does not verify
the published WFS field mapping or direction convention. The official
[EUMETSAT data policy page](https://www.eumetsat.int/legal-framework/data-policy)
links policy and licence guidance. Product-specific terms for this RDT vector
layer remain unresolved; terms from other SAF products or the tutorial code
must not be assumed to apply.

Offline tests use synthetic contract data and injected transports, including
timeouts, oversize bodies, service failures and archive-overwrite prevention.
No upstream meteorological data or credentials are bundled in the tests.

Validation passed with local Node 24.21.0: `npm run quality` (89.12% lines,
73.94% branches; audit reported zero vulnerabilities), explicit syntax checks
for the research script/tests, and `git diff --check`. Package dry-run review
includes the script, tests and documentation, with no native acquisition files.
The default local Node 20.19.2 cannot run the repository's existing coverage
threshold flags; use the compatible local Node version for the full quality gate.

## Published-layer contract follow-up

The [official EUMETSAT RDT factsheet, v2, 2020-11-03](https://user.eumetsat.int/s3/eup-strapi-media/Rapidly_Developing_Thunderstorms_Convective_Warning_RDT_Factsheet_ae6004b457.pdf)
identifies GEO 2018.1 production, native analysis plus four forecast files, and
references ATBD 2.1, convection user manual 1.0 and Data Output Format 1.0.
It warns that newer NWC SAF documentation may not apply. Its native-product
availability statements do not establish WFS forecast publication or history.
The [applicable convection user manual](https://www.nwcsaf.org/Downloads/GEO/2018/Documents/Scientific_Docs/NWC-CDOP3-GEO-MF-PI-SCI-UM-Convection_v1.0.pdf)
was retrieved locally; the published-layer field transformation remains unverified.
An attempted public GeoServer style URL returned 404 and supplied no mapping.

[EUMETSAT terms of use](https://www.eumetsat.int/about-us/terms-use) distinguish
website content licensing from satellite products and refer those products to
the EUMETSAT data policy and applicable third-party policies. This does not
establish a licence for this layer. No operational use or redistribution grant
has been inferred from public technical access.

A [provisional offline resource](convective-cloud-resource.md) is now implemented
for checksum-verified native acquisitions. Geometry and source IDs are preserved;
product time and meteorological fields stay explicitly uninterpreted. It is
marked unusable operationally and is not registered in runtime discovery.

### Questions prepared for provider clarification

These questions are prepared for review; no message has been sent externally.
Identify the target as EUMETView WFS `msg_fes:rdt`, not merely the native RDT-CW
software output:

1. Which native product/version and transformations generate this layer? What
   do `time` and the polygon represent, and are any forecast geometries exposed?
2. What are the exact units, sign conventions, valid ranges and missing codes
   for each numeric WFS field? Is `MvtDirecti` a bearing towards movement or
   a meteorological direction from which movement comes?
3. What is the full `PhaseLife` vocabulary? Does a GeoServer feature ID persist
   across frames; if not, is native cell identity or lineage available elsewhere?
4. Are motion-quality flags, contour level, parallax correction and generation
   timestamps available through this layer or a supported native-data service?
5. What are supported query limits, cadence, geographic footprint, historical
   retention and methods to distinguish a missing frame from a genuinely empty
   convective-object result?
6. Which product-specific terms govern onboard operational use, local archival,
   derived alerts, raw/derived redistribution and attribution?

## Offline replay follow-up

The [offline replay command](convective-cloud-resource.md#offline-transformation-replay)
processed the three retained acquisition frames successfully into
`/tmp/rdt-offline-replay-20261010/replay.json`. Output retains exact published
product times, 8/11/10 objects, input integrity and explicit unresolved semantics.
Deterministic tests cover repeat output, ordering, failed versus empty input,
tampering, overwrite prevention, file bounds and symlink rejection. This remains
transformation replay, not a meteorological or alert-skill evaluation.

The official [EUMETSAT User Notification Service](https://uns.eumetsat.int/uns/?filter=serviceenhancements)
lists announcement 13928 for MTG-based geostationary nowcasting RDT released
on 2026-09-24. That is a potentially useful alternative acquisition product;
it does not verify the transformation, licence or field units of `msg_fes:rdt`.
Native MTG RDT should be evaluated separately if its product contract and access
can be established. No migration or capability inference has been made here.

## MTG access and public-contract investigation outcome

A fresh live WMS catalogue check on 2026-10-10 exposed only `msg_fes:rdt`
among layer names/titles containing RDT or thunderstorms. Its latest advertised
time was 11:15 UTC. No separately advertised MTG RDT layer was found in this
catalogue. This does not establish that native MTG RDT is unavailable through
other dissemination services; it rules out assuming a new EUMETView layer from
the release announcement alone. The local capability response is
`/tmp/rdt-mtg-catalogue.xml`, SHA-256
`e0697064596b3565956e3f70e3173b667b5acbfbdd55fbcdf0845647a0db3355`.

The public WMS `GetStyles` request for `msg_fes:rdt` succeeded:

```text
https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.1.1&request=GetStyles&layers=msg_fes%3Ardt
```

Its returned styles render cloud outlines and rounded `BTmin` labels. They do
not reference `MvtSpeed` or `MvtDirecti`, declare their units or supply a movement
direction convention. The style title mentioning vectors is not proof of an
available vector depiction or its semantics.

The official [MTG Africa guide appendices](https://user.eumetsat.int/s3/eup-strapi-media/MTG_Africa_data_service_guide_Appendices_6262ad40d5.pdf)
list `NWC-2-RDT-AFRICA-AF-x.ncml` as a format-description attachment, but the
retrieved PDF contains zero extractable embedded files (`pdfdetach -list`).
It supplied no inspectable RDT NcML contract. This Africa-customized product
also must not be assumed identical to the MSG WFS publication or the newly
announced Europe/Terrestrial product.

The checked public paths have not resolved the published layer's field contract
or usage rights. The concrete next dependency is an authoritative provider
answer to the six prepared questions above, or the applicable published native
format plus a documented native-to-WFS mapping. Further operational integration
cannot proceed by guessing units or timestamps. Acquisition, checksum-verified
resource transformation and offline replay are ready to use while that dependency
is resolved. No external contact, product migration or production deployment
was performed.

## User-supplied MTG v2025 reference page

The user supplied [NWC SAF RDT v2025](https://www.nwcsaf.org/rdt_v2025).
Its embedded [reference-system page](https://www.nwcsaf.org/AemetWebContents/ReferenceSystem/GEO/ProductsPages/v2025/ReferenceSystem_GEO_RDT_rdt.html)
is labelled “Rapid Developing Thunderstorms MTG v2025” and links a latest GIF,
fixed-time GIFs and an animation loop. The latest image link is
`/ARCHIVO/v2025/NRT/S_NWC_RDT-CW_MTG_REFSYS-NR_LAST.rdt.gif`.

This confirms a public MTG v2025 visualization path distinct from EUMETView's
`msg_fes:rdt` layer. The inspected page does not link native NetCDF or GeoJSON
cloud objects, declare motion units, or establish the WFS layer's transformation.
Rendered imagery must remain visualization evidence; no polygons or motion
attributes have been reverse-engineered from it. The provider clarification
should now also ask for supported native access to this MTG v2025 product,
its applicable output-format specification and product-specific usage terms.

## Public extraction supersedes external-contact dependency

The user has directed that no email be sent and necessary information be
extracted locally. No external message was sent. Further investigation found
public AEMET native NetCDF examples and conversion code, plus the official
queryable NWC SAF ADAGUC reference service. The earlier conclusion that provider
contact was the necessary next dependency was too strong.

See [the extracted native field contract](rdt-native-field-contract.md) for
verified native speed/direction units, packing and fill values, phase/motion
quality codes, scan-time offsets, and the important finding that `RDT_NOW`
can expose forecast objects. Native v2018 metadata must still be distinguished
from EUMETView transformations and actual MTG v2025 metadata. Runtime gates
remain intact while those publication-specific differences are extracted.
