'use strict'

// Offline transformation replay only: no provider acquisition or inference.
const fs = require('node:fs/promises')
const path = require('node:path')
const { constants } = require('node:fs')
const { createHash } = require('node:crypto')
const { resourceFromAcquisition } = require('../lib/eumetsat-rdt-resource')
const { exactTime } = require('../lib/eumetsat-rdt-contract')

function checksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function readFileBounded(file, limit) {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > limit) throw new Error('RDT replay input exceeds file limit or is not a regular file')
    const buffer = Buffer.alloc(stat.size + 1)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset !== stat.size) throw new Error('RDT replay input changed during read')
    return buffer.subarray(0, offset)
  } finally {
    await handle.close()
  }
}

async function replay(inputRoot, outputRoot) {
  const entries = await fs.readdir(inputRoot, { withFileTypes: true })
  const frames = entries.filter(entry => /^frame-[1-9]\d*$/.test(entry.name))
  if (!frames.length || frames.length > 64 || frames.some(entry => !entry.isDirectory())) {
    throw new Error('RDT replay requires 1..64 real frame directories')
  }
  const records = []
  let totalBytes = 0
  for (const entry of frames.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const directory = path.join(inputRoot, entry.name)
    const metadata = await readFileBounded(path.join(directory, 'acquisition.json'), 65536)
    let acquisition
    try { acquisition = JSON.parse(metadata.toString('utf8')) } catch { throw new Error('RDT replay invalid acquisition JSON') }
    const productTime = exactTime(acquisition.productTime)
    if (acquisition.provider !== 'eumetsat' || acquisition.product !== 'msg_fes:rdt') throw new Error('RDT replay wrong source')
    const record = { inputFrame: entry.name, productTime, acquisitionChecksum: checksum(metadata) }
    // Failed acquisition is unavailable even when an HTTP error body was saved.
    if (acquisition.failure) {
      if (typeof acquisition.failure !== 'string') throw new Error('RDT replay invalid failure record')
      record.availability = 'unavailable'
      record.failure = 'source-acquisition-failed'
      if (acquisition.sha256 !== undefined) {
        const body = await readFileBounded(path.join(directory, 'response.bin'), 5000000)
        totalBytes += body.length
        if (checksum(body) !== acquisition.sha256 || body.length !== acquisition.bytes) throw new Error('RDT replay failed-response checksum mismatch')
        record.sourceChecksum = checksum(body)
      }
    } else {
      const body = await readFileBounded(path.join(directory, 'response.bin'), 5000000)
      totalBytes += body.length
      record.resource = resourceFromAcquisition(body, acquisition)
      record.sourceChecksum = checksum(body)
      record.availability = record.resource.availability
    }
    if (totalBytes > 32000000) throw new Error('RDT replay exceeds total input limit')
    records.push(record)
  }
  records.sort((a, b) => a.productTime < b.productTime ? -1 : a.productTime > b.productTime ? 1 :
    a.inputFrame < b.inputFrame ? -1 : a.inputFrame > b.inputFrame ? 1 : 0)
  const code = {}
  for (const relative of ['scripts/replay-eumetsat-rdt.js', 'lib/eumetsat-rdt-resource.js', 'lib/eumetsat-rdt-contract.js']) {
    code[relative] = checksum(await fs.readFile(path.join(__dirname, '..', relative)))
  }
  const manifest = { schema: 'storm-intelligence/rdt-offline-replay/1', operationallyUsable: false,
    replayKind: 'research-transformation-only', licenceStatus: 'unverified',
    limits: { maxFrames: 64, maxMetadataBytes: 65536, maxNativeBytes: 5000000, maxTotalNativeBytes: 32000000 },
    software: { pluginVersion: require('../package.json').version, nodeVersion: process.version, codeChecksums: code },
    frames: records }
  // All inputs are validated before writing; a new directory is required.
  await fs.mkdir(outputRoot, { recursive: false })
  await fs.writeFile(path.join(outputRoot, 'replay.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  return manifest
}

if (require.main === module) {
  const [inputRoot, outputRoot, ...extra] = process.argv.slice(2)
  if (!inputRoot || !outputRoot || extra.length) {
    console.error('RDT replay usage: node scripts/replay-eumetsat-rdt.js INPUT_DIRECTORY NEW_OUTPUT_DIRECTORY')
    process.exitCode = 1
  } else replay(inputRoot, outputRoot).then(result => {
    console.log(JSON.stringify({ frames: result.frames.length, operationallyUsable: false }))
  }).catch(() => { console.error('RDT offline replay failed; check input integrity, limits and output directory'); process.exitCode = 1 })
}

module.exports = { replay, readFileBounded }
