'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  StormTracker,
  solveGlobalAssignment
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

function polygon(
  id,
  x,
  y=40,
  width=.04,
  height=.06,
  properties={}
){
  return {
    type:'Feature',
    id,
    properties:{
      detection:{
        areaKm2:properties.areaKm2??50,
        maxReflectivityDbz:properties.maxDbz??36
      }
    },
    geometry:{
      type:'Polygon',
      coordinates:[[
        [x,y],
        [x+width,y],
        [x+width,y+height],
        [x,y+height],
        [x,y]
      ]]
    }
  }
}

function tracker(config={}){
  return new StormTracker(
    {
      matchDistanceM:50000,
      historyFrames:8,
      maxMissedFrames:1,

      /*
       * Association v2 contract.
       * These options do not exist yet.
       */
      maxAssociationSpeedMps:25,
      minPredictionSamples:3,

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


/*
 * 0.10 deg longitude at 40 N is about 8.5 km.
 * 0.30 deg is about 25.5 km.
 */

test(
  'association v2 does not force physically unreasonable identity continuation',
  ()=>{
    const t=tracker()

    const first=t.update([
      polygon('a0',12.00)
    ],0)

    const id=first[0].trackId

    const second=t.update([
      polygon('a1',12.30)
    ],600000)

    assert.notEqual(
      second[0].trackId,
      id,
      'unreasonable displacement must start a new identity'
    )
  }
)


test(
  'association v2 prefers plausible continuation over distant alternative',
  ()=>{
    const t=tracker()

    const first=t.update([
      polygon('a0',12.00)
    ],0)

    const id=first[0].trackId

    const second=t.update([
      polygon('far',12.30),
      polygon('near',12.08)
    ],600000)

    assert.equal(
      second.find(x=>x.sourceId==='near').trackId,
      id
    )

    assert.notEqual(
      second.find(x=>x.sourceId==='far').trackId,
      id
    )
  }
)


test(
  'association v2 does not trust two-point velocity enough to reinforce a bad trajectory',
  ()=>{
    const t=tracker()

    const first=t.update([
      polygon('a0',12.00)
    ],0)

    const id=first[0].trackId

    /*
     * Plausible but fast first displacement.
     */
    t.update([
      polygon('a1',12.10)
    ],600000)

    /*
     * The velocity extrapolation would point toward ~12.20.
     * A physically coherent continuation exists much nearer
     * the actual previous observation.
     */
    const third=t.update([
      polygon('predicted-fast',12.20),
      polygon('plausible',12.14)
    ],1200000)

    assert.equal(
      third.find(x=>x.sourceId==='plausible').trackId,
      id
    )
  }
)


test(
  'association v2 rejects sharp vector reversal when coherent continuation exists',
  ()=>{
    const t=tracker()

    const first=t.update([
      polygon('a0',12.00)
    ],0)

    const id=first[0].trackId

    t.update([
      polygon('a1',12.06)
    ],600000)

    t.update([
      polygon('a2',12.12)
    ],1200000)

    const fourth=t.update([
      polygon('reverse',12.03),
      polygon('continue',12.18)
    ],1800000)

    assert.equal(
      fourth.find(x=>x.sourceId==='continue').trackId,
      id
    )

    assert.notEqual(
      fourth.find(x=>x.sourceId==='reverse').trackId,
      id
    )
  }
)


test(
  'association v2 does not assign best remaining implausible candidate',
  ()=>{
    const t=tracker()

    const first=t.update([
      polygon('left0',12.00),
      polygon('right0',12.20)
    ],0)

    const leftId=
      first.find(x=>x.sourceId==='left0').trackId

    const second=t.update([
      polygon('right1',12.22),
      polygon('unrelated',12.55)
    ],600000)

    /*
     * left0 has no credible continuation.
     * It must remain unmatched instead of inheriting unrelated.
     */
    assert.notEqual(
      second.find(x=>x.sourceId==='unrelated').trackId,
      leftId
    )
  }
)


test(
  'association v2 preserves plausible crossing identities',
  ()=>{
    const t=tracker()

    const first=t.update([
      polygon('east0',12.00),
      polygon('west0',12.24)
    ],0)

    const eastId=
      first.find(x=>x.sourceId==='east0').trackId

    const westId=
      first.find(x=>x.sourceId==='west0').trackId

    t.update([
      polygon('east1',12.05),
      polygon('west1',12.19)
    ],600000)

    t.update([
      polygon('east2',12.10),
      polygon('west2',12.14)
    ],1200000)

    const fourth=t.update([
      polygon('east3',12.15),
      polygon('west3',12.09)
    ],1800000)

    assert.equal(
      fourth.find(x=>x.sourceId==='east3').trackId,
      eastId
    )

    assert.equal(
      fourth.find(x=>x.sourceId==='west3').trackId,
      westId
    )
  }
)


test(
  'association v2 chooses minimum-cost frame-wide assignment rather than greedy pairs',
  ()=>{
    assert.equal(
      typeof solveGlobalAssignment,
      'function',
      'StormTracker must expose provider-neutral global assignment'
    )

    const pairs=[
      {
        trackId:'A',
        currentIndex:0,
        cost:.10,
        iou:0,
        distanceMeters:1000
      },
      {
        trackId:'A',
        currentIndex:1,
        cost:.20,
        iou:0,
        distanceMeters:2000
      },
      {
        trackId:'B',
        currentIndex:0,
        cost:.11,
        iou:0,
        distanceMeters:1100
      },
      {
        trackId:'B',
        currentIndex:1,
        cost:.90,
        iou:0,
        distanceMeters:9000
      }
    ]

    const assignment=solveGlobalAssignment(pairs)

    assert.equal(assignment.size,2)

    assert.equal(
      assignment.get(1).trackId,
      'A',
      'A should take observation Y'
    )

    assert.equal(
      assignment.get(0).trackId,
      'B',
      'B should take shared observation X'
    )

    const total=
      [...assignment.values()]
        .reduce((sum,pair)=>sum+pair.cost,0)

    assert.ok(
      Math.abs(total-.31)<1e-12,
      `expected global cost .31, got ${total}`
    )
  }
)


test(
  'association v2 global assignment is deterministic under pair ordering',
  ()=>{
    const pairs=[
      {trackId:'A',currentIndex:0,cost:.10,iou:0,distanceMeters:1000},
      {trackId:'A',currentIndex:1,cost:.20,iou:0,distanceMeters:2000},
      {trackId:'B',currentIndex:0,cost:.11,iou:0,distanceMeters:1100},
      {trackId:'B',currentIndex:1,cost:.90,iou:0,distanceMeters:9000}
    ]

    const normal=solveGlobalAssignment(pairs)
    const reversed=solveGlobalAssignment([...pairs].reverse())

    const compact=m=>
      [...m.entries()]
        .sort((a,b)=>a[0]-b[0])
        .map(([currentIndex,pair])=>[
          currentIndex,
          pair.trackId
        ])

    assert.deepEqual(
      compact(normal),
      compact(reversed)
    )
  }
)

test(
  'association v2 tracker uses the minimum-cost frame-wide assignment',
  ()=>{
    /*
     * Controlled association matrix:
     *
     *              X       Y
     *   A         10      20
     *   B         11      90
     *
     * Greedy:
     *   A -> X, B -> Y
     *
     * Global optimum:
     *   B -> X, A -> Y
     */

    const distances={
      'A:X':10,
      'A:Y':20,
      'B:X':11,
      'B:Y':90
    }

    const t=new StormTracker(
      {
        matchDistanceM:100,
        historyFrames:8,
        maxMissedFrames:1,
        maxAssociationSpeedMps:Infinity,
        minPredictionSamples:3
      },
      {
        centroidGeometry:g=>g?.centroid??null,

        polygonIoU:()=>0,

        haversine:(a,b)=>
          distances[`${a}:${b}`] ?? Infinity,

        robustTrackVelocity:history=>({
          samples:history.length,
          east:0,
          north:0,
          residualMeters:0,
          confidence:0
        }),

        localPoint:origin=>origin,

        translateGeometryLocal:geometry=>geometry
      }
    )

    const feature=(id,centroid)=>({
      type:'Feature',
      id,
      properties:{},
      geometry:{centroid}
    })

    const first=t.update([
      feature('a0','A'),
      feature('b0','B')
    ],0)

    const aId=
      first.find(x=>x.sourceId==='a0').trackId

    const bId=
      first.find(x=>x.sourceId==='b0').trackId

    const second=t.update([
      feature('x','X'),
      feature('y','Y')
    ],600000)

    assert.equal(
      second.find(x=>x.sourceId==='x').trackId,
      bId,
      'X must be assigned to B in the global optimum'
    )

    assert.equal(
      second.find(x=>x.sourceId==='y').trackId,
      aId,
      'Y must be assigned to A in the global optimum'
    )
  }
)

test(
  'association v2 breaks identity rather than accept established vector reversal',
  ()=>{
    const t=tracker({
      maxAssociationSpeedMps:25,
      minPredictionSamples:3,
      maxEstablishedTurnDeg:90,
      minDirectionalSpeedMps:3
    })

    const first=t.update([
      polygon('a0',12.00)
    ],0)

    const id=first[0].trackId

    t.update([
      polygon('a1',12.06)
    ],600000)

    t.update([
      polygon('a2',12.12)
    ],1200000)

    /*
     * Established motion is eastward.
     * Only candidate now requires a substantial reversal.
     */
    const fourth=t.update([
      polygon('reversal',12.04)
    ],1800000)

    assert.notEqual(
      fourth[0].trackId,
      id,
      'strong reversal must break identity'
    )
  }
)


test(
  'association v2 does not apply direction gate to nearly stationary track',
  ()=>{
    const t=tracker({
      maxAssociationSpeedMps:25,
      minPredictionSamples:3,
      maxEstablishedTurnDeg:90,
      minDirectionalSpeedMps:3
    })

    const first=t.update([
      polygon('a0',12.000)
    ],0)

    const id=first[0].trackId

    t.update([
      polygon('a1',12.002)
    ],600000)

    t.update([
      polygon('a2',12.001)
    ],1200000)

    const fourth=t.update([
      polygon('a3',12.003)
    ],1800000)

    assert.equal(
      fourth[0].trackId,
      id,
      'centroid jitter at very low speed must not look like a reversal'
    )
  }
)

test(
  'association v2 applies direction sanity when adding the third observation',
  ()=>{
    const t=tracker({
      maxAssociationSpeedMps:25,
      minPredictionSamples:3,
      maxEstablishedTurnDeg:90,
      minDirectionalSpeedMps:3
    })

    const first=t.update([
      polygon('a0',12.00)
    ],0)

    const id=first[0].trackId

    t.update([
      polygon('a1',12.06)
    ],600000)

    const third=t.update([
      polygon('reverse',11.99)
    ],1200000)

    assert.notEqual(
      third[0].trackId,
      id,
      'third observation must not reverse the first meaningful vector'
    )
  }
)

test(
  'association v2 rejects repeated multi-frame directional zig-zag',
  ()=>{
    const t=tracker({
      maxAssociationSpeedMps:25,
      minPredictionSamples:3,
      maxEstablishedTurnDeg:90,
      minDirectionalSpeedMps:3,

      /*
       * Multi-frame direction-consensus contract.
       *
       * A single direction change remains acceptable.
       * Repeated alternating meaningful turns indicate
       * unstable identity association.
       */
      directionConsensusWindow:4,
      minConsensusTurnDeg:20,
      maxConsensusReversals:1
    })

    /*
     * Construct approximately:
     *
     *   course 30 -> 80 -> 30 -> 80
     *
     * Every adjacent turn is only ~50 degrees, therefore
     * the existing 90-degree gate accepts the sequence.
     *
     * The final segment creates the second meaningful
     * alternating turn reversal and must break identity.
     */
    const first=t.update([
      polygon('z0',12.000,40.000)
    ],0)

    const id=first[0].trackId

    const second=t.update([
      polygon('z1',12.030,40.040)
    ],600000)

    assert.equal(second[0].trackId,id)

    const third=t.update([
      polygon('z2',12.080,40.048)
    ],1200000)

    assert.equal(third[0].trackId,id)

    const fourth=t.update([
      polygon('z3',12.110,40.088)
    ],1800000)

    assert.equal(fourth[0].trackId,id)

    const fifth=t.update([
      polygon('z4',12.160,40.096)
    ],2400000)

    assert.notEqual(
      fifth[0].trackId,
      id,
      'second alternating meaningful turn reversal must break identity'
    )
  }
)

test(
  'association v2 preserves coherent multi-frame turning',
  ()=>{
    const t=tracker({
      maxAssociationSpeedMps:25,
      minPredictionSamples:3,
      maxEstablishedTurnDeg:90,
      minDirectionalSpeedMps:3,
      directionConsensusWindow:4,
      minConsensusTurnDeg:20,
      maxConsensusReversals:1
    })

    /*
     * Smoothly turning trajectory.
     *
     * This must remain one identity: multi-frame consensus
     * must distinguish coherent curvature from zig-zag.
     */
    const first=t.update([
      polygon('c0',12.000,40.000)
    ],0)

    const id=first[0].trackId

    const frames=[
      polygon('c1',12.020,40.050),
      polygon('c2',12.050,40.095),
      polygon('c3',12.090,40.132),
      polygon('c4',12.140,40.160)
    ]

    for(let i=0;i<frames.length;i++){
      const result=t.update(
        [frames[i]],
        (i+1)*600000
      )

      assert.equal(
        result[0].trackId,
        id,
        `coherent turning must survive frame ${i+2}`
      )
    }
  }
)

test(
  'association v2 tolerates one recent directional correction',
  ()=>{
    const t=tracker({
      maxAssociationSpeedMps:25,
      minPredictionSamples:3,
      maxEstablishedTurnDeg:90,
      minDirectionalSpeedMps:3,
      directionConsensusWindow:4,
      minConsensusTurnDeg:20,
      maxConsensusReversals:1
    })

    /*
     * One substantial correction followed by stabilization
     * is not enough evidence to destroy an otherwise credible
     * identity.
     */
    const first=t.update([
      polygon('n0',12.000,40.000)
    ],0)

    const id=first[0].trackId

    const frames=[
      polygon('n1',12.030,40.040),
      polygon('n2',12.080,40.048),
      polygon('n3',12.110,40.088),
      polygon('n4',12.140,40.128)
    ]

    for(let i=0;i<frames.length;i++){
      const result=t.update(
        [frames[i]],
        (i+1)*600000
      )

      assert.equal(
        result[0].trackId,
        id,
        `single correction must not break identity at frame ${i+2}`
      )
    }
  }
)
