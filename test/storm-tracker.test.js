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
