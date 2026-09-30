'use strict'

function finiteOrNull(value){
  if(value===null || value===undefined){
    return null
  }

  return Number.isFinite(value)
    ? value
    : null
}

function compareMissingModality({
  baseline,
  ablated,
  modality
}={}){
  const baselineMetric=
    finiteOrNull(baseline?.metric)

  const ablatedMetric=
    finiteOrNull(ablated?.metric)

  let degradation=null
  let relativeDegradation=null

  if(
    baselineMetric!==null &&
    ablatedMetric!==null
  ){
    degradation=
      baselineMetric-ablatedMetric

    if(baselineMetric!==0){
      relativeDegradation=
        degradation/baselineMetric
    }
  }

  return {
    modality:modality ?? null,
    baselineMetric,
    ablatedMetric,
    baselineEvaluated:
      baseline?.evaluated ?? null,
    ablatedEvaluated:
      ablated?.evaluated ?? null,
    degradation,
    relativeDegradation
  }
}

function flatten(value,prefix='',out={}){
  if(
    value===null ||
    value===undefined ||
    typeof value!=='object' ||
    Array.isArray(value)
  ){
    out[prefix]=value
    return out
  }

  for(const [key,child] of Object.entries(value)){
    const path=prefix
      ? `${prefix}.${key}`
      : key

    flatten(child,path,out)
  }

  return out
}

function sameValue(a,b){
  if(
    typeof a==='number' &&
    typeof b==='number'
  ){
    return Object.is(a,b)
  }

  return a===b
}

function compareProviderInvariant({
  a,
  b
}={}){
  /*
   * Provider provenance is deliberately outside the
   * compared scientific output.
   */
  const left=flatten(a?.output ?? {})
  const right=flatten(b?.output ?? {})

  const keys=new Set([
    ...Object.keys(left),
    ...Object.keys(right)
  ])

  const differences=[]

  for(const key of [...keys].sort()){
    if(!sameValue(left[key],right[key])){
      differences.push(key)
    }
  }

  return {
    invariant:differences.length===0,
    differences
  }
}

function perturbationSensitivity({
  baseline,
  perturbed,
  feature,
  perturbation
}={}){
  const a=finiteOrNull(baseline)
  const b=finiteOrNull(perturbed)

  let absoluteChange=null
  let relativeChange=null

  if(a!==null && b!==null){
    absoluteChange=b-a

    if(a!==0){
      relativeChange=
        absoluteChange/Math.abs(a)
    }
  }

  return {
    feature:feature ?? null,
    perturbation:
      finiteOrNull(perturbation),
    baseline:a,
    perturbed:b,
    absoluteChange,
    relativeChange
  }
}

module.exports={
  compareMissingModality,
  compareProviderInvariant,
  perturbationSensitivity
}
