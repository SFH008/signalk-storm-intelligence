# RDT native field contract extracted from public evidence

Checked on 2026-10-10 UTC. No email or other external message was sent. These
findings come from public native metadata, provider-owned conversion code and
a public reference service. They distinguish native RDT from EUMETView's
transformed WFS fields and MTG v2025 from the older MSG reference products.

## Evidence and applicability

The [AEMET ADAGUC utilities repository](https://gitlab.aemet.es/xcalbeta/ADAGUC-utilities)
publishes an RDT converter and a native GEO v2018 MSG4 example. Both were
retrieved and verified at commit `8af1ecc351cc0b563ee5754d401cffb46a136337`:

| Artifact | Repository path | SHA-256 |
| --- | --- | --- |
| Native example | `NWCSAF2ADAGUC/RDT/data/S_NWC_RDT-CW_MSG4_Europe-VISIR_20190827T090000Z.nc` | `a78f3af8c11fc684ff4330924d44b0d343908c5a0d6259c82b942acb93e6d253` |
| Converter | `NWCSAF2ADAGUC/RDT/nwcpy_rdt_to_geoJSON.py` | `8c3481974a8dd512a5af85079d7a10da26b1135198abc50a89af50104ee39a66` |

The example declares CF-1.6, GEO v2018 and RDT-CW algorithm v50. It is not an
MTG v2025 example. Its native metadata is direct evidence for this file's
contract, not proof that a current hosted service uses identical processing.
The public converter is independent evidence of how that application interprets
native variables. It does not establish EUMETView's native-to-WFS conversion.

## Extracted native quantities

Scale and offset apply to packed numeric data. Reject `_FillValue` and enforce
the packed `valid_range` before computing `raw * scale_factor + add_offset`.
Never apply packing again to already decoded NetCDF values. The table uses the
intended decimal scale/offset; the file's floating-point metadata retains small
representation differences and must be frozen for exact replay.

| Native variable | Decoded units/meaning | Scale | Offset | Packed fill |
| --- | --- | --- | --- | --- |
| `MvtSpeed` | Cloud motion speed, m/s | 0.001 | 0 | 65535 |
| `MvtDirection` | Movement towards bearing, degrees | 1 | 0 | 65535 |
| `Duration` | Time since cloud-system birth, seconds | 1 | 0 | 65535 |
| `DecTime` | Radiometer-time offset from slot time, seconds | 1 | 0 | 65535 |
| `LeadTime` | Forecast lead from slot, seconds | 1 | 0 | 65535 |
| `BTmin`, `BTmoy` | Brightness temperature, kelvin | 0.01 | 130 | 65535 |
| `CoolingRate` | Temperature-change rate, K/s | 0.000002 | -0.05 | 65535 |
| `CTPressure` | Minimum cloud-top pressure, pascals | 10 | 0 | 65535 |
| `CRainRate` | Maximum convective rainfall rate, mm/hour | 0.1 | 0 | 65535 |
| `DTtropoOT` | Overshoot temperature difference, kelvin | 0.01 | -20 | 65535 |

`MvtDirection` declares `standard_name=wind_to_direction`. The
[CF standard-name definition](https://cfconventions.org/Data/cf-standard-names/current/src/cf-standard-name-table.xml)
defines a towards bearing measured clockwise from geographic north. The
converter passes that value to a forward geodesic and multiplies speed by
900 seconds to draw a 15-minute displacement. Both support the native
movement-towards interpretation. This is cloud motion; the standard-name label
must not cause it to be published as measured surface wind.

Native direction has packed valid range 0..360, `DecTime` 0..1800 seconds,
`LeadTime` 0..3600 seconds, and duration/speed 0..65534 packed units. Rain rate
has packed range 0..500; cloud pressure 500..11000; brightness temperature
0..22000; overshoot temperature difference 0..2000. These are this native
example's metadata limits, not deployment tuning thresholds.

Native categorical fields:

| Field | Codes | Fill |
| --- | --- | --- |
| `PhaseLife` | 0 triggering; 1 triggering from split; 2 growing; 3 mature; 4 decaying | 255 |
| `MvtQuality` | 1 high; 2 moderate; 3 low; 4 very low | 255 |

The converter renders phase 3 as `Maturity`, while the native flag meaning is
`Mature`. String presentation is therefore already a transformation. Do not
assert an exhaustive WFS vocabulary from this native table.

## Time, geometry and identity

The native example contains `nominal_product_time`, `time_coverage_start`,
`time_coverage_end`, `date_created`, per-cell `DecTime` and `LeadTime`. Nominal
slot time and radiometer acquisition time are distinct. The converter calculates
per-cell display time as nominal slot plus `DecTime` plus its forecast-file
lead in minutes. Its GeoJSON collection time dimension remains the nominal
product time. Its per-cell `Time` string retains only time-of-day, so it is
insufficient by itself for a UTC observation timestamp across midnight.

The example's nominal time is 09:00 UTC and coverage is 09:08:58..09:12:22 UTC.
Its `date_created` is 07:13:49 UTC, earlier than coverage. Preserve this metadata
anomaly; do not present it as a verified causal generation timeline.

Native geometry variables include `LatContour`, `LonContour`, `LatG` and
`LonG`. The converter publishes contour levels separately and also publishes
forecast cells and trajectory features. Mixed feature collections must be
partitioned by feature type, contour level and forecast lead before inference.

`NumIdCell` and `NumIdBirth` are explicitly labelled cell and birth identifiers,
with packed range 0..50000 and fill 65535. Those meanings are useful, but do not
establish global uniqueness, cross-session persistence, satellite-change
continuity or complete split/merge lineage. Local track IDs remain separate.

## Live reference service extraction

The [NWC SAF ADAGUC page](https://www.nwcsaf.org/nwcsaf-view-on-adaguc)
links the public European Weather Cloud viewer and explicitly describes the
whole-disk service as non-operational. Its `config.js` advertises:

```text
https://adaguc-balancer.saf-eumetsat-nwcsaf.s.ewcloud.host/adagucserver?DATASET=RDT_NOW&
```

Capabilities expose RDT `GetFeatureInfo` JSON and an exact-time dimension
with `nearestValue=0`. At 09:00 UTC, a fixed query near 12.95 E, 41.67 N returned
cloud movement labelled `315.0 degree` and `8.597000122070312 m s-1`.
Crucially, the returned `ObjectType` was `cell-060` and its display time was
10:10:39. The converter defines that object as a 60-minute forecast. The name
`RDT_NOW` therefore does not imply every returned object is an observation.
These values differ from the EUMETView object at that location, so they are
not evidence for a numerical conversion between the two feeds.

The viewer's public file browser can be traced without guessing directories:

```bash
curl --fail --silent --show-error --max-time 25 --max-filesize 5000000 --get \
  'https://adaguc.nwcsaf.eumetsat.ewcloud.host/autowms' \
  --data-urlencode 'request=getfiles' \
  --data-urlencode 'path=/adaguc::autowms/files/RDT-CW/NOW'
```

The listing returned 1,000 entries, named as MSG3 global GeoJSON products from
2026-09-30 to 2026-10-10, with WMS source URLs. The count does not prove complete
history. Names identify this listing as MSG3, not the user-supplied MTG v2025
visualization. Full-file download and a reliable operational feed are not yet
established. Advertised map formats are images; point JSON supplies attributes
but is not equivalent to a complete cloud-polygon acquisition.

## Reproducing native metadata extraction

Retrieve the pinned public file through GitLab's repository-files API, preserving
HTTP metadata and checksums:

```bash
curl --fail --silent --show-error --max-time 25 --max-filesize 10000000 \
 'https://gitlab.aemet.es/api/v4/projects/xcalbeta%2FADAGUC-utilities/repository/files/NWCSAF2ADAGUC%2FRDT%2Fdata%2FS_NWC_RDT-CW_MSG4_Europe-VISIR_20190827T090000Z.nc/raw?ref=8af1ecc351cc0b563ee5754d401cffb46a136337' \
 -o rdt-native-example.nc
sha256sum rdt-native-example.nc
# With the optional NetCDF command-line utilities installed:
ncdump -h rdt-native-example.nc
```

This investigation read attributes directly through the installed system
`libnetcdf.so.22` using Python ctypes; no repository/runtime dependency was added.
The local extracted metadata is `/tmp/rdt-native-metadata.json`, SHA-256
`1634eebc81b3f5ae8b16cd45c6ab767a990472ee403e84f5c1fcf1f62a2cd412`.
Raw examples remain outside the package. The native example's licence attribute
refers to EUMETSAT user policy; public source-code licensing does not itself
grant data redistribution rights.

## Remaining extraction work

### Current MTG publication identified

On 2026-10-10 the portal's public client and content endpoints established the
specific EUMETSAT publication, distinct from the MSG WFS research source:

- [Catalogue EO:EUM:DAT:1196](https://user.eumetsat.int/catalogue/EO:EUM:DAT:1196):
  Geostationary Nowcasting Rapidly Developing Thunderstorms - MTG - Europe;
  status Operational, near-real-time, start 2026-09-24, FCI, netCDF4.
- [Release announcement](https://user.eumetsat.int/news-events/news/mtg-geostationary-nowcasting-products-released):
  GEO v2025.2 processing of 10-minute imagery, with three-hourly ECMWF forecasts;
  current-cell file and separate +10, +20, +30, +40, +50, +60 minute forecasts.
- Catalogue data policy: Free and unrestricted - CC-BY-4.0. This is evidence for
  **1196**, not a retroactive licence determination for the MSG WFS or old sample.
- Europe channel `E2H-MTG-4`, multicast `224.223.224.14`, PID `610`;
  Terrestrial channel `T01-MTG-4`, multicast `232.223.222.22`.
  The advertised access action is subscription, not anonymous HTTP download.

The documented current filename example is
`S_NWC_RDT-CW_MTI1_EUR-EXT-NR_20260520T130000Z.nc`; the forecast example adds
`_010` before `.nc`. The announcement explicitly defines forecast suffixes in
minutes. Native metadata must still verify nominal time, acquisition offset and
forecast valid time; the naming convention alone is insufficient to populate
`observedAt`. Average catalogue file size (0.2 MB) is not a download-size limit.

Coverage descriptions disagree in detail: the announcement describes roughly
30–85 degrees north, while the catalogue envelope is longitude -70 to 70 and
latitude 25 to 70. Do not encode either as a precise geometry mask before native
coverage metadata is checked. Catalogue parameter labels including Lightning
do not establish point-strike availability.

The public Data Store browse endpoint returned 191 collection links with no
RDT title. A direct query for `EO:EUM:DAT:1196` returned HTTP 404, `Collection
not found`. This establishes the tested endpoint's response on this date,
not permanent unavailability or absence from all EUMETSAT delivery systems.
Software-download documentation redirects to sign-in; no login was attempted.

The portal's JavaScript advertises the public catalogue endpoint
`/catalogue/es/csw/_doc/` and CMS `/strapi`. This provided authoritative content
despite the browser-facing pages initially showing only a loading screen.
Reproduce the read-only checks with bounded requests:

```bash
curl --fail --silent --show-error --max-time 35 --max-filesize 5000000 \
 'https://user.eumetsat.int/catalogue/es/csw/_doc/EO:EUM:DAT:1196' \
 -o mtg-rdt-catalogue.json
curl --fail --silent --show-error --max-time 35 --max-filesize 5000000 --get \
 'https://user.eumetsat.int/strapi/api/news' \
 --data-urlencode 'filters[slug]=mtg-geostationary-nowcasting-products-released' \
 --data-urlencode 'populate=*' -o mtg-rdt-release.json
```

Local response checksums (SHA-256): catalogue
`b7b8b602296f1b4b3a31cf01fc6e29e8ee89a13864477683362d3747a51cab83`;
release `57e1046087b8cbeb5c6ac0aafcbd1ea3aa04143024ec81816600974509ecd1a2`.
These mutable metadata responses identify a publication, not immutable native
scientific input. Raw responses remain outside the package in `/tmp`.

### Additional public-service checks (2026-10-10)

The user-supplied [unversioned RDT description](https://www.nwcsaf.org/rdt_description)
currently identifies itself as **GEO v2021**. It confirms bulletin-like NetCDF
outputs for current cells and separate forecast leads, plus optional ASCII
completed trajectories. It points to the Document Output Format (DOF) for the
actual format definition, but supplies no native file download or field packing
table. Do not treat this unversioned URL as the current MTG contract.

There is a scientifically meaningful version difference: the v2021 page
describes cloud-top pressure as the minimum over the cell, whereas the v2025
page describes a 10-percent quantile. The map-inclusion default also changes
from 1 on the v2021 page to 0 on the v2025 page. Freeze the actual product
version and configuration when comparing historical datasets; neither a field
name nor the presence of cell objects establishes identical derivation.

The official [v2025 product description](https://www.nwcsaf.org/rdt_description_2025)
describes separate forecast products up to one hour, two possible cloud contour
levels, and optional lightning, cloud-top pressure and precipitation attributes.
These are product capabilities; they do not establish which optional fields a
particular hosted feed supplies. Its MTG discrimination description also says
MTI1 uses GOES16 statistical models and that specific tuning is foreseen. That
statement is time-sensitive and must not be presented as MTG-specific validation.

The public viewer's `apps/autowms_app.js` constructs OpenDAP links by replacing
`adagucserver` with `adagucopendap/` and appending the advertised source. For the
listed MSG3 09:00 product, this supported discovery path was checked:

```text
https://adaguc.nwcsaf.eumetsat.ewcloud.host/adagucopendap/files/RDT-CW/NOW/NOW_NWC_RDT-CW_MSG3_global-VISIR_20261010T090000Z.geojson.das
```

It returned HTTP 500 with only a `jsoncontent` basename attribute, not field
units or objects. An `.ascii` request returned HTTP 200 but a text error saying
the request was invalid; HTTP success alone is therefore insufficient for this
service. The advertised alternate `filesnew` directory also returned HTTP 500.
These checks did not establish a full-object download. They do not prove that
other public MTG publications are unavailable. Response bodies and headers were
retained locally under `/tmp/rdt-dap-*`; no error response was accepted as data.

Native MTG v2025 reference files have now been acquired and inspected; see
[the MTG native contract](rdt-mtg-native-contract.md) for verified packing,
geometry and timestamp findings. An operational v2025.2 EUR-EXT file remains
to be verified. For the existing WFS path, establish its explicit conversion from
native units and timestamps. Do not silently apply native packing/units to WFS
values: negative WFS brightness temperatures already show a transformed
representation. Keep the current research resource operationally gated until
the selected publication's contract is established.
