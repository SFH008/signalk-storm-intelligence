'use strict'

const TRAINING_SCHEMA='storm-inference-training-sample/1'

const ALLOWED_LABEL_SOURCES=new Set([
  'human-reviewed',
  'authoritative-observation',
  'verified-event-record'
])

function validateLabel(label){
  if(!label || typeof label!=='object'){
    throw new TypeError('label is required')
  }

  if(label.value===null){
    if(label.source!==null || label.confidence!==null){
      throw new TypeError(
        'unknown label must have null source and confidence'
      )
    }
    return true
  }

  if(typeof label.value!=='boolean'){
    throw new TypeError('label value must be boolean or null')
  }

  if(!ALLOWED_LABEL_SOURCES.has(label.source)){
    throw new TypeError(
      `invalid label source: ${label.source}`
    )
  }

  if(
    !Number.isFinite(label.confidence) ||
    label.confidence<0 ||
    label.confidence>1
  ){
    throw new TypeError(
      'label confidence must be within [0,1]'
    )
  }

  return true
}

function validateTrainingSample(sample){
  if(!sample || typeof sample!=='object'){
    throw new TypeError('training sample required')
  }

  if(sample.schema!==TRAINING_SCHEMA){
    throw new TypeError(
      `schema must be ${TRAINING_SCHEMA}`
    )
  }

  if(
    typeof sample.eventId!=='string' ||
    !sample.eventId.trim()
  ){
    throw new TypeError('eventId required')
  }

  if(
    typeof sample.sampleId!=='string' ||
    !sample.sampleId.trim()
  ){
    throw new TypeError('sampleId required')
  }

  if(
    !Number.isFinite(Date.parse(sample.observedAt))
  ){
    throw new TypeError('valid observedAt required')
  }

  if(
    sample.features?.observation?.schema !==
    'storm-inference-observation-features/1'
  ){
    throw new TypeError(
      'observation feature schema required'
    )
  }

  if(
    sample.features?.temporal?.schema !==
    'storm-inference-temporal-features/1'
  ){
    throw new TypeError(
      'temporal feature schema required'
    )
  }

  const requiredLabels=[
    'convectiveCell',
    'thunderstorm',
    'heavyRain',
    'squallPotential'
  ]

  for(const name of requiredLabels){
    if(!(name in (sample.labels || {}))){
      throw new TypeError(`missing label: ${name}`)
    }
    validateLabel(sample.labels[name])
  }

  return true
}

function assertNoDuplicates(values,name){
  const seen=new Set()

  for(const value of values){
    if(seen.has(value)){
      throw new TypeError(
        `duplicate event in ${name}: ${value}`
      )
    }
    seen.add(value)
  }

  return seen
}

function validateEventSplit({
  trainEventIds=[],
  calibrationEventIds=[],
  testEventIds=[]
}={}){
  const train=assertNoDuplicates(
    trainEventIds,
    'train'
  )

  const calibration=assertNoDuplicates(
    calibrationEventIds,
    'calibration'
  )

  const test=assertNoDuplicates(
    testEventIds,
    'test'
  )

  for(const id of train){
    if(calibration.has(id) || test.has(id)){
      throw new TypeError(
        `event leakage: ${id}`
      )
    }
  }

  for(const id of calibration){
    if(test.has(id)){
      throw new TypeError(
        `event leakage: ${id}`
      )
    }
  }

  return true
}

module.exports={
  TRAINING_SCHEMA,
  ALLOWED_LABEL_SOURCES,
  validateLabel,
  validateTrainingSample,
  validateEventSplit
}
