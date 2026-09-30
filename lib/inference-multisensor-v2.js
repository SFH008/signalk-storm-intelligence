'use strict'

const ALLOWED_DOMAINS=new Set([
  'lightning',
  'weather',
  'environment'
])

const FORBIDDEN_FEATURE_PATTERNS=[
  /^cpa/i,
  /^tcpa/i,
  /threat/i,
  /alarm/i,
  /vessel/i,
  /ownship/i,
  /ownShip/i,
  /pathIntersection/i,
  /navigationAdvice/i
]

function validateAvailability(value){
  if(
    value!==true &&
    value!==false &&
    value!==null
  ){
    throw new TypeError(
      'availability must be true, false, or null'
    )
  }
}

function containsForbiddenFeature(value,path=''){
  if(!value || typeof value!=='object'){
    return null
  }

  for(const [key,child] of Object.entries(value)){
    const nextPath=path
      ? `${path}.${key}`
      : key

    if(
      FORBIDDEN_FEATURE_PATTERNS.some(
        pattern=>pattern.test(key)
      )
    ){
      return nextPath
    }

    if(child && typeof child==='object'){
      const nested=
        containsForbiddenFeature(
          child,
          nextPath
        )

      if(nested){
        return nested
      }
    }
  }

  return null
}

function normalizeMultisensorContribution({
  domain,
  available,
  features=null,
  provenance=null,
  ...rest
}={}){
  if(!ALLOWED_DOMAINS.has(domain)){
    throw new TypeError(
      `unsupported multisensor domain: ${domain}`
    )
  }

  validateAvailability(available)

  for(const key of Object.keys(rest)){
    if(/confidence/i.test(key)){
      throw new TypeError(
        'confidence adjustment is not allowed in multisensor contribution'
      )
    }
  }

  if(
    available!==true &&
    features!==null &&
    features!==undefined
  ){
    throw new TypeError(
      'unavailable evidence must not contain features'
    )
  }

  const forbidden=
    containsForbiddenFeature(features)

  if(forbidden){
    throw new TypeError(
      `vessel-relative feature is not allowed: ${forbidden}`
    )
  }

  return {
    domain,
    available,
    features:
      available===true
        ? {...(features || {})}
        : null,
    provenance:
      provenance==null
        ? null
        : {...provenance}
  }
}

module.exports={
  ALLOWED_DOMAINS,
  normalizeMultisensorContribution
}
