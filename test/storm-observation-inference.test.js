'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  attachObservationInference
}=require('../lib/storm-observation-inference')

function observation(){
  return {
    type:'Feature',
    id:'2026-09-27T12:00:00.000Z:1',
    geometry:{
      type:'Polygon',
      coordinates:[[
        [-8,40],[-7.9,40],[-7.9,40.1],
        [-8,40.1],[-8,40]
      ]]
    },
    properties:{
      sourceId:'2026-09-27T12:00:00.000Z:1',
      observedAt:'2026-09-27T12:00:00.000Z',
      detection:{
        areaKm2:25
      },
      evidence:{
        reflectivity:{
          available:true,
          units:'dBZ',
          maxDbz:42,
          representation:'measurement'
        }
      }
    }
  }
}

function inference({
  accepted=true
}={}){
  return {
    schema:'storm-inference/2',
    stage:'observation',
    accepted,
    classification:{
      convectiveCell:{
        value:true,
        confidence:.7
      }
    },
    contributions:[],
    provenance:{
      engine:'inference-engine-v2'
    }
  }
}

test('attaches provider-neutral inference without altering physical observation',()=>{
  const source=observation()
  const result=attachObservationInference(
    source,
    inference()
  )

  assert.notStrictEqual(result,source)

  assert.deepEqual(
    result.geometry,
    source.geometry
  )

  assert.equal(
    result.properties.sourceId,
    source.properties.sourceId
  )

  assert.deepEqual(
    result.properties.evidence,
    source.properties.evidence
  )

  assert.equal(
    result.properties.inference.schema,
    'storm-inference/2'
  )

  assert.equal(
    result.properties.inference.accepted,
    true
  )

  assert.equal(
    result.properties.inference
      .classification.convectiveCell.value,
    true
  )
})

test('rejects non-v2 inference output',()=>{
  assert.throws(
    ()=>attachObservationInference(
      observation(),
      {
        schema:'legacy-inference'
      }
    ),
    /storm-inference\/2/
  )
})

test('preserves unknown acceptance rather than converting it to false',()=>{
  const result=attachObservationInference(
    observation(),
    inference({
      accepted:null
    })
  )

  assert.equal(
    result.properties.inference.accepted,
    null
  )
})

test('does not introduce vessel-relative fields',()=>{
  const result=attachObservationInference(
    observation(),
    inference()
  )

  for(const forbidden of [
    'vessel',
    'threat',
    'cpa',
    'tcpa'
  ]){
    assert.equal(
      Object.hasOwn(
        result.properties,
        forbidden
      ),
      false
    )
  }
})

test('only explicit accepted true is eligible for temporal storm tracking',()=>{
  const {
    isAcceptedStormObservation
  }=require('../lib/storm-observation-inference')

  const accepted=attachObservationInference(
    observation(),
    inference({
      accepted:true
    })
  )

  const unknown=attachObservationInference(
    observation(),
    inference({
      accepted:null
    })
  )

  const rejected=attachObservationInference(
    observation(),
    inference({
      accepted:false
    })
  )

  assert.equal(
    isAcceptedStormObservation(accepted),
    true
  )

  assert.equal(
    isAcceptedStormObservation(unknown),
    false
  )

  assert.equal(
    isAcceptedStormObservation(rejected),
    false
  )
})

test('observation without v2 inference is not accepted implicitly',()=>{
  const {
    isAcceptedStormObservation
  }=require('../lib/storm-observation-inference')

  assert.equal(
    isAcceptedStormObservation(
      observation()
    ),
    false
  )
})
