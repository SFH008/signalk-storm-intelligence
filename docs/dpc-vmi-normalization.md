# DPC VMI normalization for Storm Runtime V3

`radar-dpc:VMI` is an optional normalized reflectivity source for the same provider-neutral V3 runtime used by AEMET COMPO and IPMA PCR. It does not use HRD polygons as detections. Existing HRD acquisition and legacy tracking remain available without automatic migration.

## Upstream contract and time

The [official DPC product documentation](https://dpc-radar.readthedocs.io/it/latest/) defines VMI as the maximum reflectivity along the vertical column, in dBZ, at five-minute cadence. It is a composite derived by the provider, not a surface-rain-rate measurement or a calibrated storm probability. The [native download documentation](https://dpc-radar.readthedocs.io/it/latest/clientwss.html) describes a single-band Float32 GeoTIFF, LZW compression, WGS84 custom Transverse Mercator projection centred at longitude 12.5°, latitude 42°, scale 1, zero false easting/northing, metre units, 1000 m pixels and a 1200 × 1400 grid. Upstream behavior is time-sensitive; inspected on 2026-10-10.

Observation time comes from the REST product timestamp, in epoch milliseconds, and becomes UTC `observedAt`. TIFF `DateTime`, product-generation metadata and filenames never replace the observation time. Exact downloads request the selected timestamp; unavailable frames fail without substitution. Signed download URLs are temporary transport credentials and are not part of normalized provenance.

## Spatial normalization and missing data

The provider decodes floating-point samples with the JavaScript `geotiff` dependency, loaded only when normalization is needed. It requires the documented CRS, Float32 band, north-up pixel-area georeferencing and bounded dimensions. Unsupported layouts and out-of-buffer TIFF block extents fail closed. The inspected live files emitted decoder warnings about missing LZW end markers in several strips; decoding completed. These warnings remain visible and are a source-format limitation, not evidence of meteorological quality.

A geographic envelope is obtained from 129 samples on each native grid edge. The native grid is then sampled at normalized geographic pixel centres with nearest-neighbour reprojection using `proj4`. Defaults are 600 × 700 output pixels. This creates a regular longitude/latitude field compatible with V3 geometry and motion semantics; treating the projected raster as a geographic rectangle directly would displace detections. Envelope coverage is only a selection approximation, not evidence of working radars at every location. Reprojection changes resolution and may omit small native features; it is not an accuracy improvement.

Finite samples from −20 through 80 dBZ retain their dBZ value. Explicit TIFF no-data, non-finite samples, samples outside that supported range and locations outside the native footprint become `NaN`. The inspected live raster contained −9998 and −9999 without a TIFF no-data tag. Their distinct upstream meanings were not established: both remain unknown rather than being assumed zero return. The normalized motion-background mask is all zero. Sparse supported returns may therefore leave motion or forecasts unavailable; zero or stationary motion must not be fabricated.

## Operational behavior and reproducibility

VMI advertises normalized V3 capability and storm-candidate support. All radar normalizers belong to provider implementations through `normalizeRadarEvidence(product, buffer, frame)`. The core operates on the resulting normalized evidence; failed V3 normalization cannot enter legacy inference.

Provider-native TIFF bytes are archived unchanged under `radar-dpc--VMI`. Normalized provenance records SHA-256 of the source, source CRS/origin/resolution/dimensions, normalization method `dpc-vmi-geotiff-v1`, output dimensions and resource limits. Freeze these settings, the native bytes/checksum, selected-source timeline, observation timestamps, normalization revision, dependency/runtime versions and V3 settings for replay. Normalization and replay do not contact a provider.

No API key is required for the current open endpoint. Requests retain finite timeouts and download/raster limits. DPC warns that network coverage and product quality can vary, including during radar maintenance. Attribution is **Radar-DPC — Dipartimento della Protezione Civile**. The official documentation specifies **CC-BY-SA**, including attribution and share-alike for derived works; local caching does not remove those conditions.

## Verification

Deterministic synthetic GeoTIFF tests cover georeferencing, physical values, checksums, no-data, input bounds, unsupported projection/layout, capability discovery, native archive preservation and generic V3 integration. These tests establish runtime behavior, not meteorological skill.

Run the explicit network check separately:

```bash
npm run live-check:dpc-vmi
```

It downloads the latest VMI and its exact five-minute predecessor and passes both through normalization, hazard decomposition and Storm Runtime V3. Its output includes frame times, age, checksums, availability and hazard counts. A missing predecessor fails rather than being silently replaced. This does not deploy or change plugin settings.
