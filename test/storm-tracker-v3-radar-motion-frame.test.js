'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  motionFrameFromNormalizedRadarEvidence
}=require('../lib/storm-tracker-v3/radar-motion-frame')

test('builds motion frame from provider-neutral normalized radar evidence',()=>{
  const evidence={
    schema:'storm-normalized-evidence/1',
    domain:'radar',
    quantity:'reflectivity',
    units:'dBZ',
    width:3,
    height:2,
    bounds:[-10,35,-5,40],
    values:new Float32Array([
      NaN,25,30,
      NaN,35,40
    ]),
    motionBackgroundMask:new Uint8Array([
      1,0,0,
      1,0,0
    ])
  }

  const frame=
    motionFrameFromNormalizedRadarEvidence(evidence)

  assert.equal(frame.width,3)
  assert.equal(frame.height,2)

  assert.deepEqual(
    Array.from(frame.values),
    [0,25,30,0,35,40]
  )
})

test('unavailable pixels remain unavailable',()=>{
  const evidence={
    schema:'storm-normalized-evidence/1',
    domain:'radar',
    quantity:'reflectivity',
    units:'dBZ',
    width:2,
    height:2,
    bounds:[-10,35,-5,40],
    values:new Float32Array([
      NaN,25,
      NaN,30
    ]),
    motionBackgroundMask:new Uint8Array([
      0,0,
      0,0
    ])
  }

  const frame=
    motionFrameFromNormalizedRadarEvidence(evidence)

  assert.equal(
    Number.isNaN(frame.values[0]),
    true
  )

  assert.equal(
    Number.isNaN(frame.values[2]),
    true
  )
})

test('known background never overwrites real reflectivity',()=>{
  const evidence={
    schema:'storm-normalized-evidence/1',
    domain:'radar',
    quantity:'reflectivity',
    units:'dBZ',
    width:2,
    height:1,
    bounds:[-10,35,-5,40],
    values:new Float32Array([25,30]),
    motionBackgroundMask:new Uint8Array([1,1])
  }

  const frame=
    motionFrameFromNormalizedRadarEvidence(evidence)

  assert.deepEqual(
    Array.from(frame.values),
    [25,30]
  )
})

test('rejects inconsistent motion background dimensions',()=>{
  const evidence={
    schema:'storm-normalized-evidence/1',
    domain:'radar',
    quantity:'reflectivity',
    units:'dBZ',
    width:2,
    height:2,
    bounds:[-10,35,-5,40],
    values:new Float32Array(4),
    motionBackgroundMask:new Uint8Array(3)
  }

  assert.throws(
    ()=>motionFrameFromNormalizedRadarEvidence(evidence),
    /dimensions/
  )
})

test('rejects non-radar normalized evidence',()=>{
  assert.throws(
    ()=>motionFrameFromNormalizedRadarEvidence({
      schema:'storm-normalized-evidence/1',
      domain:'lightning',
      quantity:'reflectivity',
      units:'dBZ',
      width:1,
      height:1,
      bounds:[0,0,1,1],
      values:new Float32Array([1]),
      motionBackgroundMask:new Uint8Array([0])
    }),
    /normalized radar evidence/
  )
})
