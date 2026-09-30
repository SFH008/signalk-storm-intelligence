'use strict'

const ALLOWED_DOMAINS=new Set([
  'radar',
  'temporal',
  'lightning',
  'weather',
  'environment'
])

const ALLOWED_SUPPORT_STATES=new Set([
  'support',
  'conflict',
  'neutral'
])

const PHENOMENA=[
  'convectiveCell',
  'thunderstorm',
  'heavyRain',
  'squallPotential'
]

const FORBIDDEN_KEYS=[
  'threat',
  'cpa',
  'tcpa',
  'vessel',
  'ownShip',
  'ownship',
  'alarm',
  'navigationAdvice'
]

function containsForbidden(value){
  if(!value || typeof value!=='object'){
    return null
  }

  for(const [key,child] of Object.entries(value)){
    if(
      FORBIDDEN_KEYS.some(
        forbidden=>
          key.toLowerCase()===
          forbidden.toLowerCase()
      )
    ){
      return key
    }

    const nested=containsForbidden(child)

    if(nested){
      return nested
    }
  }

  return null
}

function validateContribution(contribution){
  if(
    !contribution ||
    typeof contribution!=='object'
  ){
    throw new TypeError(
      'evidence contribution required'
    )
  }

  if(!ALLOWED_DOMAINS.has(contribution.domain)){
    throw new TypeError(
      `unsupported domain: ${contribution.domain}`
    )
  }

  if(
    contribution.available!==true &&
    contribution.available!==false &&
    contribution.available!==null
  ){
    throw new TypeError(
      'availability must be true, false, or null'
    )
  }

  const forbidden=containsForbidden(contribution)

  if(forbidden){
    throw new TypeError(
      `vessel-relative field is not allowed: ${forbidden}`
    )
  }

  for(const [phenomenon,state] of Object.entries(
    contribution.support || {}
  )){
    if(!PHENOMENA.includes(phenomenon)){
      continue
    }

    if(!ALLOWED_SUPPORT_STATES.has(state)){
      throw new TypeError(
        `unsupported support state: ${state}`
      )
    }
  }
}

function emptySupport(){
  return {
    supportingDomains:[],
    conflictingDomains:[],
    neutralDomains:[],
    unavailableDomains:[]
  }
}

function fuseEvidenceContributions(
  contributions=[]
){
  const domains={}
  const support={}

  for(const phenomenon of PHENOMENA){
    support[phenomenon]=emptySupport()
  }

  for(const contribution of contributions){
    validateContribution(contribution)

    const {
      domain,
      available,
      support:domainSupport={},
      provenance=null
    }=contribution

    domains[domain]={
      available,
      support:{...domainSupport},
      provenance:
        provenance==null
          ? null
          : {...provenance}
    }

    for(const phenomenon of PHENOMENA){
      const target=support[phenomenon]

      if(available!==true){
        target.unavailableDomains.push(domain)
        continue
      }

      const state=
        domainSupport[phenomenon] ?? 'neutral'

      if(state==='support'){
        target.supportingDomains.push(domain)
      }else if(state==='conflict'){
        target.conflictingDomains.push(domain)
      }else{
        target.neutralDomains.push(domain)
      }
    }
  }

  return {
    domains,
    support,
    provenance:{
      method:'deterministic-evidence-fusion-v1'
    }
  }
}

module.exports={
  fuseEvidenceContributions
}
