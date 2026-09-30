'use strict'

const {
  validateTrainingSample
}=require('./inference-training-contract-v2')

const {
  evaluateBinaryClassification,
  brierScore,
  calibrationBins
}=require('./inference-evaluation-v2')

const {
  buildValidationReport
}=require('./inference-validation-v2')

function validateThreshold(value){
  if(
    !Number.isFinite(value) ||
    value<0 ||
    value>1
  ){
    throw new TypeError(
      'threshold must be supplied within [0,1]'
    )
  }
}

function flattenFeatures(sample){
  return {
    ...(sample.features.observation.values || {}),
    ...(sample.features.temporal.values || {})
  }
}

async function evaluateReplaySamples({
  model,
  samples=[],
  labelName,
  split,
  threshold
}={}){
  if(
    !model ||
    typeof model.infer!=='function'
  ){
    throw new TypeError('model required')
  }

  if(!labelName){
    throw new TypeError('labelName required')
  }

  if(!split){
    throw new TypeError('split required')
  }

  validateThreshold(threshold)

  const classificationRows=[]
  const calibrationRows=[]
  const eventIds=[]
  const seenEvents=new Set()

  for(const sample of samples){
    validateTrainingSample(sample)

    if(!(labelName in sample.labels)){
      throw new TypeError(
        `missing label: ${labelName}`
      )
    }

    const features=flattenFeatures(sample)

    const result=await model.infer({
      stage:'observation',
      features
    })

    const truth=
      sample.labels[labelName].value

    const probability=
      result?.probability ?? null

    const decisionScore=
      probability !== null &&
      probability !== undefined
        ? probability
        : result?.modelScore

    const predicted=
      Number.isFinite(decisionScore)
        ? decisionScore>=threshold
        : null

    classificationRows.push({
      truth,
      predicted
    })

    calibrationRows.push({
      truth,
      probability
    })

    if(!seenEvents.has(sample.eventId)){
      seenEvents.add(sample.eventId)
      eventIds.push(sample.eventId)
    }
  }

  return buildValidationReport({
    model:{
      id:model.id,
      type:model.type ?? null,
      version:model.version,
      checksum:model.checksum ?? null
    },

    split,
    eventIds,

    metrics:{
      classification:
        evaluateBinaryClassification(
          classificationRows
        ),

      calibration:{
        brierScore:
          brierScore(calibrationRows),

        bins:
          calibrationBins(
            calibrationRows
          )
      }
    }
  })
}

module.exports={
  evaluateReplaySamples
}
