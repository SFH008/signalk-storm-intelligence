'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  assembleTrainingSample
}=require('../lib/inference-replay-assembly-v2')

function labels(){
  return {
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
  }
}

function observationFeatures(){
  return {
    schema:'storm-inference-observation-features/1',
    values:{
      areaKm2:25,
      maxReflectivityDbz:42,
      reflectivityAvailable:1,
      reflectivityRepresentation:'measurement',
      observationAgeSec:0
    }
  }
}

function temporalFeatures(){
  return {
    schema:'storm-inference-temporal-features/1',
    values:{
      intensityChangeDbz:4,
      intensityRateDbzPerMin:0.4,
      areaChangeKm2:8,
      areaRateKm2PerMin:0.8,
      evolutionConfidence:0.75
    }
  }
}

test('assembles a reproducible training sample',()=>{
  const sample=assembleTrainingSample({
    eventId:'event-001',
    sampleId:'event-001:2026-09-27T12:00:00.000Z',
    observedAt:'2026-09-27T12:00:00.000Z',

    observationFeatures:observationFeatures(),
    temporalFeatures:temporalFeatures(),

    labels:labels(),

    evidenceBundle:'bundle-001',
    evidenceRevision:'storm-normalized-evidence/1',
    codeRevision:'abc123',
    reviewRevision:'1'
  })

  assert.equal(
    sample.schema,
    'storm-inference-training-sample/1'
  )

  assert.equal(sample.eventId,'event-001')
  assert.equal(
    sample.features.observation.schema,
    'storm-inference-observation-features/1'
  )
  assert.equal(
    sample.features.temporal.schema,
    'storm-inference-temporal-features/1'
  )

  assert.equal(
    sample.provenance.evidenceBundle,
    'bundle-001'
  )

  assert.equal(
    sample.provenance.codeRevision,
    'abc123'
  )
})

test('missing event identity is rejected',()=>{
  assert.throws(
    ()=>assembleTrainingSample({
      eventId:null,
      sampleId:'sample-1',
      observedAt:'2026-09-27T12:00:00Z',
      observationFeatures:observationFeatures(),
      temporalFeatures:temporalFeatures(),
      labels:labels(),
      evidenceBundle:'bundle',
      evidenceRevision:'1',
      codeRevision:'abc',
      reviewRevision:'1'
    }),
    /eventId/
  )
})

test('missing sample identity is rejected',()=>{
  assert.throws(
    ()=>assembleTrainingSample({
      eventId:'event-1',
      sampleId:null,
      observedAt:'2026-09-27T12:00:00Z',
      observationFeatures:observationFeatures(),
      temporalFeatures:temporalFeatures(),
      labels:labels(),
      evidenceBundle:'bundle',
      evidenceRevision:'1',
      codeRevision:'abc',
      reviewRevision:'1'
    }),
    /sampleId/
  )
})

test('invalid feature schema is rejected',()=>{
  const observation=observationFeatures()
  observation.schema='wrong-schema'

  assert.throws(
    ()=>assembleTrainingSample({
      eventId:'event-1',
      sampleId:'sample-1',
      observedAt:'2026-09-27T12:00:00Z',
      observationFeatures:observation,
      temporalFeatures:temporalFeatures(),
      labels:labels(),
      evidenceBundle:'bundle',
      evidenceRevision:'1',
      codeRevision:'abc',
      reviewRevision:'1'
    }),
    /observation feature schema/
  )
})

test('invalid labels are rejected through training contract',()=>{
  const bad=labels()

  bad.convectiveCell={
    value:true,
    source:'maxReflectivityDbz>=40',
    confidence:1
  }

  assert.throws(
    ()=>assembleTrainingSample({
      eventId:'event-1',
      sampleId:'sample-1',
      observedAt:'2026-09-27T12:00:00Z',
      observationFeatures:observationFeatures(),
      temporalFeatures:temporalFeatures(),
      labels:bad,
      evidenceBundle:'bundle',
      evidenceRevision:'1',
      codeRevision:'abc',
      reviewRevision:'1'
    }),
    /label source/
  )
})

test('replay provenance is mandatory',()=>{
  assert.throws(
    ()=>assembleTrainingSample({
      eventId:'event-1',
      sampleId:'sample-1',
      observedAt:'2026-09-27T12:00:00Z',
      observationFeatures:observationFeatures(),
      temporalFeatures:temporalFeatures(),
      labels:labels(),
      evidenceBundle:null,
      evidenceRevision:'1',
      codeRevision:'abc',
      reviewRevision:'1'
    }),
    /evidenceBundle/
  )

  assert.throws(
    ()=>assembleTrainingSample({
      eventId:'event-1',
      sampleId:'sample-1',
      observedAt:'2026-09-27T12:00:00Z',
      observationFeatures:observationFeatures(),
      temporalFeatures:temporalFeatures(),
      labels:labels(),
      evidenceBundle:'bundle',
      evidenceRevision:'1',
      codeRevision:null,
      reviewRevision:'1'
    }),
    /codeRevision/
  )
})

test('assembly is deterministic',()=>{
  const input={
    eventId:'event-1',
    sampleId:'sample-1',
    observedAt:'2026-09-27T12:00:00Z',
    observationFeatures:observationFeatures(),
    temporalFeatures:temporalFeatures(),
    labels:labels(),
    evidenceBundle:'bundle',
    evidenceRevision:'1',
    codeRevision:'abc',
    reviewRevision:'1'
  }

  const a=assembleTrainingSample(input)
  const b=assembleTrainingSample(input)

  assert.deepEqual(a,b)
})
