'use strict'

const {
  validateTrainingSample
}=require('./inference-training-contract-v2')

const OBSERVATION_SCHEMA=
  'storm-inference-observation-features/1'

const TEMPORAL_SCHEMA=
  'storm-inference-temporal-features/1'

function requiredString(value,name){
  if(
    typeof value!=='string' ||
    !value.trim()
  ){
    throw new TypeError(`${name} required`)
  }

  return value
}

function assembleTrainingSample({
  eventId,
  sampleId,
  observedAt,
  observationFeatures,
  temporalFeatures,
  labels,
  evidenceBundle,
  evidenceRevision,
  codeRevision,
  reviewRevision
}={}){
  requiredString(eventId,'eventId')
  requiredString(sampleId,'sampleId')

  if(
    !Number.isFinite(Date.parse(observedAt))
  ){
    throw new TypeError('valid observedAt required')
  }

  if(
    observationFeatures?.schema !==
    OBSERVATION_SCHEMA
  ){
    throw new TypeError(
      'observation feature schema invalid'
    )
  }

  if(
    temporalFeatures?.schema !==
    TEMPORAL_SCHEMA
  ){
    throw new TypeError(
      'temporal feature schema invalid'
    )
  }

  requiredString(
    evidenceBundle,
    'evidenceBundle'
  )

  requiredString(
    evidenceRevision,
    'evidenceRevision'
  )

  requiredString(
    codeRevision,
    'codeRevision'
  )

  requiredString(
    reviewRevision,
    'reviewRevision'
  )

  const sample={
    schema:
      'storm-inference-training-sample/1',

    eventId,
    sampleId,
    observedAt:
      new Date(
        Date.parse(observedAt)
      ).toISOString(),

    features:{
      observation:{
        schema:observationFeatures.schema,
        values:{
          ...observationFeatures.values
        }
      },

      temporal:{
        schema:temporalFeatures.schema,
        values:{
          ...temporalFeatures.values
        }
      }
    },

    labels:{
      ...labels
    },

    provenance:{
      evidenceBundle,
      evidenceRevision,
      codeRevision,
      reviewRevision
    }
  }

  validateTrainingSample(sample)

  return sample
}

module.exports={
  assembleTrainingSample
}
