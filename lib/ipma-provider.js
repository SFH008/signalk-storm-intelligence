'use strict'

const sharp = require('sharp')
const proj4 = require('proj4')
const { USER_AGENT } = require('./version')

const TIMELINE_URL =
  'https://www.ipma.pt/resources.www/transf/radar/imgs-radar.json'

const IMAGE_BASE =
  'https://www.ipma.pt/resources.www/transf/radar/por/'

const PRODUCTS = Object.freeze({
  PCR: {
    title: 'IPMA Mainland Radar Precipitation Intensity',
    description: 'IPMA mainland radar precipitation intensity mosaic',
    kind: 'raster',
    units: 'mm/h',
    period: 'PT5M',
    temporal: true,
    raw: false,
    bounds: [-12.454795, 34.011513, -4.345465, 43.792862]
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

function parseIpmaDate(value) {
  if (typeof value !== 'string') return null

  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(value.trim())

  if (!match) return null

  const [, ys, mos, ds, hs, mis] = match

  const year = Number(ys)
  const month = Number(mos)
  const day = Number(ds)
  const hour = Number(hs)
  const minute = Number(mis)

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
    epochMs,
    time: date.toISOString()
  }
}

function normalizeFrames(json) {
  const rows = json?.Portugal

  if (!Array.isArray(rows)) {
    throw new Error('Invalid IPMA radar timeline')
  }

  return rows
    .map(row => {
      const parsed = parseIpmaDate(row?.date)

      if (!parsed || typeof row?.path !== 'string' || !row.path) {
        return null
      }

      return {
        ...parsed,
        path: row.path
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.epochMs - b.epochMs)
}

class IpmaProvider {
  constructor(cfg = {}) {
    this.id = 'ipma'
    this.name = 'Instituto Português do Mar e da Atmosfera (IPMA)'
    this.attribution = '© IPMA'

    this.cfg = cfg
  }

  products() {
    return PRODUCTS
  }

  async frames() {
    const response = await fetch(
      this.cfg.timelineUrl || TIMELINE_URL,
      {
        headers: {
          accept: 'application/json,text/plain,*/*;q=0.5',
          'user-agent': USER_AGENT
        },
        signal: timeoutSignal(this.cfg.requestTimeoutMs || 10000)
      }
    )

    if (!response.ok) {
      throw new Error(`IPMA radar timeline HTTP ${response.status}`)
    }

    let json

    try {
      json = await response.json()
    } catch (error) {
      throw new Error(`Invalid IPMA radar timeline: ${error.message}`)
    }

    return normalizeFrames(json)
  }

  async latest(product) {
    const meta = PRODUCTS[product]

    if (!meta) {
      throw new Error(`Unsupported IPMA product ${product}`)
    }

    const frames = await this.frames()

    if (!frames.length) {
      throw new Error(`No IPMA ${product} observation available`)
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
      throw new Error(`Unsupported IPMA product ${product}`)
    }

    return (await this.frames()).map(frame => frame.time)
  }

  async tile(product, tileRequest, time) {
    const meta = PRODUCTS[product]

    if (!meta) {
      throw new Error(`Unsupported IPMA product ${product}`)
    }

    const bbox = Array.isArray(tileRequest)
      ? tileRequest
      : tileRequest?.bbox3857

    if (!Array.isArray(bbox) || bbox.length !== 4) {
      throw new Error('IPMA requires bbox3857 in tile request')
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
      throw new Error(`IPMA ${product} frame not found`)
    }

    const imageBase = (this.cfg.imageBase || IMAGE_BASE).replace(/\/?$/, '/')
    const imageUrl = new URL(frame.path, imageBase).toString()

    const response = await fetch(imageUrl, {
      headers: {
        accept: 'image/png,*/*;q=0.5',
        'user-agent': USER_AGENT
      },
      signal: timeoutSignal(this.cfg.requestTimeoutMs || 10000)
    })

    if (!response.ok) {
      throw new Error(`IPMA radar image HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''

    if (!contentType.toLowerCase().includes('image/png')) {
      throw new Error(`Unexpected IPMA radar content type ${contentType}`)
    }

    const image = Buffer.from(await response.arrayBuffer())
    const size = tileRequest?.size || 256

    const [west, south, east, north] = meta.bounds

    const sourceSW = proj4('EPSG:4326', 'EPSG:3857', [west, south])
    const sourceNE = proj4('EPSG:4326', 'EPSG:3857', [east, north])

    const sourceWest = sourceSW[0]
    const sourceSouth = sourceSW[1]
    const sourceEast = sourceNE[0]
    const sourceNorth = sourceNE[1]

    const intersectionWest = Math.max(bbox[0], sourceWest)
    const intersectionSouth = Math.max(bbox[1], sourceSouth)
    const intersectionEast = Math.min(bbox[2], sourceEast)
    const intersectionNorth = Math.min(bbox[3], sourceNorth)

    if (
      intersectionEast <= intersectionWest ||
      intersectionNorth <= intersectionSouth
    ) {
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

    const left = Math.max(
      0,
      Math.floor(
        (intersectionWest - sourceWest) /
        (sourceEast - sourceWest) *
        metadata.width
      )
    )

    const right = Math.min(
      metadata.width,
      Math.ceil(
        (intersectionEast - sourceWest) /
        (sourceEast - sourceWest) *
        metadata.width
      )
    )

    const top = Math.max(
      0,
      Math.floor(
        (sourceNorth - intersectionNorth) /
        (sourceNorth - sourceSouth) *
        metadata.height
      )
    )

    const bottom = Math.min(
      metadata.height,
      Math.ceil(
        (sourceNorth - intersectionSouth) /
        (sourceNorth - sourceSouth) *
        metadata.height
      )
    )

    const outputLeft = Math.max(
      0,
      Math.round(
        (intersectionWest - bbox[0]) /
        (bbox[2] - bbox[0]) *
        size
      )
    )

    const outputRight = Math.min(
      size,
      Math.round(
        (intersectionEast - bbox[0]) /
        (bbox[2] - bbox[0]) *
        size
      )
    )

    const outputTop = Math.max(
      0,
      Math.round(
        (bbox[3] - intersectionNorth) /
        (bbox[3] - bbox[1]) *
        size
      )
    )

    const outputBottom = Math.min(
      size,
      Math.round(
        (bbox[3] - intersectionSouth) /
        (bbox[3] - bbox[1]) *
        size
      )
    )

    const width = Math.max(1, outputRight - outputLeft)
    const height = Math.max(1, outputBottom - outputTop)

    const cropped = await sharp(image)
      .extract({
        left,
        top,
        width: right - left,
        height: bottom - top
      })
      .resize(width, height)
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
      .composite([{
        input: cropped,
        left: outputLeft,
        top: outputTop
      }])
      .png()
      .toBuffer()
  }
}

module.exports = {
  IpmaProvider,
  PRODUCTS,
  parseIpmaDate,
  normalizeFrames
}
