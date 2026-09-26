'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  haversine,
  bearing,
  velocityBetween,
  localVectorMeters,
  localPoint,
  robustTrackVelocity,
  normalizeLongitude,
  unwrapLongitude
}=require('../lib/storm-motion')

test('distance and bearing preserve geographic baseline',()=>{
  const a=[0,0]
  const b=[1,0]

  assert.ok(
    Math.abs(haversine(a,b)-111195)<100
  )

  assert.ok(
    Math.abs(bearing(a,b)-90)<1e-9
  )
})

test('local vector and local point round-trip',()=>{
  const origin=[12,40]
  const target=[12.15,40.10]

  const v=
    localVectorMeters(origin,target)

  const restored=
    localPoint(
      origin,
      v.east,
      v.north
    )

  assert.ok(
    Math.abs(restored[0]-target[0])<1e-6
  )

  assert.ok(
    Math.abs(restored[1]-target[1])<1e-6
  )
})

test('velocityBetween reports eastward motion',()=>{
  const v=velocityBetween(
    [12,40],
    [12.05,40],
    300
  )

  assert.ok(v.east>0)
  assert.ok(Math.abs(v.north)<0.1)
  assert.ok(v.speed>0)
  assert.ok(Math.abs(v.course-90)<0.1)
})

test('robust velocity ignores zero-time duplicate step',()=>{
  const result=robustTrackVelocity([
    {
      epochMs:0,
      centroid:[12,40]
    },
    {
      epochMs:300000,
      centroid:[12.05,40]
    },
    {
      epochMs:300000,
      centroid:[12.06,40]
    },
    {
      epochMs:600000,
      centroid:[12.10,40]
    }
  ])

  assert.ok(result.east>0)
  assert.ok(result.speed>0)

  assert.equal(
    result.method,
    'track-robust'
  )

  assert.equal(
    result.samples,
    4
  )
})

test('insufficient history reports unavailable motion confidence',()=>{
  const result=robustTrackVelocity([
    {
      epochMs:0,
      centroid:[12,40]
    }
  ])

  assert.equal(result.east,0)
  assert.equal(result.north,0)
  assert.equal(result.speed,0)
  assert.equal(result.course,null)
  assert.equal(result.samples,1)
  assert.equal(result.confidence,0)
  assert.equal(result.residualMeters,null)
})

test('longitude helpers remain dateline-safe',()=>{
  assert.equal(
    normalizeLongitude(181),
    -179
  )

  assert.equal(
    normalizeLongitude(-181),
    179
  )

  assert.equal(
    unwrapLongitude(-179,179),
    181
  )
})
