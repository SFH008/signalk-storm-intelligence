'use strict'

const proj4 = require('proj4')
const { createHash } = require('node:crypto')

const DEFAULTS = Object.freeze({
  vmiGridWidth: 600,
  vmiGridHeight: 700,
  vmiMaxInputPixels: 4000000,
  vmiMaxRawBytes: 33554432
})

function normalizeSettings(settings = {}) {
  const ranges = { vmiGridWidth: [32, 1600], vmiGridHeight: [32, 1600],
    vmiMaxInputPixels: [1, 16000000], vmiMaxRawBytes: [1024, 134217728] }
  return Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => {
    const number = settings[key] == null ? NaN : Number(settings[key])
    const [min, max] = ranges[key]
    return [key, Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : value]
  }))
}

function sourceProjection(keys) {
  // DPC's documented native VMI grid: WGS84 custom Transverse Mercator.
  if (keys.GTModelTypeGeoKey !== 1 || keys.GeographicTypeGeoKey !== 4326 ||
      keys.ProjCoordTransGeoKey !== 1 || keys.ProjLinearUnitsGeoKey !== 9001 ||
      keys.ProjNatOriginLongGeoKey !== 12.5 || keys.ProjNatOriginLatGeoKey !== 42 ||
      (keys.ProjScaleAtNatOriginGeoKey ?? 1) !== 1 ||
      (keys.ProjFalseEastingGeoKey ?? 0) !== 0 ||
      (keys.ProjFalseNorthingGeoKey ?? 0) !== 0) {
    throw new TypeError('Unsupported Radar-DPC VMI projection')
  }
  return '+proj=tmerc +lat_0=42 +lon_0=12.5 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'
}

function geographicBounds(transform, origin, resolution, width, height) {
  const points = []
  // Include curved edge extrema, not just the four projected corners.
  for (let step = 0; step <= 128; step++) {
    const x = width * step / 128, y = height * step / 128
    for (const [col, row] of [[x, 0], [x, height], [0, y], [width, y]]) {
      points.push(transform.inverse([origin[0] + col * resolution[0], origin[1] + row * resolution[1]]))
    }
  }
  const bounds = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]
  if (!bounds.every(Number.isFinite) || bounds[0] < -180 || bounds[2] > 180 ||
      bounds[1] < -90 || bounds[3] > 90 || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) {
    throw new TypeError('Invalid Radar-DPC VMI geographic bounds')
  }
  return bounds
}

async function normalizeDpcVmi(buffer, options = {}) {
  const settings = normalizeSettings(options)
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > settings.vmiMaxRawBytes) {
    throw new TypeError('Bounded Radar-DPC VMI GeoTIFF buffer is required')
  }
  const observedAt = options.observedAt
  if (observedAt == null || !Number.isFinite(new Date(observedAt).getTime())) {
    throw new TypeError('Radar-DPC VMI observation time is required')
  }
  const { fromArrayBuffer } = await import('geotiff')
  const tiff = await fromArrayBuffer(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
  const image = await tiff.getImage()
  const width = image.getWidth(), height = image.getHeight()
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width * height > settings.vmiMaxInputPixels || image.getSamplesPerPixel() !== 1) {
    throw new TypeError('Invalid or oversized Radar-DPC VMI raster')
  }
  const directory = image.fileDirectory
  if (directory.hasTag('ModelTransformation') ||
      (directory.hasTag('Orientation') && directory.getValue('Orientation') !== 1) ||
      directory.getValue('SampleFormat')?.[0] !== 3 || directory.getValue('BitsPerSample')?.[0] !== 32) {
    throw new TypeError('Radar-DPC VMI requires north-up Float32 samples')
  }
  const offsetTag = directory.hasTag('TileOffsets') ? 'TileOffsets' : 'StripOffsets'
  const countTag = offsetTag === 'TileOffsets' ? 'TileByteCounts' : 'StripByteCounts'
  const offsets = await directory.loadValue(offsetTag)
  const byteCounts = await directory.loadValue(countTag)
  if (!offsets || !byteCounts || offsets.length !== byteCounts.length || !offsets.length ||
      Array.from(offsets).some((offset, index) => !Number.isSafeInteger(offset) || offset < 0 ||
        !Number.isSafeInteger(byteCounts[index]) || byteCounts[index] <= 0 ||
        offset + byteCounts[index] > buffer.length)) {
    throw new TypeError('Invalid or truncated Radar-DPC VMI TIFF blocks')
  }
  const keys = image.getGeoKeys()
  if (keys.GTRasterTypeGeoKey !== 1) throw new TypeError('Radar-DPC VMI requires pixel-area georeferencing')
  const crs = sourceProjection(keys)
  const transform = proj4('EPSG:4326', crs)
  const origin = image.getOrigin(), resolution = image.getResolution()
  if (![...origin, ...resolution].every(Number.isFinite) || resolution[0] <= 0 || resolution[1] >= 0) {
    throw new TypeError('Invalid Radar-DPC VMI raster transform')
  }
  const bounds = geographicBounds(transform, origin, resolution, width, height)
  const raster = (await image.readRasters({ samples: [0] }))[0]
  if (!(raster instanceof Float32Array) || raster.length !== width * height) {
    throw new TypeError('Invalid Radar-DPC VMI decoded samples')
  }
  const noData = image.getGDALNoData()
  const outWidth = settings.vmiGridWidth, outHeight = settings.vmiGridHeight
  const values = new Float32Array(outWidth * outHeight)
  values.fill(NaN)
  let physicalPixels = 0
  for (let y = 0; y < outHeight; y++) {
    const latitude = bounds[3] - (y + 0.5) * (bounds[3] - bounds[1]) / outHeight
    for (let x = 0; x < outWidth; x++) {
      const longitude = bounds[0] + (x + 0.5) * (bounds[2] - bounds[0]) / outWidth
      const point = transform.forward([longitude, latitude])
      const col = Math.floor((point[0] - origin[0]) / resolution[0])
      const row = Math.floor((point[1] - origin[1]) / resolution[1])
      if (col < 0 || col >= width || row < 0 || row >= height) continue
      const value = raster[row * width + col]
      // Undocumented sentinel codes (including -9998/-9999) remain unknown,
      // never zero rainfall or motion background. No interpolation across gaps.
      if (!Number.isFinite(value) || (noData != null && value === noData) || value < -20 || value > 80) continue
      values[y * outWidth + x] = value
      physicalPixels++
    }
  }
  return {
    schema: 'storm-normalized-evidence/1', domain: 'radar', quantity: 'reflectivity', units: 'dBZ',
    observedAt: new Date(observedAt).toISOString(), width: outWidth, height: outHeight, bounds, values,
    motionBackgroundMask: new Uint8Array(values.length),
    valueSemantics: { representation: 'measurement', derivation: 'resampled',
      sourceQuantity: 'reflectivity', sourceUnits: 'dBZ', conversion: null },
    availability: { available: physicalPixels > 0, physicalPixels,
      unavailablePixels: values.length - physicalPixels, totalPixels: values.length },
    provenance: { provider: 'radar-dpc', product: 'VMI', method: 'dpc-vmi-geotiff-v1',
      representation: 'native-reflectivity-nearest-neighbour', sourceCrs: crs,
      sourceWidth: width, sourceHeight: height, sourceOrigin: origin, sourceResolution: resolution,
      sourceChecksum: createHash('sha256').update(buffer).digest('hex'),
      normalizationSettings: settings, attribution: 'Radar-DPC - Dipartimento della Protezione Civile',
      license: 'CC-BY-SA', noDataPolicy: 'non-finite, explicit nodata and outside -20..80 dBZ remain unknown' }
  }
}

module.exports = { DEFAULTS, normalizeSettings, normalizeDpcVmi, sourceProjection }
