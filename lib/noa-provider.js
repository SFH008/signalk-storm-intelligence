'use strict'

const sharp = require('sharp')
const proj4 = require('proj4')
const { USER_AGENT } = require('./version')

const BASE_URL = 'https://nowcast.meteo.noa.gr'
const LIVE_PATH = '/data/XPol/'
const ARCHIVE_ROOT = '/data/database/'
const DIRECTORY_ENDPOINT = '/php/dird.php'

const PRODUCTS = Object.freeze({
  RAIN_RATE: {
    title: 'NOA XPOL Rainfall Rate',
    description: 'NOA XPOL radar rainfall rate',
    kind: 'raster',
    units: 'mm/h',
    temporal: true,
    raw: true,
    bounds: [22.4706, 36.9888, 25.2987, 39.0912]
  },
  ACC1H: {
    title: 'NOA XPOL 1-hour Rainfall Accumulation',
    description: 'NOA XPOL one-hour accumulated rainfall',
    kind: 'raster',
    units: 'mm',
    temporal: true,
    raw: false,
    bounds: [22.4706, 36.9888, 25.2987, 39.0912]
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

function normalizeBase(value) {
  return String(value || BASE_URL).replace(/\/+$/, '')
}

function normalizePath(value) {
  const s = String(value || '')
  return `/${s.replace(/^\/+|\/+$/g, '')}/`
}

function normalizeTimestamps(value) {
  if (!Array.isArray(value)) return []

  return [...new Set(
    value
      .map(Number)
      .filter(Number.isFinite)
      .filter(v => v > 0)
      .map(Math.trunc)
  )].sort((a, b) => a - b)
}

class NoaProvider {
  constructor(cfg = {}) {
    this.id = 'noa'
    this.name = 'National Observatory of Athens (NOA) XPOL'
    this.attribution = '© National Observatory of Athens'

    this.cfg = cfg
    this.baseUrl = normalizeBase(cfg.baseUrl)
    this.livePath = normalizePath(cfg.livePath || LIVE_PATH)
    this.archiveRoot = normalizePath(cfg.archiveRoot || ARCHIVE_ROOT)
    this.directoryEndpoint =
      cfg.directoryEndpoint || DIRECTORY_ENDPOINT

    this._frameSourceCache = null
  }

  products() {
    return PRODUCTS
  }

  async getJson(path) {
    const response = await fetch(new URL(path, this.baseUrl), {
      headers: {
        accept: 'application/json,text/plain,*/*;q=0.5',
        'user-agent': USER_AGENT
      },
      signal: timeoutSignal(this.cfg.requestTimeoutMs || 10000)
    })

    if (!response.ok) {
      throw new Error(`NOA HTTP ${response.status}: ${path}`)
    }

    try {
      return await response.json()
    } catch (error) {
      throw new Error(`Invalid NOA JSON ${path}: ${error.message}`)
    }
  }

  async listDirectory(path, smatch = '') {
    const body = new URLSearchParams({
      cDir: path,
      rev: 'true',
      smatch
    })

    const response = await fetch(
      new URL(this.directoryEndpoint, this.baseUrl),
      {
        method: 'POST',
        headers: {
          accept: 'application/json,text/plain,*/*;q=0.5',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': USER_AGENT
        },
        body,
        signal: timeoutSignal(this.cfg.requestTimeoutMs || 10000)
      }
    )

    if (!response.ok) {
      throw new Error(`NOA archive directory HTTP ${response.status}`)
    }

    let value

    try {
      value = await response.json()
    } catch (error) {
      throw new Error(`Invalid NOA archive directory response: ${error.message}`)
    }

    return Array.isArray(value) ? value : []
  }

  async archivePath() {
    const years = await this.listDirectory(this.archiveRoot)

    for (const year of years) {
      const yearPath = `${this.archiveRoot}${year}/`
      const dates = await this.listDirectory(yearPath)

      for (const date of dates) {
        const datePath = `${yearPath}${date}/`
        const intervals = await this.listDirectory(datePath)

        for (const interval of intervals) {
          const intervalPath = `${datePath}${interval}/`
          const children = await this.listDirectory(intervalPath)

          if (children.includes('XPol')) {
            return `${intervalPath}XPol/`
          }
        }
      }
    }

    throw new Error('No NOA XPOL archive available')
  }

  async frameSource() {
    const now = Date.now()

    if (
      this._frameSourceCache &&
      now - this._frameSourceCache.cachedAt < 60000
    ) {
      return this._frameSourceCache.value
    }

    const live = normalizeTimestamps(
      await this.getJson(`${this.livePath}timestamp.json`)
    )

    let value

    if (live.length) {
      value = {
        path: this.livePath,
        timestamps: live
      }
    } else {
      const path = await this.archivePath()
      const timestamps = normalizeTimestamps(
        await this.getJson(`${path}timestamp.json`)
      )

      if (!timestamps.length) {
        throw new Error('No NOA XPOL observations available')
      }

      value = { path, timestamps }
    }

    this._frameSourceCache = {
      cachedAt: now,
      value
    }

    return value
  }

  async frames() {
    const source = await this.frameSource()

    return source.timestamps.map(timestamp => ({
      timestamp,
      epochMs: timestamp * 1000,
      time: new Date(timestamp * 1000).toISOString(),
      path: source.path
    }))
  }

  async latest(product) {
    const meta = PRODUCTS[product]

    if (!meta) {
      throw new Error(`Unsupported NOA product ${product}`)
    }

    const frames = await this.frames()
    const frame = frames[frames.length - 1]

    if (!frame) {
      throw new Error(`No NOA ${product} observation available`)
    }

    return {
      product,
      time: frame.time,
      epochMs: frame.epochMs,
      source: this.id
    }
  }

  async timeline(product) {
    if (!PRODUCTS[product]) {
      throw new Error(`Unsupported NOA product ${product}`)
    }

    return (await this.frames()).map(frame => frame.time)
  }

  rawExtension(product) {
    if (product !== 'RAIN_RATE') {
      throw new Error(`Unsupported NOA raw product ${product}`)
    }

    return '.png'
  }

  async downloadRaw(product, epochMs) {
    if (product !== 'RAIN_RATE') {
      throw new Error(`Unsupported NOA raw product ${product}`)
    }

    const frames = await this.frames()
    const requested = Number(epochMs)

    const frame = Number.isFinite(requested)
      ? frames.find(candidate => candidate.epochMs === requested)
      : null

    if (!frame) {
      throw new Error(`NOA ${product} frame not found`)
    }

    const file = `XPol_R_${frame.timestamp}.png`
    const response = await fetch(
      new URL(`${frame.path}${file}`, this.baseUrl),
      {
        headers: {
          accept: 'image/png,*/*;q=0.5',
          'user-agent': USER_AGENT
        },
        signal: timeoutSignal(this.cfg.requestTimeoutMs || 10000)
      }
    )

    if (!response.ok) {
      throw new Error(`NOA XPOL image HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''

    if (!contentType.toLowerCase().includes('image/png')) {
      throw new Error(`Unexpected NOA XPOL content type ${contentType}`)
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      key: file,
      time: frame.time,
      epochMs: frame.epochMs
    }
  }

  async tile(product, tileRequest, time) {
    const meta = PRODUCTS[product]

    if (!meta) {
      throw new Error(`Unsupported NOA product ${product}`)
    }

    const bbox = Array.isArray(tileRequest)
      ? tileRequest
      : tileRequest?.bbox3857

    if (!Array.isArray(bbox) || bbox.length !== 4) {
      throw new Error('NOA requires bbox3857 in tile request')
    }

    const frames = await this.frames()

    const epochMs = Number(time?.epochMs ?? time?.time ?? time)
    const requested = Number.isFinite(epochMs)
      ? epochMs
      : Date.parse(time?.time || time || '')

    const frame = Number.isFinite(requested)
      ? frames.find(candidate => candidate.epochMs === requested)
      : frames[frames.length - 1]

    if (!frame) {
      throw new Error(`NOA ${product} frame not found`)
    }

    const timestamp = frame.timestamp
    const grid = await this.getJson(`${frame.path}grid_${timestamp}.json`)

    if (
      !Array.isArray(grid) ||
      grid.length !== 4 ||
      !grid.every(Number.isFinite)
    ) {
      throw new Error(`Invalid NOA XPOL grid for ${timestamp}`)
    }

    const [south, west, north, east] = grid

    const file =
      product === 'RAIN_RATE'
        ? `XPol_R_${timestamp}.png`
        : `XPol_accR_${timestamp}.png`

    const response = await fetch(
      new URL(`${frame.path}${file}`, this.baseUrl),
      {
        headers: {
          accept: 'image/png,*/*;q=0.5',
          'user-agent': USER_AGENT
        },
        signal: timeoutSignal(this.cfg.requestTimeoutMs || 10000)
      }
    )

    if (!response.ok) {
      throw new Error(`NOA XPOL image HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''

    if (!contentType.toLowerCase().includes('image/png')) {
      throw new Error(`Unexpected NOA XPOL content type ${contentType}`)
    }

    const image = Buffer.from(await response.arrayBuffer())
    const size = tileRequest?.size || 256

    const sw = proj4('EPSG:4326', 'EPSG:3857', [west, south])
    const ne = proj4('EPSG:4326', 'EPSG:3857', [east, north])

    const sourceWest = sw[0]
    const sourceSouth = sw[1]
    const sourceEast = ne[0]
    const sourceNorth = ne[1]

    const iw = Math.max(bbox[0], sourceWest)
    const is = Math.max(bbox[1], sourceSouth)
    const ie = Math.min(bbox[2], sourceEast)
    const inn = Math.min(bbox[3], sourceNorth)

    if (ie <= iw || inn <= is) {
      return sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      }).png().toBuffer()
    }

    const metadata = await sharp(image).metadata()

    const left = Math.max(0, Math.floor(
      (iw - sourceWest) / (sourceEast - sourceWest) * metadata.width
    ))
    const right = Math.min(metadata.width, Math.ceil(
      (ie - sourceWest) / (sourceEast - sourceWest) * metadata.width
    ))
    const top = Math.max(0, Math.floor(
      (sourceNorth - inn) / (sourceNorth - sourceSouth) * metadata.height
    ))
    const bottom = Math.min(metadata.height, Math.ceil(
      (sourceNorth - is) / (sourceNorth - sourceSouth) * metadata.height
    ))

    const cropWidth = right - left
    const cropHeight = bottom - top

    if (cropWidth <= 0 || cropHeight <= 0) {
      throw new Error(`Invalid NOA XPOL crop for ${timestamp}`)
    }

    const outLeft = Math.max(0, Math.floor(
      (iw - bbox[0]) / (bbox[2] - bbox[0]) * size
    ))
    const outRight = Math.min(size, Math.ceil(
      (ie - bbox[0]) / (bbox[2] - bbox[0]) * size
    ))
    const outTop = Math.max(0, Math.floor(
      (bbox[3] - inn) / (bbox[3] - bbox[1]) * size
    ))
    const outBottom = Math.min(size, Math.ceil(
      (bbox[3] - is) / (bbox[3] - bbox[1]) * size
    ))

    const resized = await sharp(image)
      .extract({
        left,
        top,
        width: cropWidth,
        height: cropHeight
      })
      .resize({
        width: Math.max(1, outRight - outLeft),
        height: Math.max(1, outBottom - outTop),
        fit: 'fill'
      })
      .ensureAlpha()
      .png()
      .toBuffer()

    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: resized, left: outLeft, top: outTop }])
      .png()
      .toBuffer()
  }
}

module.exports = {
  NoaProvider,
  PRODUCTS,
  normalizeTimestamps
}
