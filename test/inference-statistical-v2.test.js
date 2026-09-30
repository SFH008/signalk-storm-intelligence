'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  createLogisticInferenceModel,
  sigmoid
}=require('../lib/inference-statistical-v2')

test('sigmoid provides deterministic logistic transform',()=>{
  assert.equal(sigmoid(0),0.5)
  assert.ok(sigmoid(2)>sigmoid(1))
  assert.ok(sigmoid(-2)<sigmoid(-1))
})

test('statistical model requires an exact declared feature schema',async()=>{
  const model=createLogisticInferenceModel({
    id:'convective-reference',
    version:'1',
    featureSchema:['maxReflectivityDbz','areaKm2'],
    coefficients:{
      intercept:-1,
      maxReflectivityDbz:0.1,
      areaKm2:0.01
    }
  })

  await assert.rejects(
    ()=>model.infer({
      stage:'observation',
      features:{
        maxReflectivityDbz:40
      }
    }),
    /missing feature: areaKm2/
  )
})

test('missing feature is not silently converted to zero',async()=>{
  const model=createLogisticInferenceModel({
    id:'missingness-check',
    version:'1',
    featureSchema:['a','b'],
    coefficients:{
      intercept:0,
      a:1,
      b:1
    }
  })

  await assert.rejects(
    ()=>model.infer({
      stage:'observation',
      features:{
        a:1,
        b:null
      }
    }),
    /missing feature: b/
  )
})

test('uncalibrated logistic output is not exposed as calibrated probability',async()=>{
  const model=createLogisticInferenceModel({
    id:'uncalibrated-model',
    version:'1',
    featureSchema:['x'],
    coefficients:{
      intercept:0,
      x:1
    }
  })

  const result=await model.infer({
    stage:'observation',
    features:{x:1}
  })

  assert.ok(result.modelScore>0)
  assert.ok(result.modelScore<1)
  assert.equal(result.probability,null)
  assert.equal(result.calibrated,false)
})

test('probability is exposed only through validated fitted calibration',async()=>{
  const model=createLogisticInferenceModel({
    id:'calibrated-model',
    version:'2',
    featureSchema:['x'],
    coefficients:{
      intercept:0,
      x:1
    },
    calibration:{
      validated:true,
      method:'platt',
      validationId:'replay-set-001',
      parameters:{
        slope:2,
        intercept:-1
      }
    }
  })

  const result=await model.infer({
    stage:'observation',
    features:{x:1}
  })

  const expected=
    1/(1+Math.exp(
      -(2*result.modelScore-1)
    ))

  assert.equal(result.calibrated,true)
  assert.ok(
    Math.abs(result.probability-expected)<1e-12
  )

  assert.notEqual(
    result.probability,
    result.modelScore
  )

  assert.equal(
    result.model.calibration.validationId,
    'replay-set-001'
  )
})

test('validated calibration without fitted parameters is rejected',async()=>{
  const model=createLogisticInferenceModel({
    id:'invalid-calibration',
    version:'1',
    featureSchema:['x'],
    coefficients:{
      intercept:0,
      x:1
    },
    calibration:{
      validated:true,
      method:'platt',
      validationId:'replay-set-002'
    }
  })

  await assert.rejects(
    ()=>model.infer({
      stage:'observation',
      features:{x:1}
    }),
    /parameters/
  )
})

test('model result preserves reproducibility metadata',async()=>{
  const model=createLogisticInferenceModel({
    id:'reference-logistic',
    version:'3',
    checksum:'sha256:test',
    featureSchema:['x'],
    coefficients:{
      intercept:0,
      x:0.5
    }
  })

  const result=await model.infer({
    stage:'observation',
    features:{x:2}
  })

  assert.equal(result.model.id,'reference-logistic')
  assert.equal(result.model.type,'statistical')
  assert.equal(result.model.version,'3')
  assert.equal(result.model.checksum,'sha256:test')
  assert.deepEqual(result.model.featureSchema,['x'])
})

test('provider identity has no role in statistical inference',async()=>{
  const model=createLogisticInferenceModel({
    id:'provider-neutral',
    version:'1',
    featureSchema:['x'],
    coefficients:{
      intercept:-1,
      x:0.25
    }
  })

  const a=await model.infer({
    stage:'observation',
    features:{x:8},
    provenance:{provider:'aemet'}
  })

  const b=await model.infer({
    stage:'observation',
    features:{x:8},
    provenance:{provider:'some-future-provider'}
  })

  assert.equal(a.modelScore,b.modelScore)
  assert.equal(a.probability,b.probability)
})
