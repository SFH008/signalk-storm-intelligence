'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  buildStormObservations
}=require('../lib/storm-observation')

test('storm-observation preserves lower-bound detector Feature shape',()=>{
  const geometry={
    type:'Polygon',
    coordinates:[[
      [1,2],
      [2,2],
      [2,1],
      [1,1],
      [1,2]
    ]]
  }

  const rows=[
    {
      component:[0,1],
      areaKm2:12.5,
      bbox:[1,1,2,2],
      geometry,
      maxReflectivityDbz:30
    }
  ]

  const field={
    schema:'storm-normalized-evidence/1',
    domain:'radar',
    quantity:'reflectivity',
    units:'dBZ',
    observedAt:'2026-09-26T10:00:00.000Z',
    provenance:{
      provider:'test-provider',
      product:'TEST',
      method:'test-normalizer'
    }
  }

  const result=buildStormObservations(
    rows,
    field,
    {
      method:'reflectivity-threshold-development-v1',
      minReflectivityDbz:24,
      representation:'lower-bound',
      isLowerBound:true
    }
  )

  assert.deepEqual(
    result,
    [
      {
        type:'Feature',
        id:'2026-09-26T10:00:00.000Z:1',
        geometry,
        properties:{
          sourceId:'2026-09-26T10:00:00.000Z:1',
          observedAt:'2026-09-26T10:00:00.000Z',
          detection:{
            method:'reflectivity-threshold-development-v1',
            qualification:{
              quantity:'reflectivity',
              operator:'>=',
              thresholdDbz:24
            },
            pixelCount:2,
            areaKm2:12.5,
            bbox:[1,1,2,2],
            maxReflectivityDbz:30,
            maxReflectivityLowerBoundDbz:30
          },
          evidence:{
            reflectivity:{
              available:true,
              units:'dBZ',
              maxDbz:30,
              representation:'lower-bound',
              maxLowerBoundDbz:30,
              provenance:{
                provider:'test-provider',
                product:'TEST',
                method:'test-normalizer'
              }
            }
          }
        }
      }
    ]
  )
})

test('storm-observation preserves estimate semantics without lower-bound fields',()=>{
  const geometry={
    type:'Polygon',
    coordinates:[[
      [22,39],
      [23,39],
      [23,38],
      [22,38],
      [22,39]
    ]]
  }

  const result=buildStormObservations(
    [
      {
        component:[10],
        areaKm2:4.25,
        bbox:[22,38,23,39],
        geometry,
        maxReflectivityDbz:28.5
      }
    ],
    {
      schema:'storm-normalized-evidence/1',
      domain:'radar',
      quantity:'reflectivity',
      units:'dBZ',
      observedAt:'2026-09-26T10:05:00.000Z',
      provenance:{
        provider:'test-provider',
        product:'RAIN',
        representation:'derived-reflectivity-estimate'
      }
    },
    {
      method:'reflectivity-threshold-development-v1',
      minReflectivityDbz:24,
      representation:'estimate',
      isLowerBound:false
    }
  )

  assert.equal(result.length,1)

  const feature=result[0]

  assert.equal(
    feature.id,
    '2026-09-26T10:05:00.000Z:1'
  )

  assert.equal(
    feature.properties.detection.maxReflectivityDbz,
    28.5
  )

  assert.equal(
    feature.properties.detection.maxReflectivityLowerBoundDbz,
    undefined
  )

  assert.equal(
    feature.properties.evidence.reflectivity.maxDbz,
    28.5
  )

  assert.equal(
    feature.properties.evidence.reflectivity.maxLowerBoundDbz,
    undefined
  )

  assert.equal(
    feature.properties.evidence.reflectivity.representation,
    'estimate'
  )
})

test('storm-observation source identity is deterministic within a frame',()=>{
  const geometry={
    type:'Polygon',
    coordinates:[[
      [0,1],
      [1,1],
      [1,0],
      [0,0],
      [0,1]
    ]]
  }

  const rows=[
    {
      component:[0],
      areaKm2:1,
      bbox:[0,0,1,1],
      geometry,
      maxReflectivityDbz:25
    },
    {
      component:[1],
      areaKm2:2,
      bbox:[1,0,2,1],
      geometry,
      maxReflectivityDbz:26
    }
  ]

  const field={
    schema:'storm-normalized-evidence/1',
    observedAt:'2026-09-26T10:10:00.000Z',
    provenance:{provider:'test'}
  }

  const options={
    method:'test-observation-method',
    minReflectivityDbz:24,
    representation:'measurement',
    isLowerBound:false
  }

  const first=buildStormObservations(rows,field,options)
  const second=buildStormObservations(rows,field,options)

  assert.deepEqual(
    first.map(row=>row.id),
    [
      '2026-09-26T10:10:00.000Z:1',
      '2026-09-26T10:10:00.000Z:2'
    ]
  )

  assert.deepEqual(first,second)
})

test('storm-observation rejects persistent or scientific work outside its boundary',()=>{
  assert.throws(
    ()=>buildStormObservations(
      [],
      {schema:'not-normalized'},
      {
        method:'test',
        minReflectivityDbz:24,
        representation:'measurement'
      }
    ),
    /Normalized storm evidence v1/
  )

  assert.throws(
    ()=>buildStormObservations(
      [],
      {schema:'storm-normalized-evidence/1'},
      {
        minReflectivityDbz:24,
        representation:'measurement'
      }
    ),
    /Observation method/
  )
})
