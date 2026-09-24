'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')
const sharp=require('sharp')

const {
  normalizeAemetCompo
}=require('../lib/aemet-compo-evidence')

const {
  detectStormCandidates
}=require('../lib/storm-detector')

test('AEMET COMPO palette normalizes to conservative dBZ lower bounds',async()=>{
  const raw=Buffer.from([
    0,0,252,
    67,131,35,
    255,0,0
  ])

  const image=await sharp(raw,{
    raw:{width:3,height:1,channels:3}
  }).png().toBuffer()

  const field=await normalizeAemetCompo(image,{
    bounds:[0,0,3,1],
    observedAt:0
  })

  assert.deepEqual(
    Array.from(field.reflectivityLowerBoundDbz),
    [12,24,66]
  )
})

test('detector uses 8-neighbour connectivity and emits one deterministic candidate',()=>{
  const field={
    schema:'storm-normalized-evidence/1',
    quantity:'reflectivity',
    units:'dBZ',
    observedAt:'2026-09-23T18:40:00.000Z',
    width:2,
    height:2,
    bounds:[0,0,2,2],
    reflectivityLowerBoundDbz:Float32Array.from([
      24,NaN,
      NaN,30
    ]),
    provenance:{
      provider:'test',
      product:'synthetic',
      method:'test'
    }
  }

  const rows=detectStormCandidates(field,{
    minReflectivityDbz:24
  })

  assert.equal(rows.length,1)
  assert.equal(rows[0].id,'2026-09-23T18:40:00.000Z:1')
  assert.equal(rows[0].properties.detection.pixelCount,2)
})

test('radar echo structures preserve weak coherent echoes without promoting them to storm candidates',()=>{
  const {
    detectRadarEchoStructures,
    detectStormCandidates
  }=require('../lib/storm-detector')

  const field={
    schema:'storm-normalized-evidence/1',
    quantity:'reflectivity',
    units:'dBZ',
    observedAt:'2026-09-23T21:10:00.000Z',
    width:3,
    height:1,
    bounds:[0,0,3,1],
    reflectivityLowerBoundDbz:Float32Array.from([
      12,18,NaN
    ]),
    provenance:{
      provider:'test',
      product:'synthetic',
      method:'test'
    }
  }

  const structures=detectRadarEchoStructures(field,{
    minAreaKm2:0,
    maxAreaKm2:Infinity
  })

  const candidates=detectStormCandidates(field,{
    minAreaKm2:0,
    maxAreaKm2:Infinity
  })

  assert.equal(structures.length,1)
  assert.equal(
    structures[0].properties.detection.method,
    'reflectivity-echo-structure-development-v1'
  )
  assert.equal(
    structures[0].properties.detection.qualification.thresholdDbz,
    12
  )
  assert.equal(structures[0].properties.detection.pixelCount,2)

  assert.equal(candidates.length,0)
})

test('detector preserves estimated reflectivity semantics',()=>{
  const {
    detectStormCandidates
  }=require('../lib/storm-detector')

  const field={
    schema:'storm-normalized-evidence/1',
    quantity:'reflectivity',
    units:'dBZ',
    observedAt:'2026-09-23T18:35:45.000Z',
    width:2,
    height:1,
    bounds:[22,37,24,38],
    reflectivityDbz:Float32Array.from([
      24,
      28.5
    ]),
    provenance:{
      provider:'test',
      product:'RAIN_RATE',
      method:'test-estimated-reflectivity',
      representation:'derived-reflectivity-estimate'
    }
  }

  const rows=detectStormCandidates(field,{
    minAreaKm2:0,
    maxAreaKm2:Infinity
  })

  assert.equal(rows.length,1)

  const detection=rows[0].properties.detection
  const evidence=rows[0].properties.evidence.reflectivity

  assert.equal(
    detection.maxReflectivityDbz,
    28.5
  )

  assert.equal(
    detection.maxReflectivityLowerBoundDbz,
    undefined
  )

  assert.equal(
    evidence.maxDbz,
    28.5
  )

  assert.equal(
    evidence.maxLowerBoundDbz,
    undefined
  )

  assert.equal(
    evidence.representation,
    'derived-reflectivity-estimate'
  )
})
