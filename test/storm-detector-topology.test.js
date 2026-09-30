'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  detectStormCandidates
}=require('../lib/storm-detector')

function fieldFromRows(rows){
  const height=rows.length
  const width=rows[0].length

  const values=new Float32Array(
    width*height
  )

  values.fill(NaN)

  for(let y=0;y<height;y++){
    assert.equal(
      rows[y].length,
      width
    )

    for(let x=0;x<width;x++){
      const value=rows[y][x]

      if(value!=null){
        values[y*width+x]=value
      }
    }
  }

  return {
    schema:'storm-normalized-evidence/1',
    domain:'radar',
    quantity:'reflectivity',
    units:'dBZ',
    observedAt:
      '2026-09-29T12:00:00.000Z',

    width,
    height,

    bounds:[
      0,
      0,
      width,
      height
    ],

    reflectivityLowerBoundDbz:
      values,

    provenance:{
      provider:'synthetic',
      product:'topology',
      method:'test'
    }
  }
}

function detect(rows){
  return detectStormCandidates(
    fieldFromRows(rows),
    {
      minReflectivityDbz:24,
      minAreaKm2:0,
      maxAreaKm2:Infinity
    }
  )
}

test('isolated qualifying cells remain separate components',()=>{
  const result=detect([
    [30,null,null],
    [null,null,null],
    [null,null,30]
  ])

  assert.equal(
    result.length,
    2
  )

  assert.deepEqual(
    result.map(
      x=>
        x.properties
          .detection
          .pixelCount
    ),
    [1,1]
  )
})

test('diagonal qualifying cells join under 8-neighbour connectivity',()=>{
  const result=detect([
    [30,null],
    [null,30]
  ])

  assert.equal(
    result.length,
    1
  )

  assert.equal(
    result[0].properties
      .detection
      .pixelCount,
    2
  )
})

test('single qualifying bridge joins two larger bodies',()=>{
  const result=detect([
    [30,30,null,30,30],
    [30,30,30,30,30],
    [30,30,null,30,30]
  ])

  assert.equal(
    result.length,
    1
  )

  assert.equal(
    result[0].properties
      .detection
      .pixelCount,
    13
  )
})

test('non-qualifying enclosed pixel remains a polygon hole',()=>{
  const result=detect([
    [30,30,30],
    [30,null,30],
    [30,30,30]
  ])

  assert.equal(
    result.length,
    1
  )

  assert.equal(
    result[0].properties
      .detection
      .pixelCount,
    8
  )

  assert.equal(
    result[0].geometry.type,
    'Polygon'
  )

  assert.equal(
    result[0].geometry.coordinates.length,
    2,
    'expected exterior ring plus one hole'
  )
})

test('one connected component may produce MultiPolygon geometry under diagonal-only contact',()=>{
  const result=detect([
    [30,null],
    [null,30]
  ])

  assert.equal(
    result.length,
    1
  )

  assert.equal(
    result[0].properties
      .detection
      .pixelCount,
    2
  )

  assert.equal(
    result[0].geometry.type,
    'MultiPolygon'
  )

  assert.equal(
    result[0].geometry.coordinates.length,
    2
  )
})
