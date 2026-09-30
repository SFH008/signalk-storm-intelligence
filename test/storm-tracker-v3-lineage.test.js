'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  classifyLineage
}=require('../lib/storm-tracker-v3/lineage')


function edge(from,to){
  return {
    from,
    to,
    overlap:{
      previousFraction:0.7,
      currentFraction:0.7,
      iou:0.5
    },
    size:{
      previousArea:100,
      currentArea:100,
      ratio:1
    }
  }
}


test('classifies one-to-one relationship as continuation candidate',()=>{
  const result=
    classifyLineage(
      ['p1'],
      ['c1'],
      [
        edge('p1','c1')
      ]
    )

  assert.deepEqual(
    result.relationships,
    [
      {
        type:'continuation',
        previous:['p1'],
        current:['c1']
      }
    ]
  )
})


test('classifies one-to-many relationship as split candidate',()=>{
  const result=
    classifyLineage(
      ['p1'],
      ['c1','c2'],
      [
        edge('p1','c1'),
        edge('p1','c2')
      ]
    )

  assert.deepEqual(
    result.relationships,
    [
      {
        type:'split',
        previous:['p1'],
        current:['c1','c2']
      }
    ]
  )
})


test('classifies many-to-one relationship as merge candidate',()=>{
  const result=
    classifyLineage(
      ['p1','p2'],
      ['c1'],
      [
        edge('p1','c1'),
        edge('p2','c1')
      ]
    )

  assert.deepEqual(
    result.relationships,
    [
      {
        type:'merge',
        previous:['p1','p2'],
        current:['c1']
      }
    ]
  )
})


test('classifies many-to-many relationship as complex unresolved',()=>{
  const result=
    classifyLineage(
      ['p1','p2'],
      ['c1','c2'],
      [
        edge('p1','c1'),
        edge('p1','c2'),
        edge('p2','c1')
      ]
    )

  assert.deepEqual(
    result.relationships,
    [
      {
        type:'complex',
        previous:['p1','p2'],
        current:['c1','c2']
      }
    ]
  )
})


test('reports unmatched current region as birth',()=>{
  const result=
    classifyLineage(
      ['p1'],
      ['c1','c2'],
      [
        edge('p1','c1')
      ]
    )

  assert.deepEqual(
    result.births,
    ['c2']
  )
})


test('reports unmatched previous region as disappearance',()=>{
  const result=
    classifyLineage(
      ['p1','p2'],
      ['c1'],
      [
        edge('p1','c1')
      ]
    )

  assert.deepEqual(
    result.disappearances,
    ['p2']
  )
})
