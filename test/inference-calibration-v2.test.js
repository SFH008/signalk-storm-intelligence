'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  applyPlattCalibration
}=require('../lib/inference-calibration-v2')

test('Platt calibration applies an explicit fitted transform',()=>{
  const p=applyPlattCalibration(
    0.5,
    {
      validated:true,
      method:'platt',
      parameters:{
        slope:2,
        intercept:-1
      }
    }
  )

  assert.ok(Math.abs(p-0.5)<1e-12)
})

test('validated calibration without fitted parameters is rejected',()=>{
  assert.throws(
    ()=>applyPlattCalibration(
      0.5,
      {
        validated:true,
        method:'platt'
      }
    ),
    /parameters/
  )
})

test('unvalidated calibration cannot produce probability',()=>{
  assert.equal(
    applyPlattCalibration(
      0.5,
      {
        validated:false,
        method:'platt',
        parameters:{
          slope:2,
          intercept:-1
        }
      }
    ),
    null
  )
})

test('calibrated probability remains bounded',()=>{
  for(const score of [-100,0,100]){
    const p=applyPlattCalibration(
      score,
      {
        validated:true,
        method:'platt',
        parameters:{
          slope:1,
          intercept:0
        }
      }
    )

    assert.ok(p>=0)
    assert.ok(p<=1)
  }
})

test('unsupported calibration method is rejected',()=>{
  assert.throws(
    ()=>applyPlattCalibration(
      0.5,
      {
        validated:true,
        method:'magic',
        parameters:{
          slope:1,
          intercept:0
        }
      }
    ),
    /method/
  )
})
