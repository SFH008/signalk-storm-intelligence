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
  assert.equal(PRODUCTS.RAIN_RATE.raw, true)

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


test('NOA downloads exact native RAIN_RATE frame', async () => {
  const provider = new NoaProvider({
    baseUrl: 'https://example.invalid'
  })

  provider.frames = async () => [
    {
      timestamp: 1790188434,
      epochMs: 1790188434000,
      time: '2026-09-23T18:33:54.000Z',
      path: '/data/database/2026/0923/1820/XPol/'
    },
    {
      timestamp: 1790188545,
      epochMs: 1790188545000,
      time: '2026-09-23T18:35:45.000Z',
      path: '/data/database/2026/0923/1820/XPol/'
    }
  ]

  const originalFetch = global.fetch
  let requestedUrl = null

  global.fetch = async url => {
    requestedUrl = String(url)

    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name.toLowerCase() === 'content-type'
            ? 'image/png'
            : null
        }
      },
      async arrayBuffer() {
        return Uint8Array.from([
          0x89, 0x50, 0x4e, 0x47,
          0x0d, 0x0a, 0x1a, 0x0a
        ]).buffer
      }
    }
  }

  try {
    assert.equal(provider.rawExtension('RAIN_RATE'), '.png')

    const raw = await provider.downloadRaw(
      'RAIN_RATE',
      1790188545000
    )

    assert.equal(
      requestedUrl,
      'https://example.invalid/data/database/2026/0923/1820/XPol/XPol_R_1790188545.png'
    )

    assert.equal(raw.key, 'XPol_R_1790188545.png')
    assert.equal(raw.epochMs, 1790188545000)
    assert.equal(raw.time, '2026-09-23T18:35:45.000Z')
    assert.equal(raw.buffer.length, 8)

    await assert.rejects(
      provider.downloadRaw('RAIN_RATE', 123),
      /frame not found/
    )

    assert.throws(
      () => provider.rawExtension('ACC1H'),
      /Unsupported NOA raw product/
    )
  } finally {
    global.fetch = originalFetch
  }
})
