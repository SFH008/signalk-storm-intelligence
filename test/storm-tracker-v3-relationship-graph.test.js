'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  buildRelationshipGraph
}=require('../lib/storm-tracker-v3/relationship-graph')


function feature(
  id,
  west,
  south,
  east,
  north
){
  return {
    type:'Feature',
    id,
    geometry:{
      type:'Polygon',
      coordinates:[[
        [west,north],
        [east,north],
        [east,south],
        [west,south],
        [west,north]
      ]]
    },
    properties:{
      sourceId:id
    }
  }
}


test('relationship graph excludes physically unrelated regions',()=>{
  /*
   * Previous region after motion advection is expected
   * around x=10..20, y=10..20.
   */
  const predicted=[
    feature(
      'previous-1',
      10,
      10,
      20,
      20
    )
  ]

  /*
   * One plausible successor overlaps strongly.
   * One unrelated region is far away.
   */
  const current=[
    feature(
      'current-near',
      12,
      10,
      22,
      20
    ),

    feature(
      'current-far',
      100,
      100,
      110,
      110
    )
  ]

  const graph=
    buildRelationshipGraph(
      predicted,
      current
    )

  assert.equal(
    graph.edges.length,
    1
  )

  assert.equal(
    graph.edges[0].from,
    'previous-1'
  )

  assert.equal(
    graph.edges[0].to,
    'current-near'
  )
})


test('relationship graph permits no relationship when nothing is admissible',()=>{
  const predicted=[
    feature(
      'previous-1',
      10,
      10,
      20,
      20
    )
  ]

  const current=[
    feature(
      'current-far',
      100,
      100,
      110,
      110
    )
  ]

  const graph=
    buildRelationshipGraph(
      predicted,
      current
    )

  assert.deepEqual(
    graph.edges,
    []
  )
})

test('relationship graph preserves one-to-many plausible relationships',()=>{
  const predicted=[
    feature(
      'previous-1',
      10,
      10,
      20,
      20
    )
  ]

  const current=[
    feature(
      'current-a',
      10,
      10,
      15,
      20
    ),

    feature(
      'current-b',
      15,
      10,
      20,
      20
    )
  ]

  const graph=
    buildRelationshipGraph(
      predicted,
      current
    )

  assert.deepEqual(
    graph.edges.map(
      edge=>({
        from:edge.from,
        to:edge.to
      })
    ),
    [
      {
        from:'previous-1',
        to:'current-a'
      },
      {
        from:'previous-1',
        to:'current-b'
      }
    ]
  )
})


test('relationship graph preserves many-to-one plausible relationships',()=>{
  const predicted=[
    feature(
      'previous-a',
      10,
      10,
      15,
      20
    ),

    feature(
      'previous-b',
      15,
      10,
      20,
      20
    )
  ]

  const current=[
    feature(
      'current-1',
      10,
      10,
      20,
      20
    )
  ]

  const graph=
    buildRelationshipGraph(
      predicted,
      current
    )

  assert.deepEqual(
    graph.edges.map(
      edge=>({
        from:edge.from,
        to:edge.to
      })
    ),
    [
      {
        from:'previous-a',
        to:'current-1'
      },
      {
        from:'previous-b',
        to:'current-1'
      }
    ]
  )
})


test('relationship graph does not force unrelated regions into split or merge topology',()=>{
  const predicted=[
    feature(
      'previous-a',
      10,
      10,
      15,
      20
    ),

    feature(
      'previous-b',
      100,
      100,
      110,
      110
    )
  ]

  const current=[
    feature(
      'current-a',
      12,
      10,
      17,
      20
    ),

    feature(
      'current-far',
      200,
      200,
      210,
      210
    )
  ]

  const graph=
    buildRelationshipGraph(
      predicted,
      current
    )

  assert.deepEqual(
    graph.edges.map(
      edge=>({
        from:edge.from,
        to:edge.to
      })
    ),
    [
      {
        from:'previous-a',
        to:'current-a'
      }
    ]
  )
})

test('overlapping bounding boxes do not create an edge when polygons are disjoint',()=>{
  /*
   * Triangle A occupies x+y <= 4.
   *
   * Triangle B occupies x+y >= 5.5.
   *
   * Their bounding boxes overlap substantially,
   * but the actual polygons are separated.
   */
  const predicted=[
    {
      type:'Feature',
      id:'previous-1',
      geometry:{
        type:'Polygon',
        coordinates:[[
          [0,0],
          [4,0],
          [0,4],
          [0,0]
        ]]
      },
      properties:{
        sourceId:'previous-1'
      }
    }
  ]

  const current=[
    {
      type:'Feature',
      id:'current-1',
      geometry:{
        type:'Polygon',
        coordinates:[[
          [4,4],
          [4,1.5],
          [1.5,4],
          [4,4]
        ]]
      },
      properties:{
        sourceId:'current-1'
      }
    }
  ]

  const graph=
    buildRelationshipGraph(
      predicted,
      current
    )

  assert.deepEqual(
    graph.edges,
    []
  )
})

test('admissible relationship exposes geometric overlap evidence',()=>{
  /*
   * Previous:
   *   x=0..10, y=0..10 => area 100
   *
   * Current:
   *   x=5..15, y=0..10 => area 100
   *
   * Intersection:
   *   x=5..10 => area 50
   *
   * Therefore:
   *   previous fraction = 0.5
   *   current fraction  = 0.5
   *   IoU               = 50 / 150 = 1/3
   */
  const predicted=[
    feature(
      'previous-1',
      0,
      0,
      10,
      10
    )
  ]

  const current=[
    feature(
      'current-1',
      5,
      0,
      15,
      10
    )
  ]

  const graph=
    buildRelationshipGraph(
      predicted,
      current
    )

  assert.equal(
    graph.edges.length,
    1
  )

  const edge=graph.edges[0]

  assert.equal(
    edge.from,
    'previous-1'
  )

  assert.equal(
    edge.to,
    'current-1'
  )

  assert.ok(
    Math.abs(
      edge.overlap.previousFraction-
      0.5
    )<1e-9
  )

  assert.ok(
    Math.abs(
      edge.overlap.currentFraction-
      0.5
    )<1e-9
  )

  assert.ok(
    Math.abs(
      edge.overlap.iou-
      1/3
    )<1e-9
  )
})

test('admissible relationship exposes size continuity evidence',()=>{
  const predicted=[
    feature(
      'previous-1',
      0,
      0,
      10,
      10
    )
  ]

  const current=[
    feature(
      'current-1',
      2,
      0,
      14,
      10
    )
  ]

  const graph=
    buildRelationshipGraph(
      predicted,
      current
    )

  assert.equal(
    graph.edges.length,
    1
  )

  const edge=graph.edges[0]

  assert.ok(
    Math.abs(
      edge.size.previousArea-
      100
    )<1e-9
  )

  assert.ok(
    Math.abs(
      edge.size.currentArea-
      120
    )<1e-9
  )

  assert.ok(
    Math.abs(
      edge.size.ratio-
      1.2
    )<1e-9
  )
})

test('overlap evidence uses normalized topology for self-crossing predicted geometry',()=>{
  /*
   * This represents the failure observed in real IPMA advection:
   *
   * motion can deform a previously valid boundary into a
   * self-crossing ring.
   *
   * Raw shoelace area is then not a valid denominator for
   * polygon-clipping intersection area.
   *
   * The relationship graph must use one consistent normalized
   * topology for source and intersection areas.
   */

  const predicted=[
    {
      type:'Feature',
      id:'previous-self-crossing',
      geometry:{
        type:'Polygon',
        coordinates:[[
          [0,0],
          [5,4],
          [0,5],
          [4,0],
          [0,0]
        ]]
      },
      properties:{
        sourceId:'previous-self-crossing'
      }
    }
  ]

  /*
   * Completely contains the normalized predicted geometry.
   */
  const current=[
    feature(
      'current-container',
      -1,
      -1,
      5,
      5
    )
  ]

  const graph=
    buildRelationshipGraph(
      predicted,
      current
    )

  assert.equal(
    graph.edges.length,
    1
  )

  const edge=graph.edges[0]

  /*
   * Every overlap fraction is a mathematical probability-like
   * area fraction and therefore must remain within [0,1].
   */
  assert.ok(
    edge.overlap.previousFraction>=0 &&
    edge.overlap.previousFraction<=1
  )

  assert.ok(
    edge.overlap.currentFraction>=0 &&
    edge.overlap.currentFraction<=1
  )

  assert.ok(
    edge.overlap.iou>=0 &&
    edge.overlap.iou<=1
  )

  /*
   * The containing current geometry includes the entire
   * normalized predicted geometry.
   */
  assert.ok(
    Math.abs(
      edge.overlap.previousFraction-
      1
    )<1e-9
  )

  /*
   * Size evidence must use that same normalized topology.
   */
  assert.ok(
    edge.size.previousArea>0
  )

  assert.ok(
    edge.size.currentArea>0
  )
})

test('relationship graph rejects gross scale discontinuity with negligible predicted overlap',()=>{
  const predicted=[
    feature(
      'previous-1',
      0,
      0,
      1,
      1
    )
  ]

  const current=[
    feature(
      'current-1',
      0.99,
      0,
      10.99,
      10
    )
  ]

  const graph=
    buildRelationshipGraph(
      predicted,
      current
    )

  assert.deepEqual(
    graph.edges,
    []
  )
})


test('relationship graph retains large scale change when predicted overlap remains substantial',()=>{
  const predicted=[
    feature(
      'previous-1',
      0,
      0,
      2,
      2
    )
  ]

  const current=[
    feature(
      'current-1',
      0,
      0,
      4,
      4
    )
  ]

  const graph=
    buildRelationshipGraph(
      predicted,
      current
    )

  assert.equal(
    graph.edges.length,
    1
  )
})
