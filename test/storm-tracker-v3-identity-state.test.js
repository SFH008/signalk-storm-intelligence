'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  createIdentityState,
  advanceIdentityState
}=require('../lib/storm-tracker-v3/identity-state')


test('birth creates a new persistent track identity',()=>{
  const state=createIdentityState()

  const result=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:00:00.000Z',

        relationships:[],

        births:['c1'],

        disappearances:[]
      }
    )

  assert.equal(
    result.activeByObservation.get('c1'),
    'track-1'
  )

  const track=
    result.tracks.get('track-1')

  assert.equal(
    track.trackId,
    'track-1'
  )

  assert.equal(
    track.firstSeen,
    '2026-09-29T20:00:00.000Z'
  )

  assert.equal(
    track.lastSeen,
    '2026-09-29T20:00:00.000Z'
  )

  assert.deepEqual(
    track.observations,
    ['c1']
  )

  assert.equal(
    track.status,
    'active'
  )
})


test('validated continuation retains the same track identity',()=>{
  let state=createIdentityState()

  state=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:00:00.000Z',

        relationships:[],

        births:['p1'],

        disappearances:[]
      }
    )

  state=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:05:00.000Z',

        relationships:[
          {
            type:'continuation',
            previous:['p1'],
            current:['c1']
          }
        ],

        births:[],

        disappearances:[]
      }
    )

  assert.equal(
    state.activeByObservation.get('c1'),
    'track-1'
  )

  assert.equal(
    state.activeByObservation.has('p1'),
    false
  )

  const track=
    state.tracks.get('track-1')

  assert.deepEqual(
    track.observations,
    ['p1','c1']
  )

  assert.equal(
    track.firstSeen,
    '2026-09-29T20:00:00.000Z'
  )

  assert.equal(
    track.lastSeen,
    '2026-09-29T20:05:00.000Z'
  )
})


test('death terminates an existing track',()=>{
  let state=createIdentityState()

  state=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:00:00.000Z',

        relationships:[],

        births:['p1'],

        disappearances:[]
      }
    )

  state=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:05:00.000Z',

        relationships:[],

        births:[],

        disappearances:['p1']
      }
    )

  assert.equal(
    state.activeByObservation.has('p1'),
    false
  )

  const track=
    state.tracks.get('track-1')

  assert.equal(
    track.status,
    'ended'
  )

  assert.equal(
    track.endedAt,
    '2026-09-29T20:05:00.000Z'
  )
})


test('split remains unresolved and does not inherit persistent identity',()=>{
  let state=createIdentityState()

  state=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:00:00.000Z',

        relationships:[],

        births:['p1'],

        disappearances:[]
      }
    )

  state=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:05:00.000Z',

        relationships:[
          {
            type:'split',
            previous:['p1'],
            current:['c1','c2']
          }
        ],

        births:[],

        disappearances:[]
      }
    )

  assert.equal(
    state.activeByObservation.has('c1'),
    false
  )

  assert.equal(
    state.activeByObservation.has('c2'),
    false
  )

  assert.deepEqual(
    state.unresolvedCurrent,
    ['c1','c2']
  )

  assert.deepEqual(
    state.unresolvedPrevious,
    ['p1']
  )

  assert.equal(
    state.tracks.get('track-1').status,
    'ended'
  )
})


test('merge remains unresolved and does not choose a parent identity',()=>{
  let state=createIdentityState()

  state=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:00:00.000Z',

        relationships:[],

        births:['p1','p2'],

        disappearances:[]
      }
    )

  state=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:05:00.000Z',

        relationships:[
          {
            type:'merge',
            previous:['p1','p2'],
            current:['c1']
          }
        ],

        births:[],

        disappearances:[]
      }
    )

  assert.equal(
    state.activeByObservation.has('c1'),
    false
  )

  assert.deepEqual(
    state.unresolvedCurrent,
    ['c1']
  )

  assert.deepEqual(
    state.unresolvedPrevious,
    ['p1','p2']
  )

  assert.equal(
    state.tracks.get('track-1').status,
    'ended'
  )

  assert.equal(
    state.tracks.get('track-2').status,
    'ended'
  )
})


test('complex relationship remains unresolved without forced identity',()=>{
  let state=createIdentityState()

  state=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:00:00.000Z',

        relationships:[],

        births:['p1','p2'],

        disappearances:[]
      }
    )

  state=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:05:00.000Z',

        relationships:[
          {
            type:'complex',
            previous:['p1','p2'],
            current:['c1','c2']
          }
        ],

        births:[],

        disappearances:[]
      }
    )

  assert.equal(
    state.activeByObservation.has('c1'),
    false
  )

  assert.equal(
    state.activeByObservation.has('c2'),
    false
  )

  assert.deepEqual(
    state.unresolvedCurrent,
    ['c1','c2']
  )

  assert.deepEqual(
    state.unresolvedPrevious,
    ['p1','p2']
  )
})


test('continuation from an observation without persistent identity remains unresolved',()=>{
  const state=createIdentityState()

  const result=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:05:00.000Z',

        relationships:[
          {
            type:'continuation',
            previous:['p1'],
            current:['c1']
          }
        ],

        births:[],

        disappearances:[]
      }
    )

  assert.equal(
    result.activeByObservation.has('c1'),
    false
  )

  assert.deepEqual(
    result.unresolvedPrevious,
    ['p1']
  )

  assert.deepEqual(
    result.unresolvedCurrent,
    ['c1']
  )
})

test('previous identity with no resolved lineage becomes unresolved rather than remaining active',()=>{
  let state=createIdentityState()

  state=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:00:00.000Z',

        relationships:[],

        births:['p1'],

        disappearances:[]
      }
    )

  state=
    advanceIdentityState(
      state,
      {
        observedAt:
          '2026-09-29T20:05:00.000Z',

        relationships:[],

        births:[],

        disappearances:[]
      }
    )

  assert.equal(
    state.activeByObservation.has('p1'),
    false
  )

  assert.deepEqual(
    state.unresolvedPrevious,
    ['p1']
  )

  assert.equal(
    state.tracks.get('track-1').status,
    'unresolved'
  )

  assert.equal(
    state.tracks.get('track-1').endedAt,
    '2026-09-29T20:05:00.000Z'
  )
})
