'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  EumetsatProvider,
  EUMETSAT_PRODUCTS,
  parseLayerTimes,
  selectObservationEpoch,
  bbox3857To4326
} = require('../lib/eumetsat-provider')

test('EUMETSAT exposes MTG Geo Colour raster product', () => {
  assert.equal(
    EUMETSAT_PRODUCTS.MTG_GEOCOLOR.layer,
    'mtg_fd:rgb_geocolour'
  )
  assert.equal(EUMETSAT_PRODUCTS.MTG_GEOCOLOR.kind, 'raster')
  assert.equal(EUMETSAT_PRODUCTS.MTG_GEOCOLOR.period, 'PT10M')
  assert.equal(EUMETSAT_PRODUCTS.MTG_GEOCOLOR.raw, false)
  assert.equal(EUMETSAT_PRODUCTS.MTG_GEOCOLOR.cells, false)
})

test('parseLayerTimes reads only requested EUMETView layer', () => {
  const xml = `
    <WMS_Capabilities>
      <Layer>
        <Name>other:layer</Name>
        <Dimension name="time">2026-09-22T16:00:00Z/2026-09-22T17:00:00Z/PT5M</Dimension>
      </Layer>
      <Layer>
        <Name>mtg_fd:rgb_geocolour</Name>
        <Dimension name="time" default="2026-09-22T16:50:00Z">
          2026-09-22T16:20:00.000Z/2026-09-22T16:50:00.000Z/PT10M
        </Dimension>
      </Layer>
    </WMS_Capabilities>
  `

  const times = parseLayerTimes(xml, 'mtg_fd:rgb_geocolour')

  assert.deepEqual(
    times.map(t => new Date(t).toISOString()),
    [
      '2026-09-22T16:20:00.000Z',
      '2026-09-22T16:30:00.000Z',
      '2026-09-22T16:40:00.000Z',
      '2026-09-22T16:50:00.000Z'
    ]
  )
})

test('long EUMETView time ranges retain newest observations', () => {
  const xml = `
    <Layer>
      <Name>mtg_fd:rgb_geocolour</Name>
      <Dimension name="time">
        2024-09-23T00:00:00.000Z/2026-09-22T16:50:00.000Z/PT10M
      </Dimension>
    </Layer>
  `

  const times = parseLayerTimes(xml, 'mtg_fd:rgb_geocolour')

  assert.ok(times.length <= 4096)
  assert.equal(
    new Date(times.at(-1)).toISOString(),
    '2026-09-22T16:50:00.000Z'
  )
})

test('selectObservationEpoch does not select later future frame', () => {
  const epochs = [
    Date.parse('2026-09-22T16:40:00Z'),
    Date.parse('2026-09-22T16:50:00Z'),
    Date.parse('2026-09-22T17:00:00Z')
  ]

  assert.equal(
    selectObservationEpoch(
      epochs,
      Date.parse('2026-09-22T16:51:00Z')
    ),
    Date.parse('2026-09-22T16:50:00Z')
  )
})

test('bbox3857To4326 converts Web Mercator bbox to lon/lat', () => {
  const b = bbox3857To4326([
    -1113194.9079327357,
    4865942.279503176,
    0,
    5621521.486192066
  ])

  assert.ok(Math.abs(b[0] - (-10)) < 0.000001)
  assert.ok(Math.abs(b[1] - 40) < 0.000001)
  assert.ok(Math.abs(b[2] - 0) < 0.000001)
  assert.ok(Math.abs(b[3] - 45) < 0.000001)
})

test('EUMETSAT WMS URL uses Geo Colour and explicit observation time', () => {
  const p = new EumetsatProvider({
    wmsBase: 'https://view.eumetsat.int/geoserver/wms'
  })

  const url = new URL(
    p.wmsUrl(
      'MTG_GEOCOLOR',
      [-10, 35, 0, 45],
      '2026-09-22T16:50:00.000Z'
    )
  )

  assert.equal(url.searchParams.get('service'), 'WMS')
  assert.equal(url.searchParams.get('version'), '1.1.1')
  assert.equal(url.searchParams.get('request'), 'GetMap')
  assert.equal(url.searchParams.get('layers'), 'mtg_fd:rgb_geocolour')
  assert.equal(url.searchParams.get('srs'), 'EPSG:4326')
  assert.equal(url.searchParams.get('bbox'), '-10,35,0,45')
  assert.equal(url.searchParams.get('time'), '2026-09-22T16:50:00.000Z')
})
