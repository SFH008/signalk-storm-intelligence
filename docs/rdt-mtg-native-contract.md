# MTG RDT native reference-file inspection

Checked 2026-10-10 UTC. Public native MTG files have now been obtained without
email, authentication or installing the NWC SAF processing software. This
supersedes the earlier statement that no native MTG sample had been obtained.
The findings below apply to the inspected **GEO v2025 test dataset**, not yet to
an acquired GEO v2025.2 operational `EUR-EXT` file.

## Acquisition and provenance

The official [v2025.2 download page](https://www.nwcsaf.org/software-download-geo-2025-2)
links the MTG regional test dataset. Its
[test-dataset manual](https://www.nwcsaf.org/Downloads/GEO/2025.1/Documents/Scientific_Docs/NWC-CDOP3-MTG-AEMET-SW-UM-DATASET_v1.2.0.pdf)
describes reference products in `export_archive` and six MTG slots. The publicly
linked archive is:

```text
https://www.nwcsaf.org/Downloads/GEO/2025/Software/TDS/NWC-CDOP4-GEO-AEMET-SW-DATA-MTI1_DATASET_v2025.tgz
```

The archive responded HTTP 200 to HEAD, size 6,855,908,954 bytes, Last-Modified
2025-03-26 14:14:19 GMT, ETag `W/"6855908954-1742998459000"`. Byte-range reads
returned HTTP 206. Sequential, bounded requests retained a contiguous prefix
of 2,916,741,177 bytes; two timeout responses and one TLS failure retained their
partial bytes, and subsequent requests resumed at the exact received offset.
Do not confuse a partial archive with a verified complete gzip archive: its
final gzip checksum was not available. Individual complete tar members were
read using Python's streaming tar reader, checked against member byte lengths,
and hashed. No archive paths were passed to a filesystem extraction operation.

Forty-two native RDT members were extracted from `export_archive/RDT/`: current
products and six forecast leads for each of 10:00, 10:10, 10:20, 10:30, 10:40
and 10:50 UTC on 2025-02-24. Raw files remain under `/tmp`, outside the package.
This is reference data, not a current live feed or evidence of retrieval SLA.
The [reference-member manifest](rdt-mtg-reference-manifest.json) preserves all
42 member paths, byte lengths and SHA-256 checksums without bundling raw data.

| Inspected member basename | Bytes | SHA-256 |
| --- | ---: | --- |
| `S_NWC_RDT-CW_MTI1_EURMLAND-NR_20250224T104000Z.nc` | 310953 | `8c99149826ad70ddfd960eb881db8530244c832cfcf8a9d00297932a12673e25` |
| `S_NWC_RDT-CW_MTI1_EURMLAND-NR_20250224T104000Z_050.nc` | 140148 | `9c29b6f64f2cac5a8814f6e0a0807e002a02476425bde811a6a00b45dc8429d8` |
| `S_NWC_RDT-CW_MTI1_EURMLAND-NR_20250224T103000Z.nc` | 121036 | `1b3f66ac07731876325ba0f416d9aaeccc781cdd9d3fbb7c0a88b4e0113b3f4a` |

Native metadata was inspected through the locally installed system libnetcdf;
no runtime dependency was added. Globals declare CF-1.7, NWC/GEO v2025,
RDT algorithm v60, MTI1, and EURMLAND. The licence attribute says EUMETSAT user
policy. The CC BY 4.0 catalogue declaration for operational collection 1196
does not by itself establish the test archive's redistribution terms.

## Packing and geometry

Decode using each file's attributes, validating packed fill values and ranges
before scaling. The principal units match the older native example described
in [the public-evidence contract](rdt-native-field-contract.md), but packing is
not universally identical:

- `Duration`: raw integer multiplied by **30**, units seconds; the older v2018
  example used scale 1. In the populated current sample, raw 40 and 60 mean
  1200 and 1800 seconds.
- `MvtSpeed`: scale approximately 0.001, units m/s. Raw 21661 and 14951 decode
  to approximately 21.661 and 14.951 m/s.
- `MvtDirection`: degrees, `wind_to_direction`, representing cloud motion
  towards a bearing; sampled bearings are 60 and 68 degrees.
- `MvtQuality`: codes 1 high, 2 moderate, 3 low, 4 very low; fill 255.
- `BTmin` and `BTmoy`: scale approximately 0.01, offset 130, units kelvin.
- `CTPressure`: scale 10, units pascals. Its native long name still says minimum
  pressure, whereas the v2025 description says a 10-percent quantile. Preserve
  this discrepancy; it does not establish which statistic v2025.2 publishes.
- `CoolingRate`: scale approximately 0.000002, offset approximately -0.05,
  units K/s. `CRainRate`: scale approximately 0.1, units mm/h.

The populated current and +50-minute files each contain two cell records.
`LatContour` and `LonContour` have shape `[recNUM, nlevel, ncontour]` =
`[2, 2, 200]`, units degrees north/east, and fill -9999. Gravity-centre arrays
have shape `[2, 2]`; some upper-level centres are missing. Contour levels must
not become duplicate cells. Remove only explicitly identified padding; verify
ring order, closure and geometry validity before creating normalized polygons.

`ConvType` includes nonconvective, convective, inherited/forced classifications,
declassified and undefined values. `SeverityIntensity` is categorical 0–4,
not a probability. `SeverityType` distinguishes activity categories, including
lightning, icing, hail and heavy rainfall; those labels are attributes of cloud
objects, not independently observed surface hazards or point lightning strikes.

## Time and forecast separation

For the 10:30 current file, nominal time is 2025-02-24T10:30:00Z, coverage is
10:38:00–10:39:14Z, and creation is 2025-03-17T10:17:12Z. This later creation
date is consistent with reference reprocessing; it must not replace acquisition
time. The populated 10:40 current file has `LeadTime=0` and `DecTime` values
502 and 532 seconds. Native descriptions define these as lead from slot and
radiometer-to-slot gap, respectively.

The 10:40 +50 file preserves cell IDs 322 and 790 and birth IDs 295 and 760;
its `LeadTime` values are 3000 seconds and `DecTime` values are zero. Nominal
slot plus lead therefore gives 11:30 UTC as the forecast slot. Forecast
`DecTime=0` must not overwrite the source current cells' acquisition offsets.
Shared IDs across current/forecast files are useful local links, but do not
prove globally unique, persistent identities across restarts or regions.

The inspected 10:30 +10 file appends `_010` to its `nominal_product_time`,
`time_coverage_start` and `time_coverage_end` strings, for example
`2025-02-24T10:30:00Z_010`. These are not ISO-8601 timestamps. Preserve the
native strings; do not feed them into a permissive date parser or silently
strip a suffix. A version-specific decoder must validate the documented
filename lead against native `LeadTime` and explicitly derive forecast times.

## Integration consequence

We now have real MTG native inputs for contract and offline-normalization work.
The next implementation can test empty and populated products, optional contour
levels, packed missing data, per-cell acquisition offsets, forecasts and ID
links. It must retain this source's test-region/version provenance. Operational
enablement still requires verifying an actual v2025.2 `EUR-EXT` product and its
delivery setup; a public test archive is not a substitute for that feed.
