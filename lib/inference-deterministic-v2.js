'use strict'

function clamp01(value){
  return Math.max(0,Math.min(1,value))
}

function reflectivityEvidence(observation){
  const r=observation?.properties?.evidence?.reflectivity

  if(
    !r ||
    r.available !== true ||
    r.units !== 'dBZ' ||
    !Number.isFinite(Number(r.maxDbz))
  ){
    return null
  }

  return {
    maxDbz:Number(r.maxDbz),
    representation:r.representation ?? null,
    derivation:r.derivation ?? null
  }
}

function reflectivitySupport(r){
  /*
   * This is evidence-strength scoring only.
   * It is NOT a convective/thunderstorm probability.
   */
  const x=(r.maxDbz-20)/30
  const score=clamp01(x)

  let semanticFactor=1

  if(r.representation==='lower-bound'){
    semanticFactor*=0.85
  }else if(r.representation==='estimate'){
    semanticFactor*=0.75
  }

  if(r.derivation==='converted'){
    semanticFactor*=0.85
  }

  return {
    score:clamp01(score*semanticFactor),
    confidence:clamp01(0.5+0.5*semanticFactor)
  }
}

function createDeterministicObservationInference(){
  return {
    id:'deterministic-observation-v2',
    type:'deterministic',
    version:'1',
    stages:['observation'],

    async infer(context={}){
      const observation=context.observation
      const used=[]
      const reasons=[]

      const reflectivity=reflectivityEvidence(observation)

      if(!reflectivity){
        reasons.push('no-usable-evidence')

        return {
          accepted:null,
          classification:{
            convectiveCell:{
              value:null,
              confidence:null
            },
            thunderstorm:{
              value:null,
              confidence:null
            },
            squallPotential:{
              value:null,
              confidence:null
            }
          },
          quality:{
            score:null,
            confidence:null,
            reasons
          },
          evidenceUsed:used,
          provenance:{
            method:'deterministic-observation-v2'
          }
        }
      }

      used.push('reflectivity')

      const support=reflectivitySupport(reflectivity)

      return {
        accepted:true,
        classification:{
          convectiveCell:{
            value:null,
            confidence:null
          },
          thunderstorm:{
            value:null,
            confidence:null
          },
          squallPotential:{
            value:null,
            confidence:null
          }
        },
        quality:{
          score:support.score,
          confidence:support.confidence,
          reasons
        },
        evidenceUsed:used,
        provenance:{
          method:'deterministic-observation-v2'
        }
      }
    }
  }
}

module.exports={
  createDeterministicObservationInference,
  reflectivityEvidence,
  reflectivitySupport
}
