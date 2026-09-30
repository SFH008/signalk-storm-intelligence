'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  OBSERVATION_FEATURE_SCHEMA_V1,
  extractObservationFeaturesV1
}=require('../lib/inference-features-v2')

function observation({
  areaKm2=25,
  maxDbz=42,
  available=true,
  representation='measurement',
  observedAt='2026-09-27T12:00:00.000Z'
}={}){
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
      observedAt,
      detection:{
        areaKm2
      },
      evidence:{
        reflectivity:{
          available,
          units:'dBZ',
          maxDbz,
          representation
        }
      }
    }
  }
}

test('observation feature schema v1 is fixed and ordered',()=>{
  assert.deepEqual(
    OBSERVATION_FEATURE_SCHEMA_V1,
    [
      'areaKm2',
      'maxReflectivityDbz',
      'reflectivityAvailable',
      'reflectivityRepresentation',
      'observationAgeSec'
    ]
  )
})

test('extracts current provider-neutral observation features',()=>{
  const features=extractObservationFeaturesV1({
    observation:observation(),
    now:Date.parse('2026-09-27T12:05:00.000Z')
  })

  assert.equal(features.areaKm2,25)
  assert.equal(features.maxReflectivityDbz,42)
  assert.equal(features.reflectivityAvailable,1)
  assert.equal(features.reflectivityRepresentation,'measurement')
  assert.equal(features.observationAgeSec,300)
})

test('missing reflectivity remains missing rather than zero',()=>{
  const obs=observation({
    maxDbz:null,
    available:false
  })

  const features=extractObservationFeaturesV1({
    observation:obs,
    now:Date.parse('2026-09-27T12:05:00.000Z')
  })

  assert.equal(features.reflectivityAvailable,0)
  assert.equal(features.maxReflectivityDbz,null)
})

test('missing area remains null',()=>{
  const obs=observation()
  obs.properties.detection.areaKm2=null

  const features=extractObservationFeaturesV1({
    observation:obs,
    now:Date.parse('2026-09-27T12:05:00.000Z')
  })

  assert.equal(features.areaKm2,null)
})

test('observation age is derived from physical observation time',()=>{
  const features=extractObservationFeaturesV1({
    observation:observation({
      observedAt:'2026-09-27T11:59:30.000Z'
    }),
    now:Date.parse('2026-09-27T12:00:00.000Z')
  })

  assert.equal(features.observationAgeSec,30)
})

test('invalid observation time remains unknown',()=>{
  const features=extractObservationFeaturesV1({
    observation:observation({
      observedAt:'invalid'
    }),
    now:Date.parse('2026-09-27T12:00:00.000Z')
  })

  assert.equal(features.observationAgeSec,null)
})

test('provider identity cannot affect extracted features',()=>{
  const a=observation()
  const b=observation()

  a.properties.provenance={provider:'aemet'}
  b.properties.provenance={provider:'future-provider'}

  const fa=extractObservationFeaturesV1({
    observation:a,
    now:Date.parse('2026-09-27T12:05:00.000Z')
  })

  const fb=extractObservationFeaturesV1({
    observation:b,
    now:Date.parse('2026-09-27T12:05:00.000Z')
  })

  assert.deepEqual(fa,fb)
})
