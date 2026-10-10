'use strict'

const { createHash } = require('node:crypto')
const { exactTime, inspectResponse } = require('./eumetsat-rdt-contract')

const NUMERIC_FIELDS = ['BTmin', 'CoolingRat', 'DTtropoOT', 'CTPressure', 'MvtDirecti',
  'MvtSpeed', 'BTmoy', 'CRainRate', 'Duration']

// Offline research resource. No observedAt, motion conversion, detector or alerts
// until the published layer's semantics have been authoritatively established.
function resourceFromAcquisition(body, acquisition) {
  if (!Buffer.isBuffer(body) || !acquisition || acquisition.provider !== 'eumetsat' ||
      acquisition.product !== 'msg_fes:rdt' || acquisition.failure ||
      acquisition.bytes !== body.length || !Number.isInteger(acquisition.limits?.count)) {
    throw new Error('RDT invalid acquisition record')
  }
  const checksum = createHash('sha256').update(body).digest('hex')
  if (checksum !== acquisition.sha256) throw new Error('RDT acquisition checksum mismatch')
  const receivedAt = exactTime(acquisition.receivedAt)
  const inspection = inspectResponse({ body, status: acquisition.httpStatus,
    contentType: acquisition.contentType, time: acquisition.productTime, count: acquisition.limits.count })
  const data = JSON.parse(body.toString('utf8'))
  const objects = data.features.map(feature => {
    const attributes = {}
    for (const field of NUMERIC_FIELDS) {
      const value = feature.properties[field]
      if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
        throw new Error(`RDT invalid ${field} attribute`)
      }
      if (value !== undefined) attributes[field] = value
    }
    const phase = feature.properties.PhaseLife
    if (phase !== undefined && phase !== null && (typeof phase !== 'string' || phase.length > 128)) {
      throw new Error('RDT invalid PhaseLife attribute')
    }
    if (phase !== undefined) attributes.PhaseLife = phase
    return { sourceFeatureId: feature.id, geometry: feature.geometry,
      nativeAttributes: attributes, quality: { meteorologicalSemantics: 'unverified' } }
  }).sort((a, b) => a.sourceFeatureId < b.sourceFeatureId ? -1 : a.sourceFeatureId > b.sourceFeatureId ? 1 : 0)
  return { schema: 'storm-intelligence/rdt-research-resource/1', kind: 'convective-cloud-objects',
    provider: 'eumetsat', product: 'msg_fes:rdt', productTime: inspection.productTime, receivedAt,
    availability: inspection.status, operationallyUsable: false,
    timeSemantics: 'unverified-published-product-time', objects,
    provenance: { sourceChecksum: checksum, normalizer: 'eumetsat-rdt-research/1',
      licenceStatus: 'unverified', spatialCompleteness: 'unverified',
      objectIdentity: 'source-record-only', attributeUnits: 'unverified',
      missingValueCodes: 'unverified', responseTimestamp: inspection.responseTimestamp } }
}

module.exports = { resourceFromAcquisition }
