'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  fitLogisticRegression
}=require('../lib/inference-logistic-fit-v2')

const {
  createLogisticInferenceModel
}=require('../lib/inference-statistical-v2')

test('learns a simple one-feature separable problem',()=>{
  const fit=fitLogisticRegression({
    featureSchema:['x'],
    rows:[
      {features:{x:-2},target:false},
      {features:{x:-1},target:false},
      {features:{x:1}, target:true},
      {features:{x:2}, target:true}
    ],
    learningRate:0.1,
    maxIterations:2000,
    tolerance:1e-9
  })

  assert.ok(fit.coefficients.x>0)
  assert.ok(Number.isFinite(fit.coefficients.intercept))
  assert.ok(Number.isFinite(fit.training.finalLoss))
  assert.ok(fit.training.iterations>0)
})

test('preserves declared feature order and coefficients',()=>{
  const fit=fitLogisticRegression({
    featureSchema:['a','b'],
    rows:[
      {features:{a:-2,b:-1},target:false},
      {features:{a:-1,b:-2},target:false},
      {features:{a:1,b:2},target:true},
      {features:{a:2,b:1},target:true}
    ],
    learningRate:0.1,
    maxIterations:1500
  })

  assert.deepEqual(
    fit.featureSchema,
    ['a','b']
  )

  assert.ok(
    Object.prototype.hasOwnProperty.call(
      fit.coefficients,
      'a'
    )
  )

  assert.ok(
    Object.prototype.hasOwnProperty.call(
      fit.coefficients,
      'b'
    )
  )
})

test('fitting is deterministic',()=>{
  const options={
    featureSchema:['x'],
    rows:[
      {features:{x:-2},target:false},
      {features:{x:-1},target:false},
      {features:{x:1}, target:true},
      {features:{x:2}, target:true}
    ],
    learningRate:0.05,
    maxIterations:500
  }

  const a=fitLogisticRegression(options)
  const b=fitLogisticRegression(options)

  assert.deepEqual(a,b)
})

test('missing training feature is rejected',()=>{
  assert.throws(
    ()=>fitLogisticRegression({
      featureSchema:['a','b'],
      rows:[
        {features:{a:1,b:null},target:true}
      ]
    }),
    /missing feature: b/
  )
})

test('non-finite training feature is rejected',()=>{
  assert.throws(
    ()=>fitLogisticRegression({
      featureSchema:['x'],
      rows:[
        {features:{x:Infinity},target:true}
      ]
    }),
    /missing feature: x/
  )
})

test('unknown target is rejected',()=>{
  assert.throws(
    ()=>fitLogisticRegression({
      featureSchema:['x'],
      rows:[
        {features:{x:1},target:null}
      ]
    }),
    /target/
  )
})

test('non-boolean target is rejected',()=>{
  assert.throws(
    ()=>fitLogisticRegression({
      featureSchema:['x'],
      rows:[
        {features:{x:1},target:1}
      ]
    }),
    /target/
  )
})

test('fit output does not claim calibration',()=>{
  const fit=fitLogisticRegression({
    featureSchema:['x'],
    rows:[
      {features:{x:-1},target:false},
      {features:{x:1},target:true}
    ],
    maxIterations:100
  })

  assert.equal(fit.calibration,null)
  assert.equal(fit.training.calibrated,false)
})

test('fit output plugs into statistical inference model',async()=>{
  const fit=fitLogisticRegression({
    featureSchema:['x'],
    rows:[
      {features:{x:-2},target:false},
      {features:{x:-1},target:false},
      {features:{x:1},target:true},
      {features:{x:2},target:true}
    ],
    learningRate:0.1,
    maxIterations:1000
  })

  const model=createLogisticInferenceModel({
    id:'synthetic-fit',
    version:'1',
    featureSchema:fit.featureSchema,
    coefficients:fit.coefficients,
    calibration:fit.calibration
  })

  const negative=await model.infer({
    stage:'observation',
    features:{x:-2}
  })

  const positive=await model.infer({
    stage:'observation',
    features:{x:2}
  })

  assert.ok(
    positive.modelScore >
    negative.modelScore
  )

  assert.equal(positive.probability,null)
  assert.equal(positive.calibrated,false)
})
