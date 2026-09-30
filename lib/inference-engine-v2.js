'use strict'

const {
  fuseEvidenceContributions
}=require('./inference-fusion-v2')

const {
  buildInferenceUncertainty
}=require('./inference-uncertainty-v2')

const SCHEMA='storm-inference/2'
const ENGINE='inference-engine-v2'

function algorithmMetadata(algorithm){
  return {
    id:algorithm.id,
    type:algorithm.type ?? 'unknown',
    version:algorithm.version ?? null
  }
}

function knownConsensus(values){
  const known=values.filter(value=>value !== null && value !== undefined)
  if(!known.length)return null
  const first=known[0]
  return known.every(value=>value === first) ? first : null
}

function mergeAccepted(contributions){
  return knownConsensus(
    contributions.map(c=>c.result?.accepted)
  )
}

function mergeClassification(contributions){
  const names=new Set()

  for(const contribution of contributions){
    for(const name of Object.keys(
      contribution.result?.classification || {}
    )){
      names.add(name)
    }
  }

  const merged={}

  for(const name of names){
    const rows=contributions
      .map(c=>c.result?.classification?.[name])
      .filter(Boolean)

    const value=knownConsensus(rows.map(row=>row.value))

    const confidences=rows
      .map(row=>row.confidence)
      .filter(Number.isFinite)

    merged[name]={
      value,
      confidence:
        value === null || !confidences.length
          ? null
          : Math.max(...confidences)
    }
  }

  return merged
}

function mergeQuality(contributions){
  const rows=contributions
    .map(c=>c.result?.quality)
    .filter(Boolean)

  if(!rows.length)return null

  const scores=rows.map(row=>row.score).filter(Number.isFinite)
  const confidences=rows
    .map(row=>row.confidence)
    .filter(Number.isFinite)

  return {
    score:scores.length ? Math.min(...scores) : null,
    confidence:confidences.length ? Math.min(...confidences) : null,
    reasons:[...new Set(rows.flatMap(row=>row.reasons || []))]
  }
}

class InferenceEngineV2 {
  constructor({algorithms=[]}={}){
    this.algorithms=[...algorithms]
  }

  async inferObservation(context={}){
    const contributions=[]

    for(const algorithm of this.algorithms){
      if(
        Array.isArray(algorithm.stages) &&
        !algorithm.stages.includes('observation')
      ){
        continue
      }

      const result=await algorithm.infer({
        ...context,
        stage:'observation'
      })

      contributions.push({
        algorithm:algorithmMetadata(algorithm),
        model:result?.model ?? algorithm.model ?? null,
        result:result ?? {}
      })
    }

    const quality=mergeQuality(contributions)

    const fusion=
      Array.isArray(context.multisensorContributions) &&
      context.multisensorContributions.length
        ? fuseEvidenceContributions(
            context.multisensorContributions
          )
        : null

    const uncertainty=
      context.uncertaintyInput
        ? buildInferenceUncertainty(
            context.uncertaintyInput
          )
        : null

    return {
      schema:SCHEMA,
      stage:'observation',
      accepted:mergeAccepted(contributions),
      classification:mergeClassification(contributions),
      ...(quality ? {quality} : {}),
      ...(fusion ? {fusion} : {}),
      ...(uncertainty ? {uncertainty} : {}),
      contributions,
      provenance:{
        engine:ENGINE
      }
    }
  }
}

module.exports={
  InferenceEngineV2,
  knownConsensus,
  mergeAccepted,
  mergeClassification,
  mergeQuality
}
