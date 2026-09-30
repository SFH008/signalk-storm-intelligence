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

test('IPMA timeline is cached across repeated frame requests', async () => {
  const originalFetch = global.fetch
  let requests = 0

  global.fetch = async url => {
    requests++

    assert.match(String(url), /imgs-radar\.json$/)

    return new Response(JSON.stringify({
      Portugal: [
        {
          date: '2026-09-20 22:45',
          path: 'pcr-2026-09-20T2245.png'
        }
      ]
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  try {
    const provider = new IpmaProvider({
      timelineCacheMs: 60000
    })

    await provider.frames()
    await provider.frames()
    await provider.latest('PCR')

    assert.equal(requests, 1)
  } finally {
    global.fetch = originalFetch
  }
})

test('IPMA raw frame is cached by observation epoch', async () => {
  const originalFetch = global.fetch

  let timelineRequests = 0
  let imageRequests = 0

  global.fetch = async url => {
    const value = String(url)

    if (/imgs-radar\.json$/.test(value)) {
      timelineRequests++

      return new Response(JSON.stringify({
        Portugal: [
          {
            date: '2026-09-20 22:45',
            path: 'pcr-2026-09-20T2245.png'
          }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (/pcr-2026-09-20T2245\.png$/.test(value)) {
      imageRequests++

      return new Response(
        Buffer.from([137,80,78,71]),
        {
          status: 200,
          headers: { 'content-type': 'image/png' }
        }
      )
    }

    throw new Error(`unexpected URL ${value}`)
  }

  try {
    const provider = new IpmaProvider({
      timelineCacheMs: 60000
    })

    const epochMs =
      Date.parse('2026-09-20T22:45:00Z')

    const first =
      await provider.downloadRaw(
        'PCR',
        epochMs
      )

    const second =
      await provider.downloadRaw(
        'PCR',
        epochMs
      )

    assert.equal(
      timelineRequests,
      1
    )

    assert.equal(
      imageRequests,
      1
    )

    assert.equal(
      first.buffer,
      second.buffer
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('IPMA coalesces concurrent timeline requests', async () => {
  const originalFetch = global.fetch
  let requests = 0

  global.fetch = async url => {
    requests++

    assert.match(String(url), /imgs-radar\.json$/)

    await new Promise(resolve => setTimeout(resolve, 20))

    return new Response(JSON.stringify({
      Portugal: [
        {
          date: '2026-09-20 22:45',
          path: 'pcr-2026-09-20T2245.png'
        }
      ]
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  try {
    const provider = new IpmaProvider({
      timelineCacheMs: 60000
    })

    await Promise.all([
      provider.frames(),
      provider.frames(),
      provider.frames()
    ])

    assert.equal(requests, 1)
  } finally {
    global.fetch = originalFetch
  }
})

test('IPMA coalesces concurrent raw frame requests', async () => {
  const originalFetch = global.fetch

  let timelineRequests = 0
  let imageRequests = 0

  global.fetch = async url => {
    const value = String(url)

    if (/imgs-radar\.json$/.test(value)) {
      timelineRequests++

      return new Response(JSON.stringify({
        Portugal: [
          {
            date: '2026-09-20 22:45',
            path: 'pcr-2026-09-20T2245.png'
          }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (/pcr-2026-09-20T2245\.png$/.test(value)) {
      imageRequests++

      await new Promise(resolve => setTimeout(resolve, 20))

      return new Response(
        Buffer.from([137,80,78,71]),
        {
          status: 200,
          headers: { 'content-type': 'image/png' }
        }
      )
    }

    throw new Error(`unexpected URL ${value}`)
  }

  try {
    const provider = new IpmaProvider({
      timelineCacheMs: 60000
    })

    const epochMs =
      Date.parse('2026-09-20T22:45:00Z')

    await Promise.all([
      provider.downloadRaw('PCR', epochMs),
      provider.downloadRaw('PCR', epochMs),
      provider.downloadRaw('PCR', epochMs)
    ])

    assert.equal(timelineRequests, 1)
    assert.equal(imageRequests, 1)
  } finally {
    global.fetch = originalFetch
  }
})
