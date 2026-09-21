'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  NoaProvider,
  PRODUCTS,
  normalizeTimestamps
} = require('../lib/noa-provider')

test('NOA product metadata and timestamp normalization', () => {
  assert.deepEqual(PRODUCTS.RAIN_RATE.bounds, [
    22.4706, 36.9888, 25.2987, 39.0912
  ])
  assert.equal(PRODUCTS.RAIN_RATE.units, 'mm/h')
  assert.equal(PRODUCTS.RAIN_RATE.raw, false)

  assert.equal(PRODUCTS.ACC1H.units, 'mm')
  assert.equal(PRODUCTS.ACC1H.raw, false)

  assert.deepEqual(
    normalizeTimestamps([
      1789552808,
      '1789543634',
      1789552808,
      null,
      'bad'
    ]),
    [1789543634, 1789552808]
  )
})

test('NOA falls back from empty live catalogue to newest XPOL archive', async () => {
  const provider = new NoaProvider({
    baseUrl: 'https://example.invalid'
  })

  provider.getJson = async path => {
    if (path === '/data/XPol/timestamp.json') return []

    if (
      path ===
      '/data/database/2026/0916/1012/XPol/timestamp.json'
    ) {
      return [1789552808]
    }

    throw new Error(`unexpected JSON path ${path}`)
  }

  provider.listDirectory = async path => {
    const values = {
      '/data/database/': ['2026'],
      '/data/database/2026/': ['0921', '0916'],
      '/data/database/2026/0921/': ['1012'],
      '/data/database/2026/0921/1012/': ['lightning'],
      '/data/database/2026/0916/': ['1012'],
      '/data/database/2026/0916/1012/': ['XPol']
    }

    return values[path] || []
  }

  const latest = await provider.latest('RAIN_RATE')

  assert.equal(latest.epochMs, 1789552808000)
  assert.equal(latest.time, '2026-09-16T10:00:08.000Z')
  assert.equal(latest.source, 'noa')

  const source = await provider.frameSource()

  assert.equal(
    source.path,
    '/data/database/2026/0916/1012/XPol/'
  )
})
