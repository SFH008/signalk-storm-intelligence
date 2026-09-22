'use strict'

const { USER_AGENT } = require('./version')

const EUMETSAT_PRODUCTS = Object.freeze({
  MTG_GEOCOLOR: {
    layer: 'mtg_fd:rgb_geocolour',
    title: 'EUMETSAT MTG Geo Colour',
    description: 'Geo Colour RGB imagery from Meteosat Third Generation FCI',
    kind: 'raster',
    units: null,
    period: 'PT10M',
    temporal: true,
    raw: false,
    cells: false,
    forecast: false,
    minZoom: 0,
    maxZoom: 8
  }
})

function timeoutSignal(ms) {
  return AbortSignal.timeout ? AbortSignal.timeout(ms) : (() => {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), ms)
    t.unref?.()
    return c.signal
  })()
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function layerBlock(xml, layerName) {
  const nameRe = new RegExp(
    `<Name>\\s*${escapeRegExp(layerName)}\\s*<\\/Name>`,
    'i'
  )
  const match = nameRe.exec(xml)
  if (!match) return null

  const start = xml.lastIndexOf('<Layer', match.index)
  const end = xml.indexOf('</Layer>', match.index)

  if (start < 0 || end < 0) return null
  return xml.slice(start, end + '</Layer>'.length)
}

function parseIsoDurationMs(text) {
  const m = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(text || '')
  if (!m) return null

  return (
    Number(m[1] || 0) * 3600 +
    Number(m[2] || 0) * 60 +
    Number(m[3] || 0)
  ) * 1000
}

function expandTimeToken(token, out, max = 4096) {
  const parts = token.trim().split('/')

  if (parts.length !== 3) {
    const t = Date.parse(token.trim())
    if (Number.isFinite(t)) out.push(t)
    return
  }

  const start = Date.parse(parts[0])
  const end = Date.parse(parts[1])
  const step = parseIsoDurationMs(parts[2])

  if (!Number.isFinite(start) || !Number.isFinite(end) || !step || step <= 0) return

  /*
   * EUMETView ranges can span years. Playback only needs the newest end
   * of the range, so generate backwards when expansion would exceed max.
   */
  const count = Math.floor((end - start) / step) + 1

  if (count > max) {
    const first = Math.max(start, end - (max - 1) * step)
    for (let t = first; t <= end; t += step) out.push(t)
    return
  }

  for (let t = start; t <= end; t += step) out.push(t)
}

function parseLayerTimes(xml, layerName) {
  const block = layerBlock(xml, layerName)
  if (!block) return []

  const matches = []
  const re = /<(?:Dimension|Extent)\b[^>]*\bname=["']time["'][^>]*>([\s\S]*?)<\/(?:Dimension|Extent)>/gi
  let m

  while ((m = re.exec(block))) matches.push(m[1])

  const epochs = []

  for (const body of matches) {
    const clean = body
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, '')

    for (const token of clean.split(',').filter(Boolean)) {
      expandTimeToken(token, epochs)
    }
  }

  return [...new Set(epochs)].sort((a, b) => a - b)
}

function selectObservationEpoch(epochs, now = Date.now(), toleranceMs = 2 * 60 * 1000) {
  if (!epochs.length) return null
  const valid = epochs.filter(t => t <= now + toleranceMs)
  return valid.length ? valid[valid.length - 1] : epochs[0]
}

function mercatorToLonLat(x, y) {
  const R = 6378137
  const lon = x / R * 180 / Math.PI
  const lat = Math.atan(Math.sinh(y / R)) * 180 / Math.PI
  return [lon, lat]
}

function bbox3857To4326(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) {
    throw new Error('EUMETSAT requires bbox3857 in tile request')
  }

  const sw = mercatorToLonLat(bbox[0], bbox[1])
  const ne = mercatorToLonLat(bbox[2], bbox[3])

  return [sw[0], sw[1], ne[0], ne[1]]
}

class EumetsatProvider {
  constructor(cfg = {}) {
    this.id = 'eumetsat'
    this.name = 'EUMETSAT Meteosat / MTG'
    this.attribution = 'Satellite imagery: EUMETSAT'
    this.cfg = cfg
    this._times = new Map()
  }

  products() {
    return EUMETSAT_PRODUCTS
  }

  _meta(product) {
    const m = EUMETSAT_PRODUCTS[product]
    if (!m) throw new Error(`Unsupported EUMETSAT product ${product}`)
    return m
  }

  capabilitiesUrl() {
    const u = new URL(
      this.cfg.wmsBase ||
      'https://view.eumetsat.int/geoserver/wms'
    )

    u.searchParams.set('service', 'WMS')
    u.searchParams.set('version', '1.3.0')
    u.searchParams.set('request', 'GetCapabilities')

    return u.toString()
  }

  async availableTimes(product, force = false) {
    const m = this._meta(product)
    const cached = this._times.get(product)

    if (!force && cached && cached.expires > Date.now()) {
      return cached.times
    }

    const r = await fetch(this.capabilitiesUrl(), {
      headers: {
        accept: 'application/xml,text/xml,*/*;q=0.5',
        'user-agent': USER_AGENT
      },
      signal: timeoutSignal(this.cfg.requestTimeoutMs || 10000)
    })

    if (!r.ok) {
      throw new Error(`EUMETSAT WMS capabilities HTTP ${r.status}`)
    }

    const times = parseLayerTimes(await r.text(), m.layer)

    if (!times.length) {
      throw new Error(`EUMETSAT WMS returned no time dimension for ${product}`)
    }

    const ttl = Math.max(
      15000,
      Number(this.cfg.capabilitiesCacheSeconds || 60) * 1000
    )

    this._times.set(product, {
      times,
      expires: Date.now() + ttl
    })

    return times
  }

  async latest(product) {
    const m = this._meta(product)
    const times = await this.availableTimes(product)
    const epochMs = selectObservationEpoch(times)

    if (!Number.isFinite(epochMs)) {
      throw new Error(`No current EUMETSAT ${product} frame available`)
    }

    return {
      product,
      time: new Date(epochMs).toISOString(),
      epochMs,
      period: m.period || null,
      source: this.id,
      forecastAvailable: false
    }
  }

  async timeline(product, options = {}) {
    const times = await this.availableTimes(product)
    const latest = selectObservationEpoch(times)

    if (!Number.isFinite(latest)) return []

    const minutes = Math.max(
      5,
      Math.min(24 * 60, Number(options.minutes) || 180)
    )

    const lower = latest - minutes * 60000

    return times
      .filter(t => t >= lower && t <= latest)
      .map(t => new Date(t).toISOString())
  }

  wmsUrl(product, bbox4326, time) {
    const m = this._meta(product)
    const u = new URL(
      this.cfg.wmsBase ||
      'https://view.eumetsat.int/geoserver/wms'
    )

    /*
     * WMS 1.1.1 + EPSG:4326 deliberately avoids WMS 1.3.0 axis-order
     * ambiguity. bbox is therefore lon,lat,lon,lat.
     */
    const params = {
      service: 'WMS',
      version: '1.1.1',
      request: 'GetMap',
      layers: m.layer,
      styles: '',
      format: 'image/png',
      transparent: 'true',
      width: '256',
      height: '256',
      srs: 'EPSG:4326',
      bbox: bbox4326.join(',')
    }

    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, v)
    }

    if (time) u.searchParams.set('time', time)

    return u.toString()
  }

  async tile(product, tileRequest, time) {
    this._meta(product)

    const bbox3857 = Array.isArray(tileRequest)
      ? tileRequest
      : tileRequest?.bbox3857

    const bbox4326 = bbox3857To4326(bbox3857)

    let effectiveTime = time
    if (!effectiveTime) {
      effectiveTime = (await this.latest(product)).time
    }

    const r = await fetch(
      this.wmsUrl(product, bbox4326, effectiveTime),
      {
        headers: {
          accept: 'image/png,image/*;q=0.8',
          'user-agent': USER_AGENT
        },
        signal: timeoutSignal(this.cfg.requestTimeoutMs || 10000)
      }
    )

    if (!r.ok) {
      throw new Error(`EUMETSAT WMS HTTP ${r.status}`)
    }

    const ct = r.headers.get('content-type') || ''

    if (!ct.includes('image/png')) {
      throw new Error(`EUMETSAT WMS returned ${ct}`)
    }

    return Buffer.from(await r.arrayBuffer())
  }
}

module.exports = {
  EumetsatProvider,
  EUMETSAT_PRODUCTS,
  parseIsoDurationMs,
  parseLayerTimes,
  selectObservationEpoch,
  mercatorToLonLat,
  bbox3857To4326
}
