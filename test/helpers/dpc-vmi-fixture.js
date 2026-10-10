'use strict'

async function dpcVmiFixture(options = {}) {
  const { writeArrayBuffer } = await import('geotiff')
  const width = options.width || 32, height = options.height || 32
  const values = options.values || Float32Array.from({ length: width * height }, (_, index) => {
    const x = index % width, y = Math.floor(index / width)
    return x >= 10 && x < 20 && y >= 10 && y < 20 ? 40 : 10
  })
  const keys = { GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, GeographicTypeGeoKey: 4326,
    ProjCoordTransGeoKey: 1, ProjLinearUnitsGeoKey: 9001,
    ProjNatOriginLongGeoKey: 12.5, ProjNatOriginLatGeoKey: 42, ...options.metadata }
  const directory = [1, 1, 0, 7,
    1024, 0, 1, keys.GTModelTypeGeoKey,
    1025, 0, 1, keys.GTRasterTypeGeoKey,
    2048, 0, 1, keys.GeographicTypeGeoKey,
    3075, 0, 1, keys.ProjCoordTransGeoKey,
    3076, 0, 1, keys.ProjLinearUnitsGeoKey,
    3080, 34736, 1, 0, 3081, 34736, 1, 1]
  return Buffer.from(writeArrayBuffer(values, {
    width, height, BitsPerSample: [32], SampleFormat: [3],
    GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, GeographicTypeGeoKey: 4326,
    ProjCoordTransGeoKey: 1, ProjLinearUnitsGeoKey: 9001,
    ProjNatOriginLongGeoKey: 12.5, ProjNatOriginLatGeoKey: 42,
    ModelPixelScale: [1000, 1000, 0], ModelTiepoint: [0, 0, 0, -16000, 16000, 0],
    ...options.metadata,
    GeoKeyDirectory: directory, GeoDoubleParams: [keys.ProjNatOriginLongGeoKey, keys.ProjNatOriginLatGeoKey]
  }))
}

module.exports = { dpcVmiFixture }
