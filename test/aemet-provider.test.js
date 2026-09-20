'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const zlib = require('node:zlib')
const tar = require('tar-stream')

const {
  parseAemetFilename,
  extractArchiveMembers,
  selectArchiveFrame
} = require('../lib/aemet-provider')

function makeArchive(files) {
  return new Promise((resolve, reject) => {
    const pack = tar.pack()
    const chunks = []

    pack.on('data', chunk => chunks.push(chunk))
    pack.on('error', reject)
    pack.on('end', () => resolve(zlib.gzipSync(Buffer.concat(chunks))))

    for (const [name, body] of files) pack.entry({ name }, body)
    pack.finalize()
  })
}

test('normalizes AEMET regional filenames', () => {
  const cases = [
    ['down_CLG260920163000.PPI.Z_005_240.tif', 'PPI', '2026-09-20T16:30:00.000Z'],
    ['down_CLG260920163000.TOP.12DBZ_240.tif', 'TOP', '2026-09-20T16:30:00.000Z'],
    ['down_CLG260920140000.RN1.1HR_CAPPI.tif', 'RN1', '2026-09-20T14:00:00.000Z'],
    ['down_CLG260920120000.RNN.6HR_CAPPI.tif', 'RNN', '2026-09-20T12:00:00.000Z']
  ]

  for (const [name, product, time] of cases) {
    const frame = parseAemetFilename(name)
    assert.equal(frame.radar, 'CLG')
    assert.equal(frame.product, product)
    assert.equal(frame.time, time)
  }
})

test('selects newest matching radar/product from combined archive', async () => {
  const archive = await makeArchive([
    ['down_CLG260920163000.PPI.Z_005_240.tif', Buffer.from('old')],
    ['down_CLG260920165000.PPI.Z_005_240.tif', Buffer.from('new')],
    ['down_CLG260920165000.TOP.12DBZ_240.tif', Buffer.from('top')],
    ['down_TJV260920170000.PPI.Z_005_240.tif', Buffer.from('other')]
  ])

  const selected = selectArchiveFrame(
    await extractArchiveMembers(archive),
    { radar: 'CLG', product: 'PPI' }
  )

  assert.equal(selected.time, '2026-09-20T16:50:00.000Z')
  assert.equal(selected.buffer.toString(), 'new')
})

test('historical selection returns exact requested observation', async () => {
  const archive = await makeArchive([
    ['down_CLG260920163000.PPI.Z_005_240.tif', Buffer.from('requested')],
    ['down_CLG260920165000.PPI.Z_005_240.tif', Buffer.from('newest')]
  ])

  const selected = selectArchiveFrame(
    await extractArchiveMembers(archive),
    {
      radar: 'CLG',
      product: 'PPI',
      epochMs: Date.parse('2026-09-20T16:30:00Z')
    }
  )

  assert.equal(selected.buffer.toString(), 'requested')
})

test('missing historical observation fails instead of substituting latest', async () => {
  const archive = await makeArchive([
    ['down_CLG260920165000.PPI.Z_005_240.tif', Buffer.from('latest')]
  ])

  const members = await extractArchiveMembers(archive)

  assert.throws(
    () => selectArchiveFrame(members, {
      radar: 'CLG',
      product: 'PPI',
      epochMs: Date.parse('2026-09-20T16:30:00Z')
    }),
    /not found/i
  )
})
