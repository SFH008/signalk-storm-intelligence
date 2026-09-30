'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  evaluateBinaryClassification,
  brierScore,
  calibrationBins
}=require('../lib/inference-evaluation-v2')

test('computes binary classification counts and rates',()=>{
  const result=evaluateBinaryClassification([
    {truth:true,  predicted:true},
    {truth:true,  predicted:false},
    {truth:false, predicted:true},
    {truth:false, predicted:false}
  ])

  assert.equal(result.tp,1)
  assert.equal(result.fn,1)
  assert.equal(result.fp,1)
  assert.equal(result.tn,1)

  assert.equal(result.precision,0.5)
  assert.equal(result.recall,0.5)
  assert.equal(result.falsePositiveRate,0.5)
  assert.equal(result.falseNegativeRate,0.5)
})

test('unknown truth is excluded rather than treated as negative',()=>{
  const result=evaluateBinaryClassification([
    {truth:true, predicted:true},
    {truth:null, predicted:false}
  ])

  assert.equal(result.evaluated,1)
  assert.equal(result.excluded,1)
  assert.equal(result.tp,1)
  assert.equal(result.tn,0)
})

test('unknown prediction is excluded rather than treated as negative',()=>{
  const result=evaluateBinaryClassification([
    {truth:true, predicted:null},
    {truth:false, predicted:false}
  ])

  assert.equal(result.evaluated,1)
  assert.equal(result.excluded,1)
  assert.equal(result.tn,1)
  assert.equal(result.fn,0)
})

test('undefined denominator remains null',()=>{
  const result=evaluateBinaryClassification([
    {truth:false,predicted:false}
  ])

  assert.equal(result.precision,null)
  assert.equal(result.recall,null)
  assert.equal(result.falsePositiveRate,0)
  assert.equal(result.falseNegativeRate,null)
})

test('non-boolean known values are rejected',()=>{
  assert.throws(
    ()=>evaluateBinaryClassification([
      {truth:'yes',predicted:true}
    ]),
    /truth/
  )

  assert.throws(
    ()=>evaluateBinaryClassification([
      {truth:true,predicted:1}
    ]),
    /predicted/
  )
})


test('computes Brier score from known truth/probability pairs',()=>{
  const result=brierScore([
    {truth:true, probability:0.8},
    {truth:false, probability:0.3}
  ])

  assert.equal(result.evaluated,2)
  assert.equal(result.excluded,0)

  assert.ok(
    Math.abs(result.score-0.065)<1e-12
  )
})

test('Brier score excludes unknown values',()=>{
  const result=brierScore([
    {truth:true, probability:0.8},
    {truth:null, probability:0.5},
    {truth:false, probability:null}
  ])

  assert.equal(result.evaluated,1)
  assert.equal(result.excluded,2)
  assert.ok(
    Math.abs(result.score-0.04)<1e-12
  )
})

test('probability outside [0,1] is rejected',()=>{
  assert.throws(
    ()=>brierScore([
      {truth:true,probability:1.1}
    ]),
    /probability/
  )

  assert.throws(
    ()=>brierScore([
      {truth:false,probability:-0.1}
    ]),
    /probability/
  )
})

test('calibration bins report observed rate and mean probability',()=>{
  const bins=calibrationBins([
    {truth:false,probability:0.1},
    {truth:true, probability:0.2},
    {truth:true, probability:0.8},
    {truth:true, probability:0.9}
  ],2)

  assert.equal(bins.length,2)

  assert.equal(bins[0].count,2)
  assert.ok(
    Math.abs(bins[0].meanProbability-0.15)<1e-12
  )
  assert.equal(bins[0].observedRate,0.5)

  assert.equal(bins[1].count,2)
  assert.ok(
    Math.abs(bins[1].meanProbability-0.85)<1e-12
  )
  assert.equal(bins[1].observedRate,1)
})

test('empty calibration bins remain explicit',()=>{
  const bins=calibrationBins([
    {truth:true,probability:0.95}
  ],4)

  assert.equal(bins.length,4)

  const empty=bins.find(bin=>bin.count===0)

  assert.ok(empty)
  assert.equal(empty.meanProbability,null)
  assert.equal(empty.observedRate,null)
})
