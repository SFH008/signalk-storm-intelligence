'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { exactTime, buildRequest, inspectResponse, readBounded, acquire } = require('../scripts/live-check-eumetsat-rdt')

const time = '2026-10-10T09:00:00Z'
// Synthetic contract data, not redistributed upstream meteorological data.
function collection() {
  return { type: 'FeatureCollection', numberMatched: 1, numberReturned: 1,
    crs: { properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
    features: [{ type: 'Feature', id: 'synthetic.1', properties: { time, MvtSpeed: -9999 },
      geometry: { type: 'MultiPolygon', coordinates: [[[[10, 40], [11, 40], [11, 41], [10, 40]]]] } }] }
}
function inspect(data, overrides = {}) {
  return inspectResponse({ status: 200, contentType: 'application/json;charset=UTF-8',
    body: Buffer.from(JSON.stringify(data)), time, ...overrides })
}

function response(body, status = 200) {
  return { status, headers: { get: name => name === 'content-type' ? 'application/json' : null },
    body: (async function * () { yield Buffer.from(body) })() }
}

test('RDT request requires exact valid UTC and fixed non-vessel bounds', () => {
  const url = new URL(buildRequest(time))
  assert.equal(url.searchParams.get('CQL_FILTER'), `time = '${time}' AND BBOX(the_geom,7,36,16.5,45,'EPSG:4326')`)
  assert.equal(exactTime(time), '2026-10-10T09:00:00.000Z')
  for (const invalid of ['2026-02-30T09:00:00Z', '2026-10-10', '2026-10-10T09:00:00+00:00', "x' OR 1=1"]) {
    assert.throws(() => buildRequest(invalid), /UTC/)
  }
  assert.throws(() => buildRequest(time, 10001), /count/)
})

test('RDT complete frame preserves time without interpreting motion or freshness', () => {
  const data = collection()
  const before = JSON.stringify(data)
  assert.equal(inspect(data).productTime, exactTime(time))
  assert.equal(inspect(data).status, 'complete')
  assert.equal(JSON.stringify(data), before)
  const empty = inspect({ type: 'FeatureCollection', features: [], numberMatched: 0, numberReturned: 0 })
  assert.equal(empty.status, 'empty-or-unavailable')
})

test('RDT rejects HTTP, MIME, JSON, truncation, substituted times and malformed geometry', () => {
  assert.throws(() => inspect(collection(), { status: 503 }), /HTTP 503/)
  assert.throws(() => inspect(collection(), { contentType: 'text/html' }), /content type/)
  assert.throws(() => inspect(collection(), { body: Buffer.from('<html>') }), /malformed JSON/)
  for (const mutate of [
    data => { data.numberMatched = 2 },
    data => { data.numberReturned = 2 },
    data => { data.features[0].properties.time = '2026-10-10T09:15:00Z' },
    data => { data.features[0].properties.time = '2026-10-10T08:45:00Z' },
    data => { data.features[0].geometry.coordinates[0][0][0] = [200, 40] },
    data => { data.features[0].geometry.coordinates[0][0].pop() },
    data => { data.features[0].geometry.coordinates[0][0][3] = [12, 40] },
    data => { data.crs.properties.name = 'EPSG:3857' },
    data => { data.features.push(data.features[0]); data.numberMatched = data.numberReturned = 2 }
  ]) {
    const data = collection()
    mutate(data)
    assert.throws(() => inspect(data), /RDT/)
  }
})

test('RDT bounds streamed bytes', async () => {
  const response = { body: (async function * () { yield Buffer.from('abc'); yield Buffer.from('def') })() }
  await assert.rejects(readBounded(response, 5), /byte limit/)
})

test('RDT archives unchanged bodies and metadata; refuses overwrite; retains service failures', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rdt-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const body = JSON.stringify(collection())
  const fetchImpl = async () => response(body)
  const directory = path.join(root, 'success')
  const record = await acquire(time, directory, { fetchImpl })
  assert.equal(record.inspection.status, 'complete')
  assert.equal(await fs.readFile(path.join(directory, 'response.bin'), 'utf8'), body)
  assert.equal(record.sha256.length, 64)
  assert.ok(!JSON.stringify(record).includes('private-cookie'))
  await assert.rejects(acquire(time, directory, { fetchImpl }), /EEXIST/)
  const failed = await acquire(time, path.join(root, 'failed'), {
    fetchImpl: async () => response('<html>unavailable</html>', 503)
  })
  assert.equal(failed.failure, 'RDT HTTP 503')
  assert.equal(await fs.readFile(path.join(root, 'failed', 'response.bin'), 'utf8'), '<html>unavailable</html>')
})

test('RDT transport failure, byte limit and timeout produce explicit unavailable records', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rdt-failure-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const failure = await acquire(time, path.join(root, 'transport'), {
    fetchImpl: async () => { throw new Error('sensitive transport details') }
  })
  assert.equal(failure.failure, 'RDT acquisition failed')
  assert.ok(!JSON.stringify(failure).includes('sensitive'))
  const oversized = await acquire(time, path.join(root, 'oversized'), {
    maxBytes: 2, fetchImpl: async () => response('abc')
  })
  assert.equal(oversized.failure, 'RDT response exceeds byte limit')
  await assert.rejects(fs.access(path.join(root, 'oversized', 'response.bin')), /ENOENT/)
  const timeout = await acquire(time, path.join(root, 'timeout'), {
    timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error) })
    })
  })
  assert.equal(timeout.failure, 'RDT request timed out')
  await assert.rejects(acquire(time, path.join(root, 'invalid'), { timeoutMs: 0 }), /transport limits/)
})
