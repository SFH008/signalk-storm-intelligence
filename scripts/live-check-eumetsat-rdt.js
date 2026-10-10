'use strict'

// Research acquisition only. Not registered with providers or operational inference.
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const https = require('node:https')
const { exactTime, inspectResponse } = require('../lib/eumetsat-rdt-contract')

function request(url, options) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, response => resolve({
      status: response.statusCode,
      headers: { get: name => response.headers[name] ?? null },
      body: response
    }))
    req.on('error', reject)
  })
}

function buildRequest(time, count = 100) {
  exactTime(time)
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('RDT count must be 1..10000')
  const url = new URL('https://view.eumetsat.int/geoserver/wfs')
  for (const [key, value] of Object.entries({ service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeNames: 'msg_fes:rdt', count, outputFormat: 'application/json',
    CQL_FILTER: `time = '${time}' AND BBOX(the_geom,7,36,16.5,45,'EPSG:4326')` })) url.searchParams.set(key, value)
  return url.toString()
}

async function readBounded(response, maxBytes) {
  const chunks = []
  let bytes = 0
  for await (const chunk of response.body) {
    bytes += chunk.length
    if (bytes > maxBytes) throw new Error('RDT response exceeds byte limit')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function acquire(time, directory, options = {}) {
  const { timeoutMs = 25000, maxBytes = 5000000, count = 100, fetchImpl = request } = options
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 ||
      !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 50000000) throw new Error('RDT invalid transport limits')
  const url = buildRequest(time, count)
  // Exclusive directory creation prevents accidental overwrite of scientific inputs.
  await fs.mkdir(directory, { recursive: false })
  const requestedAt = new Date().toISOString()
  const record = { provider: 'eumetsat', product: 'msg_fes:rdt', url, requestedAt,
    productTime: exactTime(time), bounds: { west: 7, south: 36, east: 16.5, north: 45 },
    limits: { timeoutMs, maxBytes, count }, licence: 'unverified; local research acquisition',
    nodeVersion: process.version, pluginVersion: require('../package.json').version,
    acquisitionScriptSha256: createHash('sha256').update(await fs.readFile(__filename)).digest('hex'),
    contractSha256: createHash('sha256').update(await fs.readFile(path.join(__dirname, '../lib/eumetsat-rdt-contract.js'))).digest('hex') }
  let timer
  const controller = new AbortController()
  try {
    timer = setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error',
      headers: { Accept: 'application/json' } })
    record.httpStatus = response.status
    record.contentType = response.headers.get('content-type')
    record.serverDate = response.headers.get('date')
    const body = await readBounded(response, maxBytes)
    record.receivedAt = new Date().toISOString()
    record.bytes = body.length
    record.sha256 = createHash('sha256').update(body).digest('hex')
    await fs.writeFile(path.join(directory, 'response.bin'), body, { flag: 'wx' })
    record.inspection = inspectResponse({ status: response.status, contentType: record.contentType, body, time, count })
  } catch (error) {
    // Do not persist arbitrary transport messages or response content in metadata/logs.
    record.failure = error.name === 'AbortError' ? 'RDT request timed out' :
      error.message.startsWith('RDT ') ? error.message : 'RDT acquisition failed'
  } finally {
    clearTimeout(timer)
    record.finishedAt = new Date().toISOString()
    await fs.writeFile(path.join(directory, 'acquisition.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
  }
  return record
}

async function main() {
  const [outputRoot, ...times] = process.argv.slice(2)
  if (!outputRoot || !times.length || times.length > 8) throw new Error('RDT usage: node scripts/live-check-eumetsat-rdt.js NEW_DIRECTORY UTC_TIME [UTC_TIME ...]; maximum 8 frames')
  times.forEach(exactTime)
  await fs.mkdir(outputRoot, { recursive: false })
  for (let i = 0; i < times.length; i++) {
    const record = await acquire(times[i], path.join(outputRoot, `frame-${i + 1}`))
    console.log(JSON.stringify({ time: record.productTime, httpStatus: record.httpStatus,
      inspection: record.inspection, failure: record.failure, sha256: record.sha256 }))
    if (record.failure) process.exitCode = 1
    if (i + 1 < times.length) await new Promise(resolve => setTimeout(resolve, 2000))
  }
}

if (require.main === module) main().catch(() => {
  console.error('RDT live check failed; supply a new directory and 1..8 explicit valid UTC timestamps')
  process.exitCode = 1
})

module.exports = { exactTime, buildRequest, inspectResponse, readBounded, acquire }
