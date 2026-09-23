'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { StormEngine } = require('../lib/storm-engine')

function polygon(id, x1, y1 = 40, width = 0.10, height = 0.10) {
  return {
    type: 'Feature',
    id,
    properties: { severity: 3 },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [x1, y1],
        [x1 + width, y1],
        [x1 + width, y1 + height],
        [x1, y1 + height],
        [x1, y1]
      ]]
    }
  }
}

const vessel = {
  position: { longitude: 0, latitude: 0 },
  sog: 0,
  cog: 0
}

test('association prefers locked IoU plus centroid-distance cost', () => {
  const engine = new StormEngine({
    matchDistanceM: 100000,
    historyFrames: 8
  })

  const first = engine.evaluate({
    epochMs: 0,
    features: [polygon('a', 12.00)]
  }, vessel)

  const originalTrack = first[0].trackId

  const second = engine.evaluate({
    epochMs: 300000,
    features: [
      // Centroid is exactly aligned with the previous object, but overlap
      // is deliberately very small.
      polygon('closer-centroid', 12.045, 40, 0.01, 0.10),

      // Centroid is slightly farther away, but geometry overlaps strongly.
      // The locked IoU + distance association must prefer this candidate.
      polygon('overlap', 12.02, 40, 0.10, 0.10)
    ]
  }, vessel)

  const retained = second.find(c => c.trackId === originalTrack)

  assert.ok(retained)
  assert.equal(retained.sourceId, 'overlap')
})

test('split keeps parent track on best child and assigns parentTrackId to new child', () => {
  const engine = new StormEngine({
    matchDistanceM: 100000,
    historyFrames: 8
  })

  const first = engine.evaluate({
    epochMs: 0,
    features: [polygon('parent', 12.00)]
  }, vessel)

  const parentTrackId = first[0].trackId

  const second = engine.evaluate({
    epochMs: 300000,
    features: [
      polygon('child-best', 12.01, 40, 0.06, 0.10),
      polygon('child-new', 12.07, 40, 0.06, 0.10)
    ]
  }, vessel)

  const retained = second.find(c => c.trackId === parentTrackId)
  const created = second.find(c => c.trackId !== parentTrackId)

  assert.ok(retained)
  assert.ok(created)
  assert.equal(retained.sourceId, 'child-best')
  assert.equal(created.parentTrackId, parentTrackId)
})

test('merge keeps lowest-cost parent and records mergedInto on closed parent', () => {
  const engine = new StormEngine({
    matchDistanceM: 100000,
    historyFrames: 8
  })

  const first = engine.evaluate({
    epochMs: 0,
    features: [
      polygon('left', 12.00, 40, 0.08, 0.10),
      polygon('right', 12.08, 40, 0.08, 0.10)
    ]
  }, vessel)

  const leftTrack = first.find(c => c.sourceId === 'left').trackId
  const rightTrack = first.find(c => c.sourceId === 'right').trackId

  const second = engine.evaluate({
    epochMs: 300000,
    features: [
      polygon('merged', 12.02, 40, 0.14, 0.10)
    ]
  }, vessel)

  assert.equal(second.length, 1)

  const survivor = second[0].trackId
  assert.ok([leftTrack, rightTrack].includes(survivor))

  const loser = survivor === leftTrack ? rightTrack : leftTrack
  const state = engine.snapshotState?.()

  assert.ok(state)
  const merged = state.activeTracks?.find(t => t.trackId === loser)
    || state.closedTracks?.find?.(t => t.trackId === loser)

  assert.ok(merged)
  assert.equal(merged.lifecycle?.mergedInto, survivor)
})


test('distance-only proximity does not create split or merge lineage', () => {
  {
    const engine = new StormEngine({
      matchDistanceM: 100000,
      historyFrames: 8
    })

    const first = engine.evaluate({
      epochMs: 0,
      features: [
        polygon('parent', 12.00, 40, 0.04, 0.10)
      ]
    }, vessel)

    const parentTrackId = first[0].trackId

    const second = engine.evaluate({
      epochMs: 300000,
      features: [
        // Genuine continuation: overlaps the parent.
        polygon('retained', 12.01, 40, 0.04, 0.10),

        // Nearby enough for ordinary association eligibility, but with
        // no polygon overlap. It must not be labelled as a split child.
        polygon('nearby-independent', 12.30, 40, 0.04, 0.10)
      ]
    }, vessel)

    const retained = second.find(c => c.trackId === parentTrackId)
    const independent = second.find(c => c.sourceId === 'nearby-independent')

    assert.ok(retained)
    assert.ok(independent)
    assert.notEqual(independent.trackId, parentTrackId)
    assert.equal(independent.parentTrackId, null)
  }

  {
    const engine = new StormEngine({
      matchDistanceM: 100000,
      historyFrames: 8,
      maxMissedFrames: 1
    })

    const first = engine.evaluate({
      epochMs: 0,
      features: [
        polygon('left', 12.00, 40, 0.04, 0.10),
        polygon('nearby-right', 12.30, 40, 0.04, 0.10)
      ]
    }, vessel)

    const leftTrack = first.find(c => c.sourceId === 'left').trackId
    const rightTrack = first.find(c => c.sourceId === 'nearby-right').trackId

    const second = engine.evaluate({
      epochMs: 300000,
      features: [
        // Overlaps only the left track. The right track is close enough
        // for distance-only association eligibility but is not a merge.
        polygon('continuation', 12.01, 40, 0.04, 0.10)
      ]
    }, vessel)

    assert.equal(second.length, 1)
    assert.equal(second[0].trackId, leftTrack)

    const state = engine.snapshotState()

    assert.ok(
      state.activeTracks.some(t => t.trackId === rightTrack),
      'distance-only competing track should remain active/dormant'
    )

    assert.ok(
      !state.closedTracks.some(
        t =>
          t.trackId === rightTrack &&
          t.lifecycle?.mergedInto === leftTrack
      ),
      'distance-only competing track must not be recorded as merged'
    )
  }
})

test('unmatched track is retained briefly and expires after lifecycle horizon', () => {
  const engine = new StormEngine({
    matchDistanceM: 100000,
    historyFrames: 8,
    maxMissedFrames: 1
  })

  const first = engine.evaluate({
    epochMs: 0,
    features: [polygon('cell', 12.00)]
  }, vessel)

  const trackId = first[0].trackId

  engine.evaluate({
    epochMs: 300000,
    features: []
  }, vessel)

  let state = engine.snapshotState?.()
  assert.ok(state)
  assert.ok(state.activeTracks.some(t => t.trackId === trackId))

  engine.evaluate({
    epochMs: 600000,
    features: []
  }, vessel)

  state = engine.snapshotState?.()
  assert.ok(state)
  assert.ok(!state.activeTracks.some(t => t.trackId === trackId))
})
