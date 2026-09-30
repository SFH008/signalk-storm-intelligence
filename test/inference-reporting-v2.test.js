'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  summarizeDataset,
  summarizeFeatureCompleteness
}=require('../lib/inference-reporting-v2')

function sample({
  eventId='event-1',
  convective=true,
  convectiveSource='human-reviewed',
  areaKm2=20,
  maxReflectivityDbz=40,
  intensityChangeDbz=3
}={}){
  return {
    eventId,

    features:{
      observation:{
        values:{
          areaKm2,
          maxReflectivityDbz,
          reflectivityAvailable:
            maxReflectivityDbz == null ? 0 : 1,
          reflectivityRepresentation:'measurement',
          observationAgeSec:0
        }
      },

      temporal:{
        values:{
          intensityChangeDbz,
          intensityRateDbzPerMin:
            intensityChangeDbz == null ? null : 0.3,
          areaChangeKm2:5,
          areaRateKm2PerMin:0.5,
          evolutionConfidence:0.8
        }
      }
    },

    labels:{
      convectiveCell:{
        value:convective,
        source:
          convective == null
            ? null
            : convectiveSource,
        confidence:
          convective == null
            ? null
            : 1
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
}

test('dataset summary counts samples and unique events',()=>{
  const result=summarizeDataset([
    sample({eventId:'a'}),
    sample({eventId:'a'}),
    sample({eventId:'b'})
  ])

  assert.equal(result.samples,3)
  assert.equal(result.events,2)
})

test('dataset summary reports known and unknown labels',()=>{
  const result=summarizeDataset([
    sample({convective:true}),
    sample({convective:false}),
    sample({convective:null})
  ])

  const c=result.labels.convectiveCell

  assert.equal(c.known,2)
  assert.equal(c.unknown,1)
  assert.equal(c.positive,1)
  assert.equal(c.negative,1)
})

test('dataset summary reports label source distribution',()=>{
  const result=summarizeDataset([
    sample({
      convective:true,
      convectiveSource:'human-reviewed'
    }),
    sample({
      convective:false,
      convectiveSource:'authoritative-observation'
    }),
    sample({
      convective:null
    })
  ])

  const sources=
    result.labels.convectiveCell.sources

  assert.equal(sources['human-reviewed'],1)
  assert.equal(sources['authoritative-observation'],1)
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      sources,
      'null'
    ),
    false
  )
})

test('feature completeness reports missing values',()=>{
  const result=summarizeFeatureCompleteness([
    sample({
      areaKm2:20,
      maxReflectivityDbz:40,
      intensityChangeDbz:3
    }),
    sample({
      areaKm2:null,
      maxReflectivityDbz:null,
      intensityChangeDbz:null
    })
  ])

  assert.equal(
    result.observation.areaKm2.available,
    1
  )

  assert.equal(
    result.observation.areaKm2.missing,
    1
  )

  assert.equal(
    result.observation.areaKm2.missingRate,
    0.5
  )

  assert.equal(
    result.observation.maxReflectivityDbz.missingRate,
    0.5
  )

  assert.equal(
    result.temporal.intensityChangeDbz.missingRate,
    0.5
  )
})

test('genuine numeric zero is counted as available',()=>{
  const s=sample({
    areaKm2:0,
    maxReflectivityDbz:0,
    intensityChangeDbz:0
  })

  const result=summarizeFeatureCompleteness([s])

  assert.equal(
    result.observation.areaKm2.available,
    1
  )

  assert.equal(
    result.observation.maxReflectivityDbz.available,
    1
  )

  assert.equal(
    result.temporal.intensityChangeDbz.available,
    1
  )
})

test('empty dataset remains explicit',()=>{
  const dataset=summarizeDataset([])
  const features=summarizeFeatureCompleteness([])

  assert.equal(dataset.samples,0)
  assert.equal(dataset.events,0)

  assert.equal(
    features.observation.areaKm2.available,
    0
  )

  assert.equal(
    features.observation.areaKm2.missingRate,
    null
  )
})
