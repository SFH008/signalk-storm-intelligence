'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const adapter = require('../observation-providers/eumetsat-mtg-li-afa')

test('MTG LI AFA adapter is density-only', () => {
  const p = adapter.create({
    common: { requestTimeoutMs: 10000 },
    settings: {
      wmsBase: 'https://view.eumetsat.int/geoserver/wms',
      capabilitiesCacheSeconds: 60
    }
  })

  assert.equal(p.id, 'eumetsat-mtg-li-afa')
  assert.equal(typeof p.observations, 'undefined')
  assert.equal(typeof p.densityTile, 'function')

  assert.deepEqual(p.capabilities, {
    density: true,
    map: true,
    temporal: true,
    points: false,
    quantitativeSamples: false
  })
})

test('MTG LI AFA descriptor does not claim point semantics', () => {
  const p = adapter.create({
    common: { requestTimeoutMs: 10000 },
    settings: {}
  })

  const d = p.densityDescriptor()

  assert.equal(d.kind, 'accumulated-flash-area')
  assert.equal(d.phenomenon, 'lightning')
  assert.equal(d.period, 'PT5M')
  assert.equal(d.quantitative, false)
  assert.match(d.note, /not converted into synthetic point strikes/i)
})
