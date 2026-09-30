'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  createDeterministicObservationInference
}=require('../lib/inference-deterministic-v2')

function observation(evidence,extra={}){
  return {
    type:'Feature',
    geometry:{
      type:'Polygon',
      coordinates:[[
        [-8,40],[-7.9,40],[-7.9,40.1],
        [-8,40.1],[-8,40]
      ]]
    },
    properties:{
      observationId:'obs-1',
      observedAt:'2026-09-27T12:00:00.000Z',
      centroid:[-7.95,40.05],
      areaKm2:25,
      evidence,
      provenance:{domain:'radar'},
      ...extra
    }
  }
}

test('usable calibrated reflectivity evidence is recognized',async()=>{
  const algorithm=createDeterministicObservationInference()

  const result=await algorithm.infer({
    stage:'observation',
    observation:observation({
      reflectivity:{
        available:true,
        units:'dBZ',
        maxDbz:42,
        representation:'measurement',
        derivation:'native'
      }
    })
  })

  assert.equal(result.accepted,true)
  assert.ok(result.quality)
  assert.ok(result.quality.score>0)
  assert.ok(result.quality.confidence>0)
  assert.ok(result.evidenceUsed.includes('reflectivity'))
})

test('missing evidence remains indeterminate',async()=>{
  const algorithm=createDeterministicObservationInference()

  const result=await algorithm.infer({
    stage:'observation',
    observation:observation({})
  })

  assert.equal(result.accepted,null)
  assert.equal(result.quality.score,null)
  assert.equal(result.quality.confidence,null)
  assert.ok(result.quality.reasons.includes('no-usable-evidence'))
})

test('unavailable evidence is not treated as zero-valued evidence',async()=>{
  const algorithm=createDeterministicObservationInference()

  const result=await algorithm.infer({
    stage:'observation',
    observation:observation({
      reflectivity:{
        available:false,
        units:'dBZ',
        maxDbz:null,
        representation:'measurement'
      }
    })
  })

  assert.equal(result.accepted,null)
  assert.equal(result.quality.score,null)
  assert.equal(result.quality.confidence,null)
})

test('provider identity does not affect deterministic inference',async()=>{
  const algorithm=createDeterministicObservationInference()

  const evidence={
    reflectivity:{
      available:true,
      units:'dBZ',
      maxDbz:40,
      representation:'measurement',
      derivation:'native'
    }
  }

  const a=observation(evidence,{
    provenance:{provider:'provider-a'}
  })
  const b=observation(evidence,{
    provenance:{provider:'provider-b'}
  })

  const ra=await algorithm.infer({
    stage:'observation',
    observation:a
  })

  const rb=await algorithm.infer({
    stage:'observation',
    observation:b
  })

  assert.deepEqual(ra.quality,rb.quality)
  assert.deepEqual(ra.classification,rb.classification)
})

test('stronger compatible evidence does not reduce support',async()=>{
  const algorithm=createDeterministicObservationInference()

  async function infer(maxDbz){
    return algorithm.infer({
      stage:'observation',
      observation:observation({
        reflectivity:{
          available:true,
          units:'dBZ',
          maxDbz,
          representation:'measurement',
          derivation:'native'
        }
      })
    })
  }

  const weaker=await infer(30)
  const stronger=await infer(45)

  assert.ok(
    stronger.quality.score>=weaker.quality.score
  )

  assert.ok(
    stronger.quality.confidence>=weaker.quality.confidence
  )
})

test('algorithm does not invent thunderstorm or squall classification',async()=>{
  const algorithm=createDeterministicObservationInference()

  const result=await algorithm.infer({
    stage:'observation',
    observation:observation({
      reflectivity:{
        available:true,
        units:'dBZ',
        maxDbz:50,
        representation:'measurement',
        derivation:'native'
      }
    })
  })

  assert.equal(
    result.classification.thunderstorm?.value ?? null,
    null
  )

  assert.equal(
    result.classification.squallPotential?.value ?? null,
    null
  )
})
