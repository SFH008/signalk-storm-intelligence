'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  IpmaProvider,
  parseIpmaDate,
  normalizeFrames
} = require('../lib/ipma-provider')

test('normalizes IPMA mainland radar timeline as UTC', () => {
  assert.equal(
    parseIpmaDate('2026-09-20 22:45').time,
    '2026-09-20T22:45:00.000Z'
  )

  const frames = normalizeFrames({
    Portugal: [
      { date: '2026-09-20 22:45', path: 'pcr-2026-09-20T2245.png' },
      { date: '2026-09-20 22:40', path: 'pcr-2026-09-20T2240.png' },
      { date: '2026-09-20 22:35', path: null }
    ]
  })

  assert.deepEqual(
    frames.map(frame => frame.time),
    [
      '2026-09-20T22:40:00.000Z',
      '2026-09-20T22:45:00.000Z'
    ]
  )
})

test('IPMA historical requests require an exact observation', async () => {
  const originalFetch = global.fetch

  global.fetch = async url => {
    assert.match(String(url), /imgs-radar\.json$/)

    return new Response(JSON.stringify({
      Portugal: [
        {
          date: '2026-09-20 22:45',
          path: 'pcr-2026-09-20T2245.png'
        },
        {
          date: '2026-09-20 22:40',
          path: 'pcr-2026-09-20T2240.png'
        }
      ]
    }), {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    })
  }

  try {
    const provider = new IpmaProvider()

    const latest = await provider.latest('PCR')
    assert.equal(latest.time, '2026-09-20T22:45:00.000Z')

    await assert.rejects(
      provider.tile(
        'PCR',
        { bbox3857: [0, 0, 1, 1], size: 256 },
        { epochMs: Date.parse('2026-09-20T22:42:00Z') }
      ),
      /frame not found/i
    )
  } finally {
    global.fetch = originalFetch
  }
})
