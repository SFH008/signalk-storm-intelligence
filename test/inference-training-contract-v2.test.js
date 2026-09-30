'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  validateTrainingSample,
  validateEventSplit,
  validateLabel
}=require('../lib/inference-training-contract-v2')

function baseSample(){
  return {
    schema:'storm-inference-training-sample/1',

    eventId:'event-001',
    sampleId:'event-001:2026-09-27T12:00:00.000Z',

    observedAt:'2026-09-27T12:00:00.000Z',

    features:{
      observation:{
        schema:'storm-inference-observation-features/1',
        values:{
          areaKm2:25,
          maxReflectivityDbz:42,
          reflectivityAvailable:1,
          reflectivityRepresentation:'measurement',
          observationAgeSec:0
        }
      },

      temporal:{
        schema:'storm-inference-temporal-features/1',
        values:{
          intensityChangeDbz:4,
          intensityRateDbzPerMin:0.4,
          areaChangeKm2:10,
          areaRateKm2PerMin:1,
          evolutionConfidence:0.8
        }
      }
    },

    labels:{
      convectiveCell:{
        value:true,
        source:'human-reviewed',
        confidence:1
      },

      thunderstorm:{
        value:null,
        source:null,
        confidence:null
      },

      heavyRain:{
        value:null,
        source:null,
        confidence:null
      },

      squallPotential:{
        value:null,
        source:null,
        confidence:null
      }
    },

    provenance:{
      evidenceBundle:'bundle-001',
      reviewRevision:'1'
    }
  }
}

test('valid training sample requires event and sample identity',()=>{
  const sample=baseSample()

  assert.doesNotThrow(
    ()=>validateTrainingSample(sample)
  )
})

test('missing eventId is rejected',()=>{
  const sample=baseSample()
  delete sample.eventId

  assert.throws(
    ()=>validateTrainingSample(sample),
    /eventId/
  )
})

test('unknown label remains explicit null',()=>{
  assert.doesNotThrow(
    ()=>validateLabel({
      value:null,
      source:null,
      confidence:null
    })
  )
})

test('label must not be inferred implicitly from feature thresholds',()=>{
  assert.throws(
    ()=>validateLabel({
      value:true,
      source:'maxReflectivityDbz>=40',
      confidence:1
    }),
    /label source/
  )
})

test('accepted ground-truth label sources are explicit',()=>{
  for(const source of [
    'human-reviewed',
    'authoritative-observation',
    'verified-event-record'
  ]){
    assert.doesNotThrow(
      ()=>validateLabel({
        value:true,
        source,
        confidence:1
      })
    )
  }
})

test('train and test sets may not contain the same event',()=>{
  assert.throws(
    ()=>validateEventSplit({
      trainEventIds:['a','b'],
      calibrationEventIds:['c'],
      testEventIds:['b','d']
    }),
    /event leakage/
  )
})

test('train calibration and test event sets are disjoint',()=>{
  assert.doesNotThrow(
    ()=>validateEventSplit({
      trainEventIds:['a','b'],
      calibrationEventIds:['c'],
      testEventIds:['d','e']
    })
  )
})

test('duplicate event inside one split is rejected',()=>{
  assert.throws(
    ()=>validateEventSplit({
      trainEventIds:['a','a'],
      calibrationEventIds:['b'],
      testEventIds:['c']
    }),
    /duplicate event/
  )
})

test('labels are independent for each phenomenon',()=>{
  const sample=baseSample()

  sample.labels.convectiveCell={
    value:true,
    source:'human-reviewed',
    confidence:1
  }

  sample.labels.thunderstorm={
    value:false,
    source:'human-reviewed',
    confidence:1
  }

  sample.labels.heavyRain={
    value:true,
    source:'authoritative-observation',
    confidence:1
  }

  sample.labels.squallPotential={
    value:null,
    source:null,
    confidence:null
  }

  assert.doesNotThrow(
    ()=>validateTrainingSample(sample)
  )
})
