'use strict'

function validateUnitInterval(name,value){
  if(value===null || value===undefined){
    return
  }

  if(
    !Number.isFinite(value) ||
    value<0 ||
    value>1
  ){
    throw new TypeError(
      `${name} must be null or between 0 and 1`
    )
  }
}

function buildInferenceUncertainty({
  expectedDomains=[],
  domainAvailability={},
  modelUncertainty=null,
  calibrationUncertainty=null
}={}){
  if(!Array.isArray(expectedDomains)){
    throw new TypeError(
      'expectedDomains must be an array'
    )
  }

  validateUnitInterval(
    'modelUncertainty',
    modelUncertainty
  )

  validateUnitInterval(
    'calibrationUncertainty',
    calibrationUncertainty
  )

  const reasons=[]

  let availableCount=0

  for(const domain of expectedDomains){
    const availability=
      Object.prototype.hasOwnProperty.call(
        domainAvailability,
        domain
      )
        ? domainAvailability[domain]
        : null

    if(availability===true){
      availableCount++
      continue
    }

    if(availability===false){
      reasons.push(
        `${domain} unavailable`
      )
      continue
    }

    reasons.push(
      `${domain} availability unknown`
    )
  }

  const evidenceCompleteness=
    expectedDomains.length
      ? availableCount/expectedDomains.length
      : null

  return {
    evidenceCompleteness,
    modelUncertainty:
      modelUncertainty ?? null,
    calibrationUncertainty:
      calibrationUncertainty ?? null,
    reasons
  }
}

module.exports={
  buildInferenceUncertainty
}
