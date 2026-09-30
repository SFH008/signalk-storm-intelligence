'use strict'

function clone(value){
  return value==null
    ? value
    : JSON.parse(JSON.stringify(value))
}

function attachObservationInference(
  observation,
  inference
){
  if(
    !observation ||
    typeof observation!=='object'
  ){
    throw new TypeError(
      'Storm observation is required'
    )
  }

  if(
    !inference ||
    inference.schema!=='storm-inference/2'
  ){
    throw new TypeError(
      'storm-inference/2 result is required'
    )
  }

  return {
    ...observation,

    geometry:
      clone(observation.geometry),

    properties:{
      ...(observation.properties||{}),

      evidence:
        clone(
          observation.properties?.evidence ??
          null
        ),

      inference:
        clone(inference)
    }
  }
}

function isAcceptedStormObservation(
  observation
){
  const inference=
    observation?.properties?.inference

  return (
    inference?.schema==='storm-inference/2' &&
    inference.stage==='observation' &&
    inference.accepted===true
  )
}

module.exports={
  attachObservationInference,
  isAcceptedStormObservation
}
