'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  StormTracker
}=require('../lib/storm-tracker')

const {
  centroidGeometry,
  polygonIoU,
  translateGeometryLocal
}=require('../lib/storm-geometry')

const {
  haversine,
  robustTrackVelocity,
  localPoint
}=require('../lib/storm-motion')

function polygon(id,x1,y1=40,width=.10,height=.10){
  return {
    type:'Feature',
    id,
    properties:{severity:3},
    geometry:{
      type:'Polygon',
      coordinates:[[
        [x1,y1],
        [x1+width,y1],
        [x1+width,y1+height],
        [x1,y1+height],
        [x1,y1]
      ]]
    }
  }
}

function tracker(config={}){
  return new StormTracker(
    {
      matchDistanceM:100000,
      historyFrames:8,
      maxMissedFrames:1,
      ...config
    },
    {
      centroidGeometry,
      polygonIoU,
      haversine,
      robustTrackVelocity,
      localPoint,
      translateGeometryLocal
    }
  )
}

test('tracker preserves persistent identity',()=>{
  const t=tracker()

  const first=t.update(
    [polygon('a',12)],
    0
  )

  const id=first[0].trackId

  const second=t.update(
    [polygon('b',12.02)],
    300000
  )

  assert.equal(second[0].trackId,id)
})

test('tracker records split lineage only on overlap',()=>{
  const t=tracker()

  const first=t.update(
    [polygon('parent',12)],
    0
  )

  const parent=first[0].trackId

  const second=t.update([
    polygon('best',12.01,40,.06,.10),
    polygon('new',12.07,40,.06,.10)
  ],300000)

  const created=second.find(
    x=>x.trackId!==parent
  )

  assert.ok(created)
  assert.equal(created.parentTrackId,parent)
})

test('tracker records merge lifecycle',()=>{
  const t=tracker()

  const first=t.update([
    polygon('left',12,40,.08,.10),
    polygon('right',12.08,40,.08,.10)
  ],0)

  const ids=first.map(x=>x.trackId)

  const second=t.update(
    [polygon('merged',12.02,40,.14,.10)],
    300000
  )

  assert.equal(second.length,1)

  const survivor=second[0].trackId
  const loser=ids.find(id=>id!==survivor)

  const closed=t.snapshotState()
    .closedTracks
    .find(x=>x.trackId===loser)

  assert.ok(closed)
  assert.equal(
    closed.lifecycle.mergedInto,
    survivor
  )
})

test('tracker retains then expires unmatched track',()=>{
  const t=tracker({
    maxMissedFrames:1
  })

  const first=t.update(
    [polygon('cell',12)],
    0
  )

  const id=first[0].trackId

  t.update([],300000)

  assert.ok(
    t.snapshotState().activeTracks
      .some(x=>x.trackId===id)
  )

  t.update([],600000)

  assert.ok(
    !t.snapshotState().activeTracks
      .some(x=>x.trackId===id)
  )

  assert.ok(
    t.snapshotState().closedTracks
      .some(x=>
        x.trackId===id &&
        x.lifecycle.status==='expired'
      )
  )
})


// PHASE 7.3c TRACKER STRESS VALIDATION GATE 1

test('nearby parallel cells retain separate track identities',()=>{
  const t=tracker()

  const first=t.update([
    polygon('left-0',12.00,40,.04,.08),
    polygon('right-0',12.25,40,.04,.08)
  ],0)

  const leftId=first.find(x=>x.sourceId==='left-0').trackId
  const rightId=first.find(x=>x.sourceId==='right-0').trackId

  const second=t.update([
    polygon('left-1',12.02,40,.04,.08),
    polygon('right-1',12.27,40,.04,.08)
  ],300000)

  assert.equal(
    second.find(x=>x.sourceId==='left-1').trackId,
    leftId
  )

  assert.equal(
    second.find(x=>x.sourceId==='right-1').trackId,
    rightId
  )

  assert.notEqual(leftId,rightId)
})


test('crossing cells retain identity using predicted motion',()=>{
  const t=tracker({
    matchDistanceM:100000
  })

  const first=t.update([
    polygon('eastbound-0',12.00,40,.03,.06),
    polygon('westbound-0',12.30,40,.03,.06)
  ],0)

  const eastboundId=
    first.find(x=>x.sourceId==='eastbound-0').trackId

  const westboundId=
    first.find(x=>x.sourceId==='westbound-0').trackId

  t.update([
    polygon('eastbound-1',12.10,40,.03,.06),
    polygon('westbound-1',12.20,40,.03,.06)
  ],300000)

  const third=t.update([
    polygon('eastbound-2',12.20,40,.03,.06),
    polygon('westbound-2',12.10,40,.03,.06)
  ],600000)

  assert.equal(
    third.find(x=>x.sourceId==='eastbound-2').trackId,
    eastboundId
  )

  assert.equal(
    third.find(x=>x.sourceId==='westbound-2').trackId,
    westboundId
  )
})


test('one missed frame reacquires the existing track',()=>{
  const t=tracker({
    maxMissedFrames:1
  })

  const first=t.update(
    [polygon('cell-0',12.00)],
    0
  )

  const trackId=first[0].trackId

  t.update(
    [polygon('cell-1',12.04)],
    300000
  )

  const missed=t.update([],600000)

  assert.equal(missed.length,0)

  const dormant=t.snapshotState()
    .activeTracks
    .find(x=>x.trackId===trackId)

  assert.ok(dormant)
  assert.equal(dormant.lifecycle.missedFrames,1)

  const reacquired=t.update(
    [polygon('cell-3',12.12)],
    900000
  )

  assert.equal(reacquired.length,1)
  assert.equal(reacquired[0].trackId,trackId)

  const active=t.snapshotState()
    .activeTracks
    .find(x=>x.trackId===trackId)

  assert.ok(active)
  assert.equal(active.lifecycle.missedFrames,0)
})


test('irregular observation intervals preserve track identity',()=>{
  const t=tracker({
    matchDistanceM:100000
  })

  const first=t.update(
    [polygon('cell-0',12.00,40,.03,.06)],
    0
  )

  const trackId=first[0].trackId

  const second=t.update(
    [polygon('cell-1',12.04,40,.03,.06)],
    120000
  )

  assert.equal(second[0].trackId,trackId)

  /*
   * Same approximate eastward motion, but after a much longer
   * observation interval.
   */
  const third=t.update(
    [polygon('cell-2',12.18,40,.03,.06)],
    540000
  )

  assert.equal(third[0].trackId,trackId)

  const state=t.snapshotState()
  const active=state.activeTracks.find(
    x=>x.trackId===trackId
  )

  assert.ok(active)
  assert.equal(active.lifecycle.observations,3)
  assert.equal(active.history.length,3)
})


test('same-timestamp replacement does not duplicate track history',()=>{
  const t=tracker()

  const first=t.update(
    [polygon('initial',12.00)],
    300000
  )

  const trackId=first[0].trackId

  const replacement=t.update(
    [polygon('replacement',12.01)],
    300000
  )

  assert.equal(replacement[0].trackId,trackId)

  const active=t.snapshotState()
    .activeTracks
    .find(x=>x.trackId===trackId)

  assert.ok(active)

  assert.equal(
    active.history.length,
    1,
    'same timestamp must replace rather than append history'
  )

  assert.equal(
    active.history[0].epochMs,
    300000
  )
})


test('match-distance boundary is deterministic for rapid motion',()=>{
  /*
   * At latitude 40 degrees, 1.10 degrees longitude is roughly
   * 94 km and 1.30 degrees is roughly 111 km.
   *
   * With matchDistanceM = 100 km and no polygon overlap,
   * the first case should associate and the second should not.
   */

  {
    const t=tracker({
      matchDistanceM:100000
    })

    const first=t.update(
      [polygon('start',12.00,40,.02,.04)],
      0
    )

    const original=first[0].trackId

    const second=t.update(
      [polygon('inside',13.10,40,.02,.04)],
      300000
    )

    assert.equal(second[0].trackId,original)
  }

  {
    const t=tracker({
      matchDistanceM:100000
    })

    const first=t.update(
      [polygon('start',12.00,40,.02,.04)],
      0
    )

    const original=first[0].trackId

    const second=t.update(
      [polygon('outside',13.30,40,.02,.04)],
      300000
    )

    assert.notEqual(second[0].trackId,original)

    /*
     * The unmatched original track remains dormant for the
     * configured missed-frame horizon rather than being silently
     * converted into the new observation.
     */
    assert.ok(
      t.snapshotState().activeTracks.some(
        x=>x.trackId===original
      )
    )
  }
})


// PHASE 7.3c TRACKER STRESS VALIDATION GATE 2

test('three-way split preserves one parent and creates two children with lineage',()=>{
  const t=tracker({
    matchDistanceM:100000
  })

  const first=t.update([
    polygon('parent',12.00,40,.18,.10)
  ],0)

  const parentId=first[0].trackId

  const second=t.update([
    polygon('child-left',12.00,40,.06,.10),
    polygon('child-middle',12.06,40,.06,.10),
    polygon('child-right',12.12,40,.06,.10)
  ],300000)

  assert.equal(second.length,3)

  const retained=second.find(x=>x.trackId===parentId)
  const children=second.filter(x=>x.trackId!==parentId)

  assert.ok(retained)
  assert.equal(children.length,2)

  for(const child of children){
    assert.equal(
      child.parentTrackId,
      parentId,
      'new split children must reference original parent'
    )
  }
})


test('multi-parent merge preserves one survivor and closes all overlapping losers',()=>{
  const t=tracker({
    matchDistanceM:100000
  })

  const first=t.update([
    polygon('left',12.00,40,.06,.10),
    polygon('middle',12.06,40,.06,.10),
    polygon('right',12.12,40,.06,.10)
  ],0)

  const originalIds=first.map(x=>x.trackId)

  const second=t.update([
    polygon('merged',12.00,40,.18,.10)
  ],300000)

  assert.equal(second.length,1)

  const survivor=second[0].trackId
  assert.ok(originalIds.includes(survivor))

  const losers=originalIds.filter(id=>id!==survivor)

  const state=t.snapshotState()

  for(const loser of losers){
    const closed=state.closedTracks.find(
      x=>x.trackId===loser
    )

    assert.ok(
      closed,
      `merged parent ${loser} should be closed`
    )

    assert.equal(
      closed.lifecycle.status,
      'merged'
    )

    assert.equal(
      closed.lifecycle.mergedInto,
      survivor
    )
  }
})


test('split followed by merge keeps lineage coherent',()=>{
  const t=tracker({
    matchDistanceM:100000
  })

  const first=t.update([
    polygon('parent',12.00,40,.12,.10)
  ],0)

  const parentId=first[0].trackId

  const split=t.update([
    polygon('child-a',12.00,40,.06,.10),
    polygon('child-b',12.06,40,.06,.10)
  ],300000)

  assert.equal(split.length,2)

  const retained=split.find(x=>x.trackId===parentId)
  const created=split.find(x=>x.trackId!==parentId)

  assert.ok(retained)
  assert.ok(created)
  assert.equal(created.parentTrackId,parentId)

  const merged=t.update([
    polygon('merged-again',12.00,40,.12,.10)
  ],600000)

  assert.equal(merged.length,1)

  const survivor=merged[0].trackId
  assert.ok(
    [retained.trackId,created.trackId].includes(survivor)
  )

  const loser=
    survivor===retained.trackId
      ? created.trackId
      : retained.trackId

  const closed=t.snapshotState()
    .closedTracks
    .find(x=>x.trackId===loser)

  assert.ok(closed)
  assert.equal(closed.lifecycle.status,'merged')
  assert.equal(closed.lifecycle.mergedInto,survivor)
})


test('track identity survives dateline crossing eastward',()=>{
  const t=tracker({
    matchDistanceM:100000
  })

  const first=t.update([
    polygon('before',179.70,10,.08,.08)
  ],0)

  const trackId=first[0].trackId

  const second=t.update([
    polygon('after',-179.75,10,.08,.08)
  ],300000)

  assert.equal(second.length,1)
  assert.equal(
    second[0].trackId,
    trackId,
    'dateline crossing must preserve track identity'
  )
})


test('association result is deterministic under reversed input order',()=>{
  function runScenario(reverseSecondFrame=false){
    const t=tracker({
      matchDistanceM:100000
    })

    const first=t.update([
      polygon('left-0',12.00,40,.04,.08),
      polygon('right-0',12.20,40,.04,.08)
    ],0)

    const leftId=first.find(
      x=>x.sourceId==='left-0'
    ).trackId

    const rightId=first.find(
      x=>x.sourceId==='right-0'
    ).trackId

    const features=[
      polygon('left-1',12.02,40,.04,.08),
      polygon('right-1',12.22,40,.04,.08)
    ]

    const second=t.update(
      reverseSecondFrame
        ? [...features].reverse()
        : features,
      300000
    )

    return {
      left:
        second.find(x=>x.sourceId==='left-1').trackId,
      right:
        second.find(x=>x.sourceId==='right-1').trackId,
      leftId,
      rightId
    }
  }

  const normal=runScenario(false)
  const reversed=runScenario(true)

  assert.equal(normal.left,normal.leftId)
  assert.equal(normal.right,normal.rightId)

  assert.equal(reversed.left,reversed.leftId)
  assert.equal(reversed.right,reversed.rightId)

  assert.deepEqual(
    {
      left:normal.left===normal.leftId,
      right:normal.right===normal.rightId
    },
    {
      left:reversed.left===reversed.leftId,
      right:reversed.right===reversed.rightId
    }
  )
})


test('coverage-edge disappearance expires cleanly without false merge lineage',()=>{
  const t=tracker({
    maxMissedFrames:1,
    matchDistanceM:100000
  })

  const first=t.update([
    polygon('edge-cell',12.00,40,.04,.08)
  ],0)

  const trackId=first[0].trackId

  t.update([],300000)
  t.update([],600000)

  const state=t.snapshotState()

  assert.ok(
    !state.activeTracks.some(
      x=>x.trackId===trackId
    )
  )

  const closed=state.closedTracks.find(
    x=>x.trackId===trackId
  )

  assert.ok(closed)
  assert.equal(closed.lifecycle.status,'expired')
  assert.equal(closed.lifecycle.mergedInto,null)
})

test('tracker v2 snapshot round-trip preserves state and monotonic track ids',()=>{
  const t=tracker({
    maxMissedFrames:0
  })

  /*
   * Issue storm-1, then expire it so closed-track state must survive.
   */
  const first=t.update(
    [polygon('old',12.00)],
    0
  )

  assert.equal(first[0].trackId,'storm-1')

  t.update([],300000)

  /*
   * Create an active storm with enriched Storm Model v2 history.
   */
  const activeFeature=polygon('active',14.00)

  activeFeature.properties={
    observedAt:'2026-09-27T11:10:00.000Z',

    detection:{
      areaKm2:12.5
    },

    evidence:{
      reflectivity:{
        available:true,
        maxDbz:42,
        units:'dBZ',
        representation:'derived-reflectivity-estimate'
      }
    }
  }

  const active=t.update(
    [activeFeature],
    600000
  )

  assert.equal(active[0].trackId,'storm-2')

  const snapshot=t.snapshotState()

  assert.equal(snapshot.version,2)
  assert.equal(snapshot.nextTrack,3)

  assert.equal(snapshot.activeTracks.length,1)
  assert.equal(snapshot.closedTracks.length,1)

  const history=snapshot.activeTracks[0].history

  assert.equal(history.length,1)

  assert.equal(
    history[0].observedAt,
    '2026-09-27T11:10:00.000Z'
  )

  assert.deepEqual(
    history[0].geometry,
    activeFeature.geometry
  )

  assert.equal(
    history[0].areaKm2,
    12.5
  )

  assert.deepEqual(
    history[0].reflectivity,
    activeFeature.properties.evidence.reflectivity
  )

  /*
   * Restore into a completely fresh tracker.
   */
  const restored=tracker({
    maxMissedFrames:0
  })

  restored.restoreState(snapshot)

  assert.deepEqual(
    restored.snapshotState(),
    snapshot
  )

  /*
   * A genuinely new storm must continue from the persisted counter.
   * It must never reuse storm-1 or storm-2 after process restart.
   */
  const next=restored.update(
    [polygon('new',30.00)],
    900000
  )

  assert.equal(next.length,1)
  assert.equal(next[0].trackId,'storm-3')
})
