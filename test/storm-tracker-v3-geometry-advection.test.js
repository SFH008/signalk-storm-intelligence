'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  advectPixelGeometry,
  advectGeographicGeometry
}=require('../lib/storm-tracker-v3/geometry-advection')

function uniformMotionField(
  width,
  height,
  dx,
  dy
){
  const size=width*height

  const eastPixels=
    new Float32Array(size)

  const northPixels=
    new Float32Array(size)

  const support=
    new Uint8Array(size)

  const uncertaintyPixels=
    new Float32Array(size)

  eastPixels.fill(dx)
  northPixels.fill(dy)
  support.fill(1)
  uncertaintyPixels.fill(0)

  return {
    width,
    height,
    eastPixels,
    northPixels,
    support,
    uncertaintyPixels
  }
}

test('geometry advection translates polygon under uniform motion',()=>{
  const geometry={
    type:'Polygon',
    coordinates:[[
      [20,20],
      [30,20],
      [30,30],
      [20,30],
      [20,20]
    ]]
  }

  const motion=uniformMotionField(
    64,
    64,
    5,
    0
  )

  const predicted=
    advectPixelGeometry(
      geometry,
      motion
    )

  assert.deepEqual(
    predicted.geometry,
    {
      type:'Polygon',
      coordinates:[[
        [25,20],
        [35,20],
        [35,30],
        [25,30],
        [25,20]
      ]]
    }
  )

  assert.equal(
    predicted.supported,
    true
  )

  assert.equal(
    predicted.uncertaintyPixels,
    0
  )
})

test('geometry advection uses local motion at each polygon vertex',()=>{
  const width=64
  const height=64
  const size=width*height

  const eastPixels=new Float32Array(size)
  const northPixels=new Float32Array(size)
  const support=new Uint8Array(size)
  const uncertaintyPixels=new Float32Array(size)

  support.fill(1)
  uncertaintyPixels.fill(0)

  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const i=y*width+x

      eastPixels[i]=
        x<25 ? 2 : 6

      northPixels[i]=
        y<25 ? -1 : 3
    }
  }

  const motion={
    width,
    height,
    eastPixels,
    northPixels,
    support,
    uncertaintyPixels
  }

  const geometry={
    type:'Polygon',
    coordinates:[[
      [20,20],
      [30,20],
      [30,30],
      [20,30],
      [20,20]
    ]]
  }

  const predicted=
    advectPixelGeometry(
      geometry,
      motion
    )

  assert.equal(
    predicted.supported,
    true
  )

  assert.deepEqual(
    predicted.geometry,
    {
      type:'Polygon',
      coordinates:[[
        [22,19],
        [36,19],
        [36,33],
        [22,33],
        [22,19]
      ]]
    }
  )
})

test('geometry advection does not fabricate motion where support is missing',()=>{
  const motion=uniformMotionField(
    64,
    64,
    5,
    0
  )

  const missingX=30
  const missingY=30
  const missingIndex=
    missingY*motion.width+
    missingX

  motion.support[missingIndex]=0

  const geometry={
    type:'Polygon',
    coordinates:[[
      [20,20],
      [30,20],
      [30,30],
      [20,30],
      [20,20]
    ]]
  }

  const predicted=
    advectPixelGeometry(
      geometry,
      motion
    )

  assert.equal(
    predicted.supported,
    false
  )

  assert.equal(
    predicted.geometry,
    null
  )

  assert.equal(
    predicted.uncertaintyPixels,
    null
  )
})

test('geometry uncertainty increases when local motion uncertainty increases',()=>{
  const low=uniformMotionField(
    64,
    64,
    5,
    0
  )

  const high=uniformMotionField(
    64,
    64,
    5,
    0
  )

  low.uncertaintyPixels.fill(1)
  high.uncertaintyPixels.fill(4)

  const geometry={
    type:'Polygon',
    coordinates:[[
      [20,20],
      [30,20],
      [30,30],
      [20,30],
      [20,20]
    ]]
  }

  const predictedLow=
    advectPixelGeometry(
      geometry,
      low
    )

  const predictedHigh=
    advectPixelGeometry(
      geometry,
      high
    )

  assert.equal(
    predictedLow.supported,
    true
  )

  assert.equal(
    predictedHigh.supported,
    true
  )

  assert.ok(
    predictedHigh.uncertaintyPixels >
    predictedLow.uncertaintyPixels
  )
})

test('geographic polygon converts to pixel coordinates and round-trips exactly',()=>{
  const {
    geographicToPixelGeometry,
    pixelToGeographicGeometry
  }=require('../lib/storm-tracker-v3/geometry-advection')

  const field={
    width:100,
    height:50,
    bounds:[
      -10,
      35,
      0,
      45
    ]
  }

  const geographic={
    type:'Polygon',
    coordinates:[[
      [-8,43],
      [-6,43],
      [-6,41],
      [-8,41],
      [-8,43]
    ]]
  }

  const pixel=
    geographicToPixelGeometry(
      geographic,
      field
    )

  assert.deepEqual(
    pixel,
    {
      type:'Polygon',
      coordinates:[[
        [20,10],
        [40,10],
        [40,20],
        [20,20],
        [20,10]
      ]]
    }
  )

  const roundTrip=
    pixelToGeographicGeometry(
      pixel,
      field
    )

  assert.deepEqual(
    roundTrip,
    geographic
  )
})

test('geographic conversion preserves MultiPolygon structure',()=>{
  const {
    geographicToPixelGeometry,
    pixelToGeographicGeometry
  }=require('../lib/storm-tracker-v3/geometry-advection')

  const field={
    width:100,
    height:50,
    bounds:[
      -10,
      35,
      0,
      45
    ]
  }

  const geographic={
    type:'MultiPolygon',
    coordinates:[
      [[
        [-8,43],
        [-7,43],
        [-7,42],
        [-8,42],
        [-8,43]
      ]],
      [[
        [-4,39],
        [-3,39],
        [-3,38],
        [-4,38],
        [-4,39]
      ]]
    ]
  }

  const pixel=
    geographicToPixelGeometry(
      geographic,
      field
    )

  assert.equal(
    pixel.type,
    'MultiPolygon'
  )

  assert.deepEqual(
    pixel.coordinates,
    [
      [[
        [20,10],
        [30,10],
        [30,15],
        [20,15],
        [20,10]
      ]],
      [[
        [60,30],
        [70,30],
        [70,35],
        [60,35],
        [60,30]
      ]]
    ]
  )

  assert.deepEqual(
    pixelToGeographicGeometry(
      pixel,
      field
    ),
    geographic
  )
})

test('geographic geometry advection composes coordinate conversion and pixel motion',()=>{
  const {
    advectGeographicGeometry
  }=require('../lib/storm-tracker-v3/geometry-advection')

  const field={
    width:100,
    height:50,
    bounds:[
      -10,
      35,
      0,
      45
    ]
  }

  const motion=uniformMotionField(
    100,
    50,
    5,
    0
  )

  const geometry={
    type:'Polygon',
    coordinates:[[
      [-8,43],
      [-7,43],
      [-7,42],
      [-8,42],
      [-8,43]
    ]]
  }

  const predicted=
    advectGeographicGeometry(
      geometry,
      field,
      motion
    )

  assert.equal(
    predicted.supported,
    true
  )

  /*
   * 100 px across 10 degrees:
   * 5 pixels east = 0.5 degrees east.
   */
  assert.deepEqual(
    predicted.geometry,
    {
      type:'Polygon',
      coordinates:[[
        [-7.5,43],
        [-6.5,43],
        [-6.5,42],
        [-7.5,42],
        [-7.5,43]
      ]]
    }
  )

  assert.equal(
    predicted.uncertaintyPixels,
    0
  )
})

test('geometry advection can use robust interpolation over sparse motion support',()=>{
  const width=64
  const height=64
  const size=width*height

  const eastPixels=new Float32Array(size)
  const northPixels=new Float32Array(size)
  const support=new Uint8Array(size)
  const uncertaintyPixels=new Float32Array(size)

  eastPixels.fill(NaN)
  northPixels.fill(NaN)
  uncertaintyPixels.fill(NaN)

  /*
   * Sparse LK-style lattice.
   */
  for(let y=6;y<height;y+=16){
    for(let x=6;x<width;x+=16){
      const i=y*width+x

      support[i]=1
      eastPixels[i]=5
      northPixels[i]=0
      uncertaintyPixels[i]=1
    }
  }

  const motion={
    width,
    height,
    eastPixels,
    northPixels,
    support,
    uncertaintyPixels
  }

  const geometry={
    type:'Polygon',
    coordinates:[[
      [20,20],
      [30,20],
      [30,30],
      [20,30],
      [20,20]
    ]]
  }

  /*
   * None of these vertices lies directly on the sparse lattice.
   */
  const exact=
    advectPixelGeometry(
      geometry,
      motion
    )

  assert.equal(
    exact.supported,
    false
  )

  const predicted=
    advectPixelGeometry(
      geometry,
      motion,
      {
        sampleMode:'interpolated',
        interpolation:{
          radius:20,
          minSamples:3
        }
      }
    )

  assert.equal(
    predicted.supported,
    true
  )

  assert.deepEqual(
    predicted.geometry,
    {
      type:'Polygon',
      coordinates:[[
        [25,20],
        [35,20],
        [35,30],
        [25,30],
        [25,20]
      ]]
    }
  )

  assert.ok(
    Number.isFinite(
      predicted.uncertaintyPixels
    )
  )
})

test('geometry advection preserves MultiPolygon structure',()=>{
  const motion=uniformMotionField(
    64,
    64,
    5,
    -2
  )

  const geometry={
    type:'MultiPolygon',
    coordinates:[
      [[
        [10,10],
        [20,10],
        [20,20],
        [10,20],
        [10,10]
      ]],
      [[
        [30,30],
        [40,30],
        [40,40],
        [30,40],
        [30,30]
      ]]
    ]
  }

  const predicted=
    advectPixelGeometry(
      geometry,
      motion
    )

  assert.equal(
    predicted.supported,
    true
  )

  assert.deepEqual(
    predicted.geometry,
    {
      type:'MultiPolygon',
      coordinates:[
        [[
          [15,8],
          [25,8],
          [25,18],
          [15,18],
          [15,8]
        ]],
        [[
          [35,28],
          [45,28],
          [45,38],
          [35,38],
          [35,28]
        ]]
      ]
    }
  )
})

test('unsupported geometry reports vertex support coverage',()=>{
  const motion={
    width:10,
    height:10,
    eastPixels:new Float64Array(100),
    northPixels:new Float64Array(100),
    uncertaintyPixels:new Float64Array(100),
    support:new Uint8Array(100)
  }

  /*
   * Four distinct corners plus closing coordinate.
   * Support three corner locations; leave one unsupported.
   */
  for(const [x,y] of [
    [1,1],
    [4,1],
    [1,4]
  ]){
    motion.support[
      y*motion.width+x
    ]=1

    motion.eastPixels[
      y*motion.width+x
    ]=2

    motion.northPixels[
      y*motion.width+x
    ]=0
  }

  const geometry={
    type:'Polygon',
    coordinates:[[
      [1,1],
      [4,1],
      [4,4],
      [1,4],
      [1,1]
    ]]
  }

  const result=
    advectPixelGeometry(
      geometry,
      motion
    )

  assert.equal(
    result.supported,
    false
  )

  /*
   * Closing coordinate counts as another sampled
   * coordinate, so 4 of 5 samples are supported.
   */
  assert.equal(
    result.support.totalVertices,
    5
  )

  assert.equal(
    result.support.supportedVertices,
    4
  )

  assert.equal(
    result.support.unsupportedVertices,
    1
  )

  assert.ok(
    Math.abs(
      result.support.fraction-
      0.8
    )<1e-9
  )
})

test('MultiPolygon retains supported polygons when another polygon lacks motion evidence',()=>{
  const motion=uniformMotionField(
    64,
    64,
    5,
    0
  )

  /*
   * Remove support for one vertex belonging only
   * to the second polygon.
   */
  motion.support[
    35*motion.width+35
  ]=0

  const geometry={
    type:'MultiPolygon',
    coordinates:[
      [[
        [10,10],
        [20,10],
        [20,20],
        [10,20],
        [10,10]
      ]],
      [[
        [30,30],
        [40,30],
        [40,40],
        [35,35],
        [30,40],
        [30,30]
      ]]
    ]
  }

  const predicted=
    advectPixelGeometry(
      geometry,
      motion
    )

  assert.equal(
    predicted.supported,
    true
  )

  assert.deepEqual(
    predicted.geometry,
    {
      type:'MultiPolygon',
      coordinates:[
        [[
          [15,10],
          [25,10],
          [25,20],
          [15,20],
          [15,10]
        ]]
      ]
    }
  )
})


test('partial MultiPolygon advection reports polygon support explicitly',()=>{
  const motion=uniformMotionField(
    64,
    64,
    5,
    0
  )

  motion.support[
    35*motion.width+35
  ]=0

  const geometry={
    type:'MultiPolygon',
    coordinates:[
      [[
        [10,10],
        [20,10],
        [20,20],
        [10,20],
        [10,10]
      ]],
      [[
        [30,30],
        [40,30],
        [40,40],
        [35,35],
        [30,40],
        [30,30]
      ]]
    ]
  }

  const predicted=
    advectPixelGeometry(
      geometry,
      motion
    )

  assert.equal(
    predicted.supported,
    true
  )

  assert.equal(
    predicted.support.partial,
    true
  )

  assert.equal(
    predicted.support.totalPolygons,
    2
  )

  assert.equal(
    predicted.support.supportedPolygons,
    1
  )

  assert.equal(
    predicted.support.unsupportedPolygons,
    1
  )

  /*
   * Vertex accounting remains evidence accounting
   * over the complete original geometry, including
   * the omitted unsupported polygon.
   */
  assert.equal(
    predicted.support.totalVertices,
    11
  )

  assert.equal(
    predicted.support.supportedVertices,
    10
  )

  assert.equal(
    predicted.support.unsupportedVertices,
    1
  )
})


test('MultiPolygon remains unsupported when no constituent polygon can be advected',()=>{
  const motion=uniformMotionField(
    64,
    64,
    5,
    0
  )

  motion.support[
    15*motion.width+15
  ]=0

  motion.support[
    35*motion.width+35
  ]=0

  const geometry={
    type:'MultiPolygon',
    coordinates:[
      [[
        [10,10],
        [20,10],
        [20,20],
        [15,15],
        [10,20],
        [10,10]
      ]],
      [[
        [30,30],
        [40,30],
        [40,40],
        [35,35],
        [30,40],
        [30,30]
      ]]
    ]
  }

  const predicted=
    advectPixelGeometry(
      geometry,
      motion
    )

  assert.equal(
    predicted.supported,
    false
  )

  assert.equal(
    predicted.geometry,
    null
  )

  assert.equal(
    predicted.support.totalPolygons,
    2
  )

  assert.equal(
    predicted.support.supportedPolygons,
    0
  )

  assert.equal(
    predicted.support.unsupportedPolygons,
    2
  )
})

test('Polygon can advect across one short bracketed motion-support gap',()=>{
  const motion=uniformMotionField(
    64,
    64,
    4,
    0
  )

  /*
   * Polygon has 21 sampled boundary coordinates.
   * Remove one motion sample: raw support remains >95%.
   */
  const ring=[
    [10,10],
    [12,10],
    [14,10],
    [16,10],
    [18,10],
    [20,10],
    [20,12],
    [20,14],
    [20,16],
    [20,18],
    [20,20],
    [18,20],
    [16,20],
    [14,20],
    [12,20],
    [10,20],
    [10,18],
    [10,16],
    [10,14],
    [10,12],
    [10,10]
  ]

  motion.support[
    10*motion.width+16
  ]=0

  const predicted=
    advectPixelGeometry(
      {
        type:'Polygon',
        coordinates:[ring]
      },
      motion
    )

  assert.equal(
    predicted.supported,
    true
  )

  /*
   * Raw evidence accounting must remain raw.
   */
  assert.equal(
    predicted.support.supportedVertices,
    20
  )

  assert.equal(
    predicted.support.unsupportedVertices,
    1
  )

  assert.equal(
    predicted.support.repairedVertices,
    1
  )

  /*
   * Uniform surrounding motion means the repaired
   * point should receive the same four-pixel shift.
   */
  assert.ok(
    predicted.geometry.coordinates[0]
      .some(
        ([x,y])=>
          x===20 &&
          y===10
      )
  )
})


test('Polygon can advect across two consecutive short bracketed gaps',()=>{
  const motion=uniformMotionField(
    80,
    80,
    3,
    -1
  )

  const ring=[]

  for(let x=10;x<=30;x+=2){
    ring.push([x,10])
  }

  for(let y=12;y<=30;y+=2){
    ring.push([30,y])
  }

  for(let x=28;x>=10;x-=2){
    ring.push([x,30])
  }

  for(let y=28;y>=12;y-=2){
    ring.push([10,y])
  }

  ring.push([10,10])

  motion.support[
    10*motion.width+18
  ]=0

  motion.support[
    10*motion.width+20
  ]=0

  const predicted=
    advectPixelGeometry(
      {
        type:'Polygon',
        coordinates:[ring]
      },
      motion
    )

  assert.equal(
    predicted.supported,
    true
  )

  assert.equal(
    predicted.support.repairedVertices,
    2
  )

  assert.equal(
    predicted.support.unsupportedVertices,
    2
  )
})


test('Polygon does not repair a boundary gap longer than two vertices',()=>{
  const motion=uniformMotionField(
    80,
    80,
    3,
    0
  )

  const ring=[]

  for(let x=10;x<=50;x+=2){
    ring.push([x,10])
  }

  for(let y=12;y<=30;y+=2){
    ring.push([50,y])
  }

  for(let x=48;x>=10;x-=2){
    ring.push([x,30])
  }

  for(let y=28;y>=12;y-=2){
    ring.push([10,y])
  }

  ring.push([10,10])

  for(const x of [20,22,24]){
    motion.support[
      10*motion.width+x
    ]=0
  }

  const predicted=
    advectPixelGeometry(
      {
        type:'Polygon',
        coordinates:[ring]
      },
      motion
    )

  assert.equal(
    predicted.supported,
    false
  )

  assert.equal(
    predicted.geometry,
    null
  )
})


test('Polygon does not repair broadly missing motion evidence',()=>{
  const motion=uniformMotionField(
    64,
    64,
    4,
    0
  )

  const ring=[
    [10,10],
    [20,10],
    [30,10],
    [40,10],
    [40,20],
    [40,30],
    [40,40],
    [30,40],
    [20,40],
    [10,40],
    [10,30],
    [10,20],
    [10,10]
  ]

  for(const [x,y] of [
    [20,10],
    [30,10],
    [40,10],
    [40,20]
  ]){
    motion.support[
      y*motion.width+x
    ]=0
  }

  const predicted=
    advectPixelGeometry(
      {
        type:'Polygon',
        coordinates:[ring]
      },
      motion
    )

  assert.equal(
    predicted.supported,
    false
  )
})

test('successful geographic advection preserves support diagnostics',()=>{
  const width=32
  const height=32
  const size=width*height

  const field={
    width,
    height,
    bounds:[
      -10,
      35,
      0,
      45
    ]
  }

  const eastPixels=
    new Float32Array(size)

  const northPixels=
    new Float32Array(size)

  const support=
    new Uint8Array(size)

  const uncertaintyPixels=
    new Float32Array(size)

  eastPixels.fill(1)
  northPixels.fill(0)
  support.fill(1)
  uncertaintyPixels.fill(2)

  const motion={
    width,
    height,
    eastPixels,
    northPixels,
    support,
    uncertaintyPixels
  }

  const geometry={
    type:'Polygon',
    coordinates:[[
      [-8,43],
      [-7,43],
      [-7,42],
      [-8,42],
      [-8,43]
    ]]
  }

  const result=
    advectGeographicGeometry(
      geometry,
      field,
      motion
    )

  assert.equal(
    result.supported,
    true
  )

  assert.ok(
    result.support
  )

  assert.equal(
    result.support.totalVertices,
    5
  )

  assert.equal(
    result.support.supportedVertices,
    5
  )

  assert.equal(
    result.support.unsupportedVertices,
    0
  )

  assert.equal(
    result.support.fraction,
    1
  )
})
