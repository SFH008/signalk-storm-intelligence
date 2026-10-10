'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeDpcVmi, normalizeSettings, DEFAULTS } = require('../lib/dpc-vmi-evidence')
const { dpcVmiFixture } = require('./helpers/dpc-vmi-fixture')
const { motionFrameFromNormalizedRadarEvidence } = require('../lib/storm-tracker-v3/radar-motion-frame')
const { buildHazardRegions } = require('../lib/storm-tracker-v3/hazard-regions')
const options = { observedAt: Date.parse('2026-10-10T09:10:00Z'), vmiGridWidth: 32, vmiGridHeight: 32 }

test('DPC VMI preserves native dBZ, observation time and checksummed provenance through reprojection', async () => {
  const raw = await dpcVmiFixture()
  const before = Buffer.from(raw)
  const field = await normalizeDpcVmi(raw, options)
  assert.deepEqual(raw, before)
  assert.equal(field.units, 'dBZ')
  assert.equal(field.observedAt, '2026-10-10T09:10:00.000Z')
  assert.equal(field.provenance.provider, 'radar-dpc')
  assert.equal(field.provenance.sourceChecksum.length, 64)
  assert.ok(field.bounds[0] < 12.5 && field.bounds[2] > 12.5)
  assert.ok(field.bounds[1] < 42 && field.bounds[3] > 42)
  assert.ok([...field.values].includes(40))
  const result = buildHazardRegions([], {field})
  assert.equal(result.regions.length, 1)
  assert.equal(result.regions[0].properties.evidence.reflectivity.maxDbz, 40)
  const motion = motionFrameFromNormalizedRadarEvidence(field)
  assert.equal(motion.values.length, 1024)
  assert.deepEqual(motion.values, field.values)
})

test('DPC sentinel, explicit no-data, nonfinite and out-of-domain samples stay unknown', async () => {
  for (const value of [-9998, -9999, NaN, Infinity, 90]) {
    const raw = await dpcVmiFixture({ values: new Float32Array(1024).fill(value) })
    const field = await normalizeDpcVmi(raw, options)
    assert.equal(field.availability.available, false)
    assert.ok([...field.values].every(Number.isNaN))
    assert.ok([...field.motionBackgroundMask].every(v => v === 0))
    assert.equal(buildHazardRegions([], {field}).regions.length, 0)
  }
  const raw = await dpcVmiFixture({ values: new Float32Array(1024).fill(10), metadata: { GDAL_NODATA: '10' } })
  assert.equal((await normalizeDpcVmi(raw, options)).availability.available, false)
})

test('DPC fails closed on missing timestamps, oversized inputs and unsupported CRS/sample semantics', async () => {
  const raw = await dpcVmiFixture()
  await assert.rejects(normalizeDpcVmi(raw), /observation time/)
  await assert.rejects(normalizeDpcVmi(Buffer.from('bad'), options))
  await assert.rejects(normalizeDpcVmi(raw.subarray(0, raw.length - 100), options))
  await assert.rejects(normalizeDpcVmi(raw, {...options,vmiMaxInputPixels:10}), /oversized/)
  await assert.rejects(normalizeDpcVmi(raw, {...options,vmiMaxRawBytes:1024}), /Bounded/)
  for (const metadata of [
    { ProjNatOriginLongGeoKey: 0 }, { GTRasterTypeGeoKey: 2 },
    { GTModelTypeGeoKey: 2 }, { SampleFormat: [1] }, { Orientation: 3 }
  ]) {
    await assert.rejects(normalizeDpcVmi(await dpcVmiFixture({metadata}), options), TypeError)
  }
})

test('DPC adapter-owned settings normalize invalid persisted limits consistently', () => {
  const adapter = require('../providers/radar-dpc')
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.equal(adapter.settingsSchema.properties[key].default, value)
    assert.equal(adapter.defaults[key], value)
  }
  const settings = normalizeSettings({vmiGridWidth:-1,vmiGridHeight:Infinity,vmiMaxInputPixels:1e9})
  assert.equal(settings.vmiGridWidth, 32)
  assert.equal(settings.vmiGridHeight, 700)
  assert.equal(settings.vmiMaxInputPixels, 16000000)
})
