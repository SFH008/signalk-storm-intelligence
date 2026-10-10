'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { replay, readFileBounded } = require('../scripts/replay-eumetsat-rdt')

async function frame(root, name, time, data, failure) {
  const directory = path.join(root, name)
  await fs.mkdir(directory)
  const body = Buffer.from(JSON.stringify(data))
  await fs.writeFile(path.join(directory, 'response.bin'), body)
  await fs.writeFile(path.join(directory, 'acquisition.json'), JSON.stringify({
    provider: 'eumetsat', product: 'msg_fes:rdt', productTime: time,
    receivedAt: '2026-10-10T12:00:00Z', httpStatus: failure ? 503 : 200,
    contentType: 'application/json', limits: { count: 100 }, bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex'), failure
  }))
}

const empty = { type: 'FeatureCollection', features: [], numberMatched: 0, numberReturned: 0 }

test('RDT replay is deterministic, sorted and preserves unavailable versus empty status', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rdt-replay-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const input = path.join(root, 'input')
  await fs.mkdir(input)
  await frame(input, 'frame-1', '2026-10-10T09:15:00Z', empty)
  await frame(input, 'frame-2', '2026-10-10T09:00:00Z', { error: 'failure' }, 'HTTP error with untrusted details')
  const first = await replay(input, path.join(root, 'first'))
  assert.equal(first.operationallyUsable, false)
  assert.equal(first.frames[0].availability, 'unavailable')
  assert.equal(first.frames[1].availability, 'empty-or-unavailable')
  assert.ok(!JSON.stringify(first).includes('untrusted details'))
  await replay(input, path.join(root, 'second'))
  assert.deepEqual(await fs.readFile(path.join(root, 'first/replay.json')), await fs.readFile(path.join(root, 'second/replay.json')))
  await assert.rejects(replay(input, path.join(root, 'first')), /EEXIST/)
  await fs.writeFile(path.join(input, 'frame-1/response.bin'), 'tampered')
  await assert.rejects(replay(input, path.join(root, 'third')), /RDT/)
  await assert.rejects(fs.access(path.join(root, 'third')), /ENOENT/)
})

test('RDT replay rejects symlink frame directories and oversized files', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rdt-replay-bound-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const input = path.join(root, 'input')
  await fs.mkdir(input)
  await fs.symlink(root, path.join(input, 'frame-1'))
  await assert.rejects(replay(input, path.join(root, 'output')), /real frame directories/)
  const file = path.join(root, 'oversized')
  await fs.writeFile(file, '12345')
  await assert.rejects(readFileBounded(file, 4), /file limit/)
  await fs.symlink(file, path.join(root, 'linked-file'))
  await assert.rejects(readFileBounded(path.join(root, 'linked-file'), 5), /ELOOP/)
})
