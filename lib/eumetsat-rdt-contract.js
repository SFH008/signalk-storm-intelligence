'use strict'

// Published WFS structural contract only; meteorological semantics are unverified.
function exactTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) {
    throw new Error('RDT requires an explicit valid UTC timestamp')
  }
  return new Date(value).toISOString()
}

function validateGeometry(geometry) {
  if (!geometry || geometry.type !== 'MultiPolygon' || !Array.isArray(geometry.coordinates) || !geometry.coordinates.length) {
    throw new Error('RDT requires nonempty MultiPolygon geometry')
  }
  for (const polygon of geometry.coordinates) {
    if (!Array.isArray(polygon) || !polygon.length) throw new Error('RDT polygon has no rings')
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) throw new Error('RDT ring is invalid')
      for (const point of ring) {
        if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) ||
            Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error('RDT coordinate is invalid')
      }
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw new Error('RDT ring is not closed')
    }
  }
}

function inspectResponse({ status, contentType, body, time, count = 100 }) {
  const expected = exactTime(time)
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('RDT invalid count limit')
  if (status !== 200) throw new Error(`RDT HTTP ${status}`)
  if (!/^application\/json(?:\s*;|$)/i.test(contentType || '')) throw new Error('RDT unexpected content type')
  let data
  try { data = JSON.parse(body.toString('utf8')) } catch { throw new Error('RDT malformed JSON') }
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) ||
      !Number.isSafeInteger(data.numberMatched) || data.numberMatched < 0 ||
      !Number.isSafeInteger(data.numberReturned) || data.numberReturned !== data.features.length ||
      data.numberReturned > count || data.numberMatched < data.numberReturned) throw new Error('RDT invalid collection/counts')
  if (data.numberMatched !== data.numberReturned) throw new Error('RDT truncated frame')
  if (data.features.length && data.crs?.properties?.name !== 'urn:ogc:def:crs:EPSG::4326') throw new Error('RDT unexpected CRS')
  const ids = new Set()
  for (const feature of data.features) {
    if (feature?.type !== 'Feature' || typeof feature.id !== 'string' || !feature.id || ids.has(feature.id)) {
      throw new Error('RDT missing or duplicate feature ID')
    }
    ids.add(feature.id)
    if (exactTime(feature.properties?.time) !== expected) throw new Error('RDT substituted or mixed timestamp')
    validateGeometry(feature.geometry)
  }
  return { status: data.features.length ? 'complete' : 'empty-or-unavailable',
    productTime: expected, numberMatched: data.numberMatched, numberReturned: data.numberReturned,
    featureIds: [...ids].sort(), responseTimestamp: data.timeStamp ?? null }
}

module.exports = { exactTime, validateGeometry, inspectResponse }
