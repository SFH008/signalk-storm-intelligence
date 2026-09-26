'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  haversine,
  bearing,
  velocityBetween,
  localVectorMeters,
  localPoint,
  robustTrackVelocity,
  normalizeLongitude,
  unwrapLongitude
}=require('../lib/storm-motion')

test('distance and bearing preserve geographic baseline',()=>{
  const a=[0,0]
  const b=[1,0]

  assert.ok(
    Math.abs(haversine(a,b)-111195)<100
  )

  assert.ok(
    Math.abs(bearing(a,b)-90)<1e-9
  )
})

test('local vector and local point round-trip',()=>{
  const origin=[12,40]
  const target=[12.15,40.10]

  const v=
    localVectorMeters(origin,target)

  const restored=
    localPoint(
      origin,
      v.east,
      v.north
    )

  assert.ok(
    Math.abs(restored[0]-target[0])<1e-6
  )

  assert.ok(
    Math.abs(restored[1]-target[1])<1e-6
  )
})

test('velocityBetween reports eastward motion',()=>{
  const v=velocityBetween(
    [12,40],
    [12.05,40],
    300
  )

  assert.ok(v.east>0)
  assert.ok(Math.abs(v.north)<0.1)
  assert.ok(v.speed>0)
  assert.ok(Math.abs(v.course-90)<0.1)
})

test('robust velocity ignores zero-time duplicate step',()=>{
  const result=robustTrackVelocity([
    {
      epochMs:0,
      centroid:[12,40]
    },
    {
      epochMs:300000,
      centroid:[12.05,40]
    },
    {
      epochMs:300000,
      centroid:[12.06,40]
    },
    {
      epochMs:600000,
      centroid:[12.10,40]
    }
  ])

  assert.ok(result.east>0)
  assert.ok(result.speed>0)

  assert.equal(
    result.method,
    'track-robust'
  )

  assert.equal(
    result.samples,
    4
  )
})

test('insufficient history reports unavailable motion confidence',()=>{
  const result=robustTrackVelocity([
    {
      epochMs:0,
      centroid:[12,40]
    }
  ])

  assert.equal(result.east,0)
  assert.equal(result.north,0)
  assert.equal(result.speed,0)
  assert.equal(result.course,null)
  assert.equal(result.samples,1)
  assert.equal(result.confidence,0)
  assert.equal(result.residualMeters,null)
})

test('longitude helpers remain dateline-safe',()=>{
  assert.equal(
    normalizeLongitude(181),
    -179
  )

  assert.equal(
    normalizeLongitude(-181),
    179
  )

  assert.equal(
    unwrapLongitude(-179,179),
    181
  )
})


// PHASE 7.3e1 MOTION QUALITY CONTRACT

function buildMotionHistory({
  start=[12,40],
  velocities,
  intervals
}) {
  const out=[{
    epochMs:0,
    centroid:start
  }]

  let point=start
  let epochMs=0

  for(let i=0;i<velocities.length;i++){
    const dt=intervals[i]
    const v=velocities[i]

    point=localPoint(
      point,
      v.east*dt,
      v.north*dt
    )

    epochMs += dt*1000

    out.push({
      epochMs,
      centroid:point
    })
  }

  return out
}


test('accelerating storm reports positive along-track acceleration',()=>{
  const result=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:4,north:0},
        {east:6,north:0},
        {east:10,north:0},
        {east:16,north:0}
      ],
      intervals:[300,300,300,300]
    })
  )

  assert.ok(
    Number.isFinite(result.accelerationMps2),
    'motion result must expose accelerationMps2'
  )

  assert.ok(
    result.accelerationMps2 > 0,
    `expected positive acceleration, got ${result.accelerationMps2}`
  )
})


test('decelerating storm reports negative along-track acceleration',()=>{
  const result=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:16,north:0},
        {east:10,north:0},
        {east:6,north:0},
        {east:4,north:0}
      ],
      intervals:[300,300,300,300]
    })
  )

  assert.ok(
    Number.isFinite(result.accelerationMps2),
    'motion result must expose accelerationMps2'
  )

  assert.ok(
    result.accelerationMps2 < 0,
    `expected negative acceleration, got ${result.accelerationMps2}`
  )
})


test('turning storm reports turn rate and reduces predictive confidence',()=>{
  const straight=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:10,north:0},
        {east:10,north:0},
        {east:10,north:0},
        {east:10,north:0}
      ],
      intervals:[300,300,300,300]
    })
  )

  const turning=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:10,north:0},
        {east:8,north:4},
        {east:4,north:8},
        {east:0,north:10}
      ],
      intervals:[300,300,300,300]
    })
  )

  assert.ok(
    Number.isFinite(turning.turnRateDegPerMin),
    'motion result must expose turnRateDegPerMin'
  )

  assert.ok(
    Math.abs(turning.turnRateDegPerMin) > 0.1,
    `expected meaningful turn rate, got ${turning.turnRateDegPerMin}`
  )

  assert.ok(
    Number.isFinite(turning.predictiveConfidence),
    'motion result must expose predictiveConfidence'
  )

  assert.ok(
    Number.isFinite(straight.predictiveConfidence),
    'straight motion must expose predictiveConfidence'
  )

  assert.ok(
    turning.predictiveConfidence <
      straight.predictiveConfidence,
    `turning confidence ${turning.predictiveConfidence} should be lower than straight confidence ${straight.predictiveConfidence}`
  )
})


test('abnormally long latest interval reduces freshness confidence',()=>{
  const regular=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:10,north:0},
        {east:10,north:0},
        {east:10,north:0}
      ],
      intervals:[300,300,300]
    })
  )

  const longGap=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:10,north:0},
        {east:10,north:0},
        {east:10,north:0}
      ],
      intervals:[300,300,1800]
    })
  )

  assert.ok(
    Number.isFinite(regular.freshnessConfidence),
    'motion result must expose freshnessConfidence'
  )

  assert.ok(
    Number.isFinite(longGap.freshnessConfidence),
    'long-gap motion must expose freshnessConfidence'
  )

  assert.ok(
    longGap.freshnessConfidence <
      regular.freshnessConfidence,
    `long-gap freshness ${longGap.freshnessConfidence} should be lower than regular freshness ${regular.freshnessConfidence}`
  )
})


// PHASE 7.3e2 RECENT MOTION CONTRACT

test('recent motion matches historical motion for steady track',()=>{
  const result=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:10,north:0},
        {east:10,north:0},
        {east:10,north:0},
        {east:10,north:0},
        {east:10,north:0}
      ],
      intervals:[300,300,300,300,300]
    })
  )

  assert.ok(
    result.recent,
    'motion result must expose recent vector'
  )

  assert.ok(
    Math.abs(result.recent.speed-result.speed)<0.01
  )

  assert.ok(
    Math.abs(result.recent.east-result.east)<0.01
  )

  assert.equal(
    result.recent.samples,
    3
  )
})


test('recent motion responds to acceleration faster than historical vector',()=>{
  const result=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:4,north:0},
        {east:6,north:0},
        {east:10,north:0},
        {east:16,north:0}
      ],
      intervals:[300,300,300,300]
    })
  )

  assert.ok(result.recent)

  assert.ok(
    result.recent.speed > result.speed,
    `recent speed ${result.recent.speed} should exceed historical ${result.speed}`
  )

  assert.ok(
    result.recent.east > result.east,
    `recent east ${result.recent.east} should exceed historical ${result.east}`
  )
})


test('recent motion responds to deceleration faster than historical vector',()=>{
  const result=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:16,north:0},
        {east:10,north:0},
        {east:6,north:0},
        {east:4,north:0}
      ],
      intervals:[300,300,300,300]
    })
  )

  assert.ok(result.recent)

  assert.ok(
    result.recent.speed < result.speed,
    `recent speed ${result.recent.speed} should be below historical ${result.speed}`
  )

  assert.ok(
    result.recent.east < result.east,
    `recent east ${result.recent.east} should be below historical ${result.east}`
  )
})


test('recent motion follows a turning storm more closely than historical vector',()=>{
  const result=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:10,north:0},
        {east:8,north:4},
        {east:4,north:8},
        {east:0,north:10}
      ],
      intervals:[300,300,300,300]
    })
  )

  assert.ok(result.recent)

  /*
   * Latest physical direction is north (0°).
   * Historical estimator is around 45°.
   * Recent estimator should move materially toward north.
   */
  assert.ok(
    Math.abs(result.recent.course) <
      Math.abs(result.course),
    `recent course ${result.recent.course} should be closer to north than historical ${result.course}`
  )
})


test('recent motion remains robust to one large interval outlier',()=>{
  const result=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:10,north:0},
        {east:10,north:0},
        {east:45,north:30},
        {east:-25,north:-30},
        {east:10,north:0}
      ],
      intervals:[300,300,300,300,300]
    })
  )

  assert.ok(result.recent)

  /*
   * The final three intervals contain one high outlier,
   * one compensating low outlier, and one correct 10 m/s
   * interval. Component medians should recover the stable
   * physical motion rather than following either excursion.
   */
  assert.ok(
    Math.abs(result.recent.east-10)<0.1,
    `expected recent east near 10 m/s, got ${result.recent.east}`
  )

  assert.ok(
    Math.abs(result.recent.north)<0.1,
    `expected recent north near 0 m/s, got ${result.recent.north}`
  )
})


test('short tracks expose recent vector using available intervals',()=>{
  const result=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:10,north:0}
      ],
      intervals:[300]
    })
  )

  assert.ok(result.recent)

  assert.equal(
    result.recent.samples,
    1
  )

  assert.ok(
    Math.abs(result.recent.speed-10)<0.1
  )
})


// PHASE 7.3e2b MOTION TREND ROBUSTNESS CONTRACT

test('single compensated centroid outlier does not invent acceleration',()=>{
  const result=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:10,north:0},
        {east:10,north:0},
        {east:45,north:30},
        {east:-25,north:-30},
        {east:10,north:0}
      ],
      intervals:[300,300,300,300,300]
    })
  )

  assert.ok(
    Number.isFinite(result.accelerationMps2)
  )

  assert.ok(
    Math.abs(result.accelerationMps2) < 0.005,
    `compensated outlier should not imply material acceleration; got ${result.accelerationMps2}`
  )
})


test('single compensated centroid outlier does not invent sustained turn',()=>{
  const result=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:10,north:0},
        {east:10,north:0},
        {east:45,north:30},
        {east:-25,north:-30},
        {east:10,north:0}
      ],
      intervals:[300,300,300,300,300]
    })
  )

  assert.ok(
    Number.isFinite(result.turnRateDegPerMin)
  )

  assert.ok(
    Math.abs(result.turnRateDegPerMin) < 0.5,
    `compensated outlier should not imply sustained turning; got ${result.turnRateDegPerMin}`
  )
})


test('genuine acceleration remains detectable after robust trend estimation',()=>{
  const result=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:4,north:0},
        {east:6,north:0},
        {east:10,north:0},
        {east:16,north:0}
      ],
      intervals:[300,300,300,300]
    })
  )

  assert.ok(
    result.accelerationMps2 > 0.005,
    `real acceleration should remain detectable; got ${result.accelerationMps2}`
  )
})


test('genuine turning remains detectable after robust trend estimation',()=>{
  const result=robustTrackVelocity(
    buildMotionHistory({
      velocities:[
        {east:10,north:0},
        {east:8,north:4},
        {east:4,north:8},
        {east:0,north:10}
      ],
      intervals:[300,300,300,300]
    })
  )

  assert.ok(
    Math.abs(result.turnRateDegPerMin) > 1,
    `real turn should remain detectable; got ${result.turnRateDegPerMin}`
  )
})
