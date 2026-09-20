'use strict'

const zlib = require('node:zlib')
const tar = require('tar-stream')
const sharp = require('sharp')
const proj4 = require('proj4')

/*
 * AEMET regional archive filenames:
 *
 *   down_CLG260920163000.PPI.Z_005_240.tif
 *   down_CLG260920163000.TOP.12DBZ_240.tif
 *   down_CLG260920140000.RN1.1HR_CAPPI.tif
 *   down_CLG260920120000.RNN.6HR_CAPPI.tif
 *
 * Observation time is authoritative from the filename.
 * TAR metadata/order must never be used as observation time.
 */
function parseAemetFilename(name) {
  if (typeof name !== 'string') return null

  const base = name.split('/').pop()
  const match = /^down_([A-Z0-9]+)(\d{12})\.(PPI|TOP|RN1|RNN)\..+\.tif$/i.exec(base)

  if (!match) return null

  const radar = match[1].toUpperCase()
  const stamp = match[2]
  const product = match[3].toUpperCase()

  const yy = Number(stamp.slice(0, 2))
  const month = Number(stamp.slice(2, 4))
  const day = Number(stamp.slice(4, 6))
  const hour = Number(stamp.slice(6, 8))
  const minute = Number(stamp.slice(8, 10))
  const second = Number(stamp.slice(10, 12))

  // AEMET archive uses two-digit years. Radar archive data belongs to the
  // modern observation era; map 00..99 deterministically to 2000..2099.
  const year = 2000 + yy

  if (
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null
  }

  const epochMs = Date.UTC(year, month - 1, day, hour, minute, second)

  // Reject impossible calendar dates rather than allowing Date.UTC to
  // normalize them into a different date.
  const date = new Date(epochMs)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null
  }

  return {
    radar,
    product,
    epochMs,
    time: date.toISOString(),
    name: base
  }
}

function extractArchiveMembers(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return Promise.reject(new TypeError('AEMET archive must be a Buffer'))
  }

  return new Promise((resolve, reject) => {
    let tarBuffer

    try {
      tarBuffer = zlib.gunzipSync(buffer)
    } catch (error) {
      reject(new Error(`Invalid AEMET gzip archive: ${error.message}`))
      return
    }

    const extract = tar.extract()
    const members = []
    let settled = false

    function fail(error) {
      if (settled) return
      settled = true
      reject(error)
    }

    extract.on('entry', (header, stream, next) => {
      const chunks = []

      stream.on('data', chunk => chunks.push(Buffer.from(chunk)))

      stream.on('error', fail)

      stream.on('end', () => {
        if (header.type === 'file') {
          members.push({
            name: header.name,
            buffer: Buffer.concat(chunks)
          })
        }
        next()
      })

      stream.resume()
    })

    extract.on('finish', () => {
      if (settled) return
      settled = true
      resolve(members)
    })

    extract.on('error', error => {
      fail(new Error(`Invalid AEMET tar archive: ${error.message}`))
    })

    extract.end(tarBuffer)
  })
}

function selectArchiveFrame(members, options = {}) {
  if (!Array.isArray(members)) {
    throw new TypeError('AEMET archive members must be an array')
  }

  const radar = String(options.radar || '').toUpperCase()
  const product = String(options.product || '').toUpperCase()
  const requestedEpoch = options.epochMs

  if (!radar) throw new Error('AEMET radar code is required')
  if (!product) throw new Error('AEMET product is required')

  const candidates = []

  for (const member of members) {
    const parsed = parseAemetFilename(member?.name)
    if (!parsed) continue
    if (parsed.radar !== radar) continue
    if (parsed.product !== product) continue

    candidates.push({
      ...parsed,
      buffer: member.buffer
    })
  }

  if (requestedEpoch !== undefined && requestedEpoch !== null) {
    const epochMs = Number(requestedEpoch)

    if (!Number.isFinite(epochMs)) {
      throw new Error('Invalid AEMET historical observation timestamp')
    }

    const exact = candidates.find(frame => frame.epochMs === epochMs)

    if (!exact) {
      throw new Error(
        `AEMET ${radar} ${product} frame ${new Date(epochMs).toISOString()} not found`
      )
    }

    return exact
  }

  if (!candidates.length) {
    throw new Error(`No AEMET ${radar} ${product} frame found`)
  }

  candidates.sort((a, b) => a.epochMs - b.epochMs)
  return candidates[candidates.length - 1]
}


const { USER_AGENT } = require('./version')

const PRODUCTS = Object.freeze({
  COMPO: {
    title: 'AEMET National Radar Reflectivity',
    description: 'AEMET national radar reflectivity composite',
    kind: 'raster',
    units: 'dBZ',
    period: 'PT10M',
    temporal: true,
    raw: true,
    bounds: [-12.11, 33.2131131, 6.111581, 46.30]
  },

  PPI: {
    title: 'AEMET Regional Radar Reflectivity',
    description: 'AEMET regional PPI 0.5° radar reflectivity',
    kind: 'raster',
    units: 'dBZ',
    period: 'PT10M',
    temporal: true,
    raw: true,
    bounds: [-15.1359347, 29.4956281, 2.4690653, 45.8506281]
  },

  TOP: {
    title: 'AEMET Regional 12 dBZ Echo Top',
    description: 'AEMET regional echo-top height using the 12 dBZ threshold',
    kind: 'raster',
    units: 'km',
    period: 'PT10M',
    temporal: true,
    raw: true,
    bounds: [-15.1359347, 29.4956281, 2.4690653, 45.8506281]
  },

  RN1: {
    title: 'AEMET Regional 1-hour Accumulated Precipitation',
    description: 'AEMET regional one-hour accumulated precipitation',
    kind: 'raster',
    units: 'mm',
    period: 'PT1H',
    temporal: true,
    raw: true,
    bounds: [-15.1359347, 29.4956281, 2.4690653, 45.8506281]
  },

  RNN: {
    title: 'AEMET Regional 6-hour Accumulated Precipitation',
    description: 'AEMET regional six-hour accumulated precipitation',
    kind: 'raster',
    units: 'mm',
    period: 'PT6H',
    temporal: true,
    raw: true,
    bounds: [-15.1359347, 29.4956281, 2.4690653, 45.8506281]
  }
})

function timeoutSignal(ms) {
  return AbortSignal.timeout
    ? AbortSignal.timeout(ms)
    : (() => {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), ms).unref?.()
        return controller.signal
      })()
}

function parseCompoFilename(name) {
  if (typeof name !== 'string') return null

  const base = name.split('/').pop()
  const match = /^down_radw(\d{12})_4326\.tif$/i.exec(base)
  if (!match) return null

  const stamp = match[1]
  const year = Number(stamp.slice(0, 4))
  const month = Number(stamp.slice(4, 6))
  const day = Number(stamp.slice(6, 8))
  const hour = Number(stamp.slice(8, 10))
  const minute = Number(stamp.slice(10, 12))

  const epochMs = Date.UTC(year, month - 1, day, hour, minute)
  const date = new Date(epochMs)

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  ) {
    return null
  }

  return {
    product: 'COMPO',
    epochMs,
    time: date.toISOString(),
    name: base
  }
}

class AemetProvider {
  constructor(cfg = {}) {
    this.id = 'aemet'
    this.name = 'Agencia Estatal de Meteorología (AEMET)'
    this.attribution =
      '© AEMET. Autorizado el uso de la información y su reproducción citando a AEMET como autora de la misma.'

    this.cfg = cfg
    this.radar = String(cfg.radar || 'CLG').toUpperCase()
    this._archive = new Map()
  }

  products() {
    return PRODUCTS
  }

  archiveUrl(product) {
    if (!PRODUCTS[product]) {
      throw new Error(`Unsupported AEMET product ${product}`)
    }

    const base =
      this.cfg.downloadBase ||
      'https://www.aemet.es/es/api-eltiempo/radar/download/'

    const upstreamProduct = product === 'COMPO' ? 'compo' : product

    return new URL(upstreamProduct, base.replace(/\/?$/, '/')).toString()
  }

  async archive(product, force = false) {
    const cached = this._archive.get(product)

    if (!force && cached && cached.expires > Date.now()) {
      return cached.members
    }

    const response = await fetch(this.archiveUrl(product), {
      headers: {
        accept: 'application/gzip,application/x-gzip,application/octet-stream,*/*;q=0.5',
        'user-agent': USER_AGENT
      },
      signal: timeoutSignal(this.cfg.requestTimeoutMs || 10000)
    })

    if (!response.ok) {
      throw new Error(`AEMET radar archive HTTP ${response.status}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const members = await extractArchiveMembers(buffer)

    this._archive.set(product, {
      members,
      expires:
        Date.now() +
        Math.max(10000, Number(this.cfg.archiveCacheMs) || 60000)
    })

    return members
  }

  _frames(product, members) {
    if (product === 'COMPO') {
      return members
        .map(member => {
          const parsed = parseCompoFilename(member.name)
          return parsed ? { ...parsed, buffer: member.buffer } : null
        })
        .filter(Boolean)
        .sort((a, b) => a.epochMs - b.epochMs)
    }

    return members
      .map(member => {
        const parsed = parseAemetFilename(member.name)

        if (
          !parsed ||
          parsed.radar !== this.radar ||
          parsed.product !== product
        ) {
          return null
        }

        return { ...parsed, buffer: member.buffer }
      })
      .filter(Boolean)
      .sort((a, b) => a.epochMs - b.epochMs)
  }

  async latest(product) {
    const meta = PRODUCTS[product]

    if (!meta) {
      throw new Error(`Unsupported AEMET product ${product}`)
    }

    const frames = this._frames(product, await this.archive(product))

    if (!frames.length) {
      throw new Error(`No AEMET ${product} observation available`)
    }

    const frame = frames[frames.length - 1]

    return {
      product,
      time: frame.time,
      epochMs: frame.epochMs,
      period: meta.period,
      source: this.id
    }
  }

  async timeline(product) {
    if (!PRODUCTS[product]) {
      throw new Error(`Unsupported AEMET product ${product}`)
    }

    return this._frames(product, await this.archive(product))
      .map(frame => frame.time)
  }

  imageUrl(product, filename) {
    const param = product === 'COMPO' ? 'compo' : product
    return `https://www.aemet.es/es/api-eltiempo/radar/imagen-radar/${param}/${filename}`
  }

  boundsUrl(product, filename) {
    const param = product === 'COMPO' ? 'compo' : product
    return `https://www.aemet.es/es/api-eltiempo/radar/bounds-radar/${param}/${filename}`
  }

  async tile(product, tileRequest, time) {
    if (!PRODUCTS[product]) throw new Error(`Unsupported AEMET product ${product}`)

    const bbox = Array.isArray(tileRequest) ? tileRequest : tileRequest?.bbox3857
    if (!Array.isArray(bbox)) throw new Error('AEMET requires bbox3857 in tile request')

    const epochMs = Number(time?.epochMs ?? time?.time ?? time)
    const requested = Number.isFinite(epochMs)
      ? epochMs
      : Date.parse(time?.time || time || (await this.latest(product)).time)

    const frames = this._frames(product, await this.archive(product))
    const frame = frames.find(candidate => candidate.epochMs === requested)
    if (!frame) throw new Error(`AEMET ${product} frame not found`)

    const headers = { 'user-agent': USER_AGENT }
    const signal = timeoutSignal(this.cfg.requestTimeoutMs || 10000)

    let filename

    if (product === 'COMPO') {
      const timelineResponse = await fetch(
        'https://www.aemet.es/es/api-eltiempo/radar/timeline/compo/penbal',
        { headers, signal }
      )

      if (!timelineResponse.ok) {
        throw new Error(`AEMET COMPO timeline HTTP ${timelineResponse.status}`)
      }

      const timeline = await timelineResponse.json()
      const root = Array.isArray(timeline) ? timeline[0] : timeline
      const element = (root?.Elementos || []).find(
        item => Date.parse(item.Fecha) === frame.epochMs
      )

      if (!element?.['Nombre fichero']) {
        throw new Error(`AEMET COMPO rendered frame not found`)
      }

      filename = element['Nombre fichero']
    } else {
      filename = frame.name.replace(/^down_/, '').replace(/\.tif$/i, '.png')
    }

    const [imageResponse, boundsResponse] = await Promise.all([
      fetch(this.imageUrl(product, filename), { headers, signal }),
      fetch(this.boundsUrl(product, filename), { headers, signal })
    ])

    if (!imageResponse.ok) throw new Error(`AEMET radar image HTTP ${imageResponse.status}`)
    if (!boundsResponse.ok) throw new Error(`AEMET radar bounds HTTP ${boundsResponse.status}`)

    const image = Buffer.from(await imageResponse.arrayBuffer())
    const bounds = await boundsResponse.json()

    const points = bounds
    const west = Math.min(...points.map(p => p[0]))
    const east = Math.max(...points.map(p => p[0]))
    const south = Math.min(...points.map(p => p[1]))
    const north = Math.max(...points.map(p => p[1]))

    const [tileWest, tileSouth] = proj4('EPSG:3857', 'EPSG:4326', [bbox[0], bbox[1]])
    const [tileEast, tileNorth] = proj4('EPSG:3857', 'EPSG:4326', [bbox[2], bbox[3]])

    const meta = await sharp(image).metadata()
    const left = Math.max(0, Math.floor((tileWest - west) / (east - west) * meta.width))
    const right = Math.min(meta.width, Math.ceil((tileEast - west) / (east - west) * meta.width))
    const top = Math.max(0, Math.floor((north - tileNorth) / (north - south) * meta.height))
    const bottom = Math.min(meta.height, Math.ceil((north - tileSouth) / (north - south) * meta.height))

    if (right <= left || bottom <= top) {
      return sharp({
        create: { width: tileRequest?.size || 256, height: tileRequest?.size || 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      }).png().toBuffer()
    }

    const size = tileRequest?.size || 256

    return sharp(image)
      .extract({ left, top, width: right - left, height: bottom - top })
      .resize(size, size)
      .png()
      .toBuffer()
  }

  async downloadRaw(product, epochMs) {
    if (!PRODUCTS[product]) {
      throw new Error(`Unsupported AEMET product ${product}`)
    }

    const requested = Number(epochMs)

    if (!Number.isFinite(requested)) {
      throw new Error('AEMET observation timestamp is required')
    }

    const frames = this._frames(product, await this.archive(product))
    const frame = frames.find(candidate => candidate.epochMs === requested)

    if (!frame) {
      throw new Error(
        `AEMET ${product} frame ${new Date(requested).toISOString()} not found`
      )
    }

    return {
      buffer: frame.buffer,
      key: frame.name,
      contentType: 'image/tiff'
    }
  }

  rawExtension() {
    return '.tif'
  }
}

module.exports = {
  AemetProvider,
  PRODUCTS,
  parseAemetFilename,
  parseCompoFilename,
  extractArchiveMembers,
  selectArchiveFrame
}
