'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  centroidGeometry,
  polygonIoU,
  translateGeometryLocal
}=require('../lib/storm-geometry')

function square(lon,lat,size=1){
  return {
    type:'Polygon',
    coordinates:[[
      [lon,lat],
      [lon+size,lat],
      [lon+size,lat+size],
      [lon,lat+size],
      [lon,lat]
    ]]
  }
}

test('centroidGeometry returns polygon centroid',()=>{
  const centroid=centroidGeometry(
    square(10,20,2)
  )

  assert.ok(
    Math.abs(centroid[0]-11)<1e-12
  )

  assert.ok(
    Math.abs(centroid[1]-21)<1e-12
  )
})

test('centroidGeometry handles dateline crossing',()=>{
  const geometry={
    type:'Polygon',
    coordinates:[[
      [179.5,10],
      [-179.5,10],
      [-179.5,11],
      [179.5,11],
      [179.5,10]
    ]]
  }

  const centroid=
    centroidGeometry(geometry)

  assert.ok(
    Math.abs(Math.abs(centroid[0])-180)<1
  )

  assert.ok(
    Math.abs(centroid[1]-10.5)<1e-12
  )
})

test('polygonIoU is one for identical polygons',()=>{
  const a=square(10,20,1)

  assert.ok(
    Math.abs(
      polygonIoU(a,a)-1
    )<1e-12
  )
})

test('polygonIoU is zero for disjoint polygons',()=>{
  assert.equal(
    polygonIoU(
      square(10,20,1),
      square(20,30,1)
    ),
    0
  )
})

test('polygonIoU is between zero and one for overlap',()=>{
  const value=polygonIoU(
    square(10,20,2),
    square(11,20,2)
  )

  assert.ok(value>0)
  assert.ok(value<1)
})

test('translateGeometryLocal moves polygon without changing shape topology',()=>{
  const original=square(10,20,1)

  const moved=translateGeometryLocal(
    original,
    10,
    0,
    60
  )

  assert.equal(moved.type,'Polygon')

  assert.equal(
    moved.coordinates[0].length,
    original.coordinates[0].length
  )

  const before=
    centroidGeometry(original)

  const after=
    centroidGeometry(moved)

  assert.ok(after[0]>before[0])

  assert.ok(
    Math.abs(
      after[1]-before[1]
    )<0.01
  )
})

test('invalid geometry stays safely unsupported',()=>{
  assert.equal(
    centroidGeometry(null),
    null
  )

  assert.equal(
    polygonIoU(null,null),
    0
  )

  assert.equal(
    translateGeometryLocal(
      null,
      1,
      1,
      60
    ),
    null
  )
})
