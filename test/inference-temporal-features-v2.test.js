'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  TEMPORAL_FEATURE_SCHEMA_V1,
  extractTemporalFeaturesV1
}=require('../lib/inference-features-v2')

test('temporal feature schema v1 is fixed and ordered',()=>{
  assert.deepEqual(
    TEMPORAL_FEATURE_SCHEMA_V1,
    [
      'intensityChangeDbz',
      'intensityRateDbzPerMin',
      'areaChangeKm2',
      'areaRateKm2PerMin',
      'evolutionConfidence'
    ]
  )
})

test('extracts quantitative temporal evolution features',()=>{
  const features=extractTemporalFeaturesV1({
    evolution:{
      intensityTrend:{
        changeDbz:6,
        rateDbzPerMin:0.5
      },
      areaTrend:{
        changeKm2:12,
        rateKm2PerMin:1
      },
      confidence:0.8
    }
  })

  assert.deepEqual(features,{
    intensityChangeDbz:6,
    intensityRateDbzPerMin:0.5,
    areaChangeKm2:12,
    areaRateKm2PerMin:1,
    evolutionConfidence:0.8
  })
})

test('missing intensity trend remains missing',()=>{
  const features=extractTemporalFeaturesV1({
    evolution:{
      intensityTrend:null,
      areaTrend:{
        changeKm2:5,
        rateKm2PerMin:0.5
      },
      confidence:0.6
    }
  })

  assert.equal(features.intensityChangeDbz,null)
  assert.equal(features.intensityRateDbzPerMin,null)
  assert.equal(features.areaChangeKm2,5)
  assert.equal(features.areaRateKm2PerMin,0.5)
})

test('missing area trend remains missing',()=>{
  const features=extractTemporalFeaturesV1({
    evolution:{
      intensityTrend:{
        changeDbz:-3,
        rateDbzPerMin:-0.25
      },
      areaTrend:null,
      confidence:0.7
    }
  })

  assert.equal(features.areaChangeKm2,null)
  assert.equal(features.areaRateKm2PerMin,null)
  assert.equal(features.intensityChangeDbz,-3)
  assert.equal(features.intensityRateDbzPerMin,-0.25)
})

test('missing evolution remains entirely unknown',()=>{
  const features=extractTemporalFeaturesV1({
    evolution:null
  })

  for(const value of Object.values(features)){
    assert.equal(value,null)
  }
})

test('zero change remains genuine zero',()=>{
  const features=extractTemporalFeaturesV1({
    evolution:{
      intensityTrend:{
        changeDbz:0,
        rateDbzPerMin:0
      },
      areaTrend:{
        changeKm2:0,
        rateKm2PerMin:0
      },
      confidence:1
    }
  })

  assert.equal(features.intensityChangeDbz,0)
  assert.equal(features.intensityRateDbzPerMin,0)
  assert.equal(features.areaChangeKm2,0)
  assert.equal(features.areaRateKm2PerMin,0)
})
