'use strict'

const OBSERVATION_FEATURE_SCHEMA_V1=Object.freeze([
  'areaKm2',
  'maxReflectivityDbz',
  'reflectivityAvailable',
  'reflectivityRepresentation',
  'observationAgeSec'
])


const TEMPORAL_FEATURE_SCHEMA_V1=Object.freeze([
  'intensityChangeDbz',
  'intensityRateDbzPerMin',
  'areaChangeKm2',
  'areaRateKm2PerMin',
  'evolutionConfidence'
])

function finiteOrNull(value){
  if(value === null || value === undefined || value === ''){
    return null
  }

  const n=Number(value)
  return Number.isFinite(n) ? n : null
}

function observationAgeSec(observedAt,now){
  const observed=Date.parse(observedAt)
  const current=Number(now)

  if(
    !Number.isFinite(observed) ||
    !Number.isFinite(current)
  ){
    return null
  }

  return Math.max(0,(current-observed)/1000)
}

function extractObservationFeaturesV1({
  observation,
  now
}={}){
  const properties=observation?.properties || {}
  const detection=properties.detection || {}
  const reflectivity=
    properties.evidence?.reflectivity || {}

  const available=
    reflectivity.available === true

  return {
    areaKm2:
      finiteOrNull(detection.areaKm2),

    maxReflectivityDbz:
      available
        ? finiteOrNull(reflectivity.maxDbz)
        : null,

    /*
     * Availability is a modality mask.
     * 0 means unavailable, not zero reflectivity.
     */
    reflectivityAvailable:
      available ? 1 : 0,

    reflectivityRepresentation:
      reflectivity.representation == null
        ? null
        : String(reflectivity.representation),

    observationAgeSec:
      observationAgeSec(
        properties.observedAt,
        now
      )
  }
}


function extractTemporalFeaturesV1({
  evolution
}={}){
  const intensityTrend=evolution?.intensityTrend || null
  const areaTrend=evolution?.areaTrend || null

  return {
    intensityChangeDbz:
      finiteOrNull(intensityTrend?.changeDbz),

    intensityRateDbzPerMin:
      finiteOrNull(intensityTrend?.rateDbzPerMin),

    areaChangeKm2:
      finiteOrNull(areaTrend?.changeKm2),

    areaRateKm2PerMin:
      finiteOrNull(areaTrend?.rateKm2PerMin),

    evolutionConfidence:
      finiteOrNull(evolution?.confidence)
  }
}

module.exports={
  OBSERVATION_FEATURE_SCHEMA_V1,
  TEMPORAL_FEATURE_SCHEMA_V1,
  extractObservationFeaturesV1,
  extractTemporalFeaturesV1,
  observationAgeSec,
  finiteOrNull
}
