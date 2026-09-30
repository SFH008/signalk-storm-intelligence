'use strict'

function clone(value){
  if(value===null || value===undefined){
    return value
  }

  if(Array.isArray(value)){
    return value.map(clone)
  }

  if(typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value).map(
        ([key,item])=>[key,clone(item)]
      )
    )
  }

  return value
}

function buildValidationReport({
  model,
  split,
  eventIds=[],
  metrics={},
  robustness=null
}={}){
  if(!model || typeof model!=='object'){
    throw new TypeError(
      'model metadata required'
    )
  }

  if(!model.id){
    throw new TypeError(
      'model id required'
    )
  }

  if(!model.version){
    throw new TypeError(
      'model version required'
    )
  }

  if(!split){
    throw new TypeError(
      'split required'
    )
  }

  if(!Array.isArray(eventIds)){
    throw new TypeError(
      'eventIds must be an array'
    )
  }

  if(new Set(eventIds).size!==eventIds.length){
    throw new TypeError(
      'duplicate event id'
    )
  }

  return {
    schema:'storm-inference-validation-report/1',
    model:clone(model),
    split,
    eventIds:[...eventIds],
    metrics:clone(metrics),
    ...(robustness!==null
      ? {robustness:clone(robustness)}
      : {})
  }
}

module.exports={
  buildValidationReport
}
