'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  StormTracker
}=require('../lib/storm-tracker')

const engine=require('../lib/storm-engine')

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
      centroidGeometry:engine.centroidGeometry,
      polygonIoU:(a,b)=>{
        /*
         * polygonIoU is intentionally not public StormEngine API.
         * Reproduce the locked overlap condition for this direct
         * tracker unit boundary using the existing geometry helper
         * through a tiny local implementation below.
         */
        const polygonClipping=require('polygon-clipping')

        const ca=engine.centroidGeometry(a)
        if(!ca)return 0

        const unwrap=(lon,ref)=>{
          let v=Number(lon)
          while(v-ref>=180)v-=360
          while(v-ref< -180)v+=360
          return v
        }

        const normalize=g=>{
          if(!g||!['Polygon','MultiPolygon'].includes(g.type))
            return null
          const polys=g.type==='Polygon'
            ? [g.coordinates]
            : g.coordinates
          return polys.map(poly=>
            poly.map(ring=>
              ring.map(p=>[
                unwrap(Number(p[0]),ca[0]),
                Number(p[1])
              ])
            )
          )
        }

        const areaRing=ring=>{
          let area=0
          for(let i=0;i<ring.length;i++){
            const p=ring[i]
            const q=ring[(i+1)%ring.length]
            area+=p[0]*q[1]-q[0]*p[1]
          }
          return Math.abs(area)/2
        }

        const area=mp=>{
          let total=0
          for(const poly of mp||[]){
            if(!poly?.length)continue
            total+=areaRing(poly[0]||[])
            for(let i=1;i<poly.length;i++)
              total-=areaRing(poly[i]||[])
          }
          return Math.max(0,total)
        }

        try{
          const aa=normalize(a)
          const bb=normalize(b)
          const inter=polygonClipping.intersection(aa,bb)
          const union=polygonClipping.union(aa,bb)
          const u=area(union)
          return u>0?area(inter)/u:0
        }catch{
          return 0
        }
      },
      haversine:engine.haversine,
      robustTrackVelocity:engine.robustTrackVelocity,
      translateGeometryLocal:engine.translateGeometryLocal,
      localPoint:(origin,east,north)=>{
        const R=6371008.8
        const rad=d=>d*Math.PI/180
        const deg=r=>r*180/Math.PI
        const lat=origin[1]+deg(north/R)
        const cos=Math.max(
          .05,
          Math.cos(rad((origin[1]+lat)/2))
        )
        let lon=origin[0]+deg(east/(R*cos))
        while(lon>180)lon-=360
        while(lon<-180)lon+=360
        return [lon,lat]
      }
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
