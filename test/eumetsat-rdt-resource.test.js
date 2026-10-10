'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { resourceFromAcquisition } = require('../lib/eumetsat-rdt-resource')

function input() {
  const data = { type: 'FeatureCollection', numberMatched: 1, numberReturned: 1,
    crs: { properties: { name: 'urn:ogc:def:crs:EPSG::4326' } }, features: [{
      type: 'Feature', id: 'synthetic.1', properties: { time: '2026-10-10T09:00:00Z',
        MvtSpeed: 26, MvtDirecti: 324, DTtropoOT: -9999, PhaseLife: 'Growing' },
      geometry: { type: 'MultiPolygon', coordinates: [[[[10, 40], [11, 40], [11, 41], [10, 40]]]] }
    }] }
  return data
}
function record(data) {
  const body = Buffer.from(JSON.stringify(data))
  return { body, acquisition: { provider: 'eumetsat', product: 'msg_fes:rdt',
    httpStatus: 200, contentType: 'application/json', bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex'), limits: { count: 100 },
    productTime: '2026-10-10T09:00:00Z', receivedAt: '2026-10-10T11:00:00Z' } }
}
function normalize(data) {
  const { body, acquisition } = record(data)
  return resourceFromAcquisition(body, acquisition)
}

test('RDT research resource retains geometry, sentinel and uninterpreted native values', () => {
  const data = input()
  const before = JSON.stringify(data)
  const result = normalize(data)
  assert.equal(JSON.stringify(data), before)
  assert.equal(result.operationallyUsable, false)
  assert.equal(result.timeSemantics, 'unverified-published-product-time')
  assert.deepEqual(result.objects[0].geometry, data.features[0].geometry)
  assert.equal(result.objects[0].nativeAttributes.DTtropoOT, -9999)
  assert.equal(result.objects[0].nativeAttributes.MvtSpeed, 26)
  assert.equal(result.objects[0].sourceFeatureId, 'synthetic.1')
  assert.equal(result.objects[0].motion, undefined)
  assert.equal(result.observedAt, undefined)
  assert.equal(result.objects[0].trackId, undefined)
  assert.equal(result.provenance.sourceChecksum.length, 64)
})

test('RDT research normalization rejects mismatched provenance and malformed native fields', () => {
  const { body, acquisition } = record(input())
  for (const override of [{ sha256: '0'.repeat(64) }, { failure: 'HTTP failure' },
    { receivedAt: '2026-10-10' }, { httpStatus: 503 }, { productTime: '2026-10-10T09:15:00Z' }]) {
    assert.throws(() => resourceFromAcquisition(body, { ...acquisition, ...override }), /RDT/)
  }
  for (const value of ['26', {}, true]) {
    const data = input()
    data.features[0].properties.MvtSpeed = value
    assert.throws(() => normalize(data), /MvtSpeed/)
  }
  const data = input()
  data.features[0].properties.PhaseLife = 1
  assert.throws(() => normalize(data), /PhaseLife/)
})

test('RDT empty resource remains empty-or-unavailable; missing and null attributes stay distinct', () => {
  const data = input()
  data.features[0].properties.MvtSpeed = null
  delete data.features[0].properties.MvtDirecti
  const result = normalize(data)
  assert.equal(result.objects[0].nativeAttributes.MvtSpeed, null)
  assert.equal(Object.hasOwn(result.objects[0].nativeAttributes, 'MvtDirecti'), false)
  assert.equal(normalize({ type: 'FeatureCollection', features: [], numberMatched: 0,
    numberReturned: 0 }).availability, 'empty-or-unavailable')
})
