'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  StormEngine
}=require('../lib/storm-engine')

function square(
  id,
  time,
  lon,
  areaKm2,
  maxDbz,
  representation='measurement'
){
  return {
    type:'Feature',
    id,
    geometry:{
      type:'Polygon',
      coordinates:[[
        [lon,40.00],
        [lon+0.05,40.00],
        [lon+0.05,40.05],
        [lon,40.05],
        [lon,40.00]
      ]]
    },
    properties:{
      observedAt:time,

      detection:{
        method:
          'reflectivity-threshold-development-v1',

        qualification:{
          quantity:'reflectivity',
          operator:'>=',
          thresholdDbz:24
        },

        areaKm2,
        maxReflectivityDbz:maxDbz
      },

      evidence:{
        reflectivity:{
          available:true,
          units:'dBZ',
          maxDbz,
          representation
        }
      }
    }
  }
}

function snapshot(
  epochMs,
  features
){
  return {
    epochMs,
    features
  }
}

test('StormEngine exposes null evolution for first tracked observation',()=>{
  const engine=new StormEngine()

  const result=engine.evaluate(
    snapshot(
      Date.parse('2026-09-27T10:00:00Z'),
      [
        square(
          'a',
          '2026-09-27T10:00:00Z',
          12,
          10,
          30
        )
      ]
    ),
    null
  )

  assert.equal(result.length,1)

  assert.ok(
    Object.hasOwn(
      result[0],
      'evolution'
    ),
    'StormEngine output must expose evolution field'
  )

  assert.equal(
    result[0].evolution,
    null
  )
})


test('StormEngine attaches evolution to persistent track on second observation',()=>{
  const engine=new StormEngine()

  const first=engine.evaluate(
    snapshot(
      Date.parse('2026-09-27T10:00:00Z'),
      [
        square(
          'a0',
          '2026-09-27T10:00:00Z',
          12.00,
          10,
          30
        )
      ]
    ),
    null
  )

  const trackId=first[0].trackId

  const second=engine.evaluate(
    snapshot(
      Date.parse('2026-09-27T10:05:00Z'),
      [
        square(
          'a1',
          '2026-09-27T10:05:00Z',
          12.01,
          15,
          34
        )
      ]
    ),
    null
  )

  assert.equal(
    second[0].trackId,
    trackId
  )

  assert.ok(
    second[0].evolution
  )

  assert.equal(
    second[0].evolution.areaTrend.direction,
    'growing'
  )

  assert.equal(
    second[0].evolution.intensityTrend.direction,
    'intensifying'
  )

  assert.equal(
    second[0].evolution.method,
    'deterministic-evolution-v1'
  )
})


test('StormEngine keeps evolution histories separate by persistent track identity',()=>{
  const engine=new StormEngine({
    matchDistanceM:20000
  })

  const first=engine.evaluate(
    snapshot(
      Date.parse('2026-09-27T10:00:00Z'),
      [
        square(
          'left-0',
          '2026-09-27T10:00:00Z',
          12.00,
          10,
          30
        ),

        square(
          'right-0',
          '2026-09-27T10:00:00Z',
          13.00,
          30,
          40
        )
      ]
    ),
    null
  )

  assert.equal(first.length,2)

  const second=engine.evaluate(
    snapshot(
      Date.parse('2026-09-27T10:05:00Z'),
      [
        square(
          'left-1',
          '2026-09-27T10:05:00Z',
          12.01,
          15,
          32
        ),

        square(
          'right-1',
          '2026-09-27T10:05:00Z',
          13.01,
          20,
          36
        )
      ]
    ),
    null
  )

  const left=second.find(
    x=>x.sourceId==='left-1'
  )

  const right=second.find(
    x=>x.sourceId==='right-1'
  )

  assert.equal(
    left.evolution.areaTrend.direction,
    'growing'
  )

  assert.equal(
    right.evolution.areaTrend.direction,
    'shrinking'
  )
})


test('StormEngine leaves evolution null when observation timestamp is unavailable',()=>{
  const engine=new StormEngine()

  const feature={
    type:'Feature',
    id:'legacy',
    geometry:{
      type:'Polygon',
      coordinates:[[
        [12,40],
        [12.05,40],
        [12.05,40.05],
        [12,40.05],
        [12,40]
      ]]
    },
    properties:{}
  }

  const result=engine.evaluate(
    snapshot(
      Date.parse(
        '2026-09-27T10:00:00Z'
      ),
      [feature]
    ),
    null
  )

  assert.equal(result.length,1)
  assert.equal(result[0].evolution,null)
})


test('expired track evolution history is cleared',()=>{
  const engine=new StormEngine({
    maxMissedFrames:0
  })

  const first=engine.evaluate(
    snapshot(
      Date.parse(
        '2026-09-27T10:00:00Z'
      ),
      [
        square(
          'a',
          '2026-09-27T10:00:00Z',
          12,
          10,
          30
        )
      ]
    ),
    null
  )

  const trackId=first[0].trackId

  assert.equal(
    engine.evolution.snapshot(
      trackId
    ).length,
    1
  )

  engine.evaluate(
    snapshot(
      Date.parse(
        '2026-09-27T10:05:00Z'
      ),
      []
    ),
    null
  )

  assert.equal(
    engine.evolution.snapshot(
      trackId
    ).length,
    0
  )
})


test('merged loser evolution history is cleared while survivor remains',()=>{
  const engine=new StormEngine({
    matchDistanceM:100000
  })

  const first=engine.evaluate(
    snapshot(
      Date.parse(
        '2026-09-27T10:00:00Z'
      ),
      [
        square(
          'left',
          '2026-09-27T10:00:00Z',
          12.00,
          10,
          30
        ),

        square(
          'right',
          '2026-09-27T10:00:00Z',
          12.04,
          10,
          30
        )
      ]
    ),
    null
  )

  const ids=
    first.map(x=>x.trackId)

  const merged={
    ...square(
      'merged',
      '2026-09-27T10:05:00Z',
      12.00,
      20,
      34
    ),

    geometry:{
      type:'Polygon',
      coordinates:[[
        [12.00,40.00],
        [12.09,40.00],
        [12.09,40.05],
        [12.00,40.05],
        [12.00,40.00]
      ]]
    }
  }

  const second=engine.evaluate(
    snapshot(
      Date.parse(
        '2026-09-27T10:05:00Z'
      ),
      [merged]
    ),
    null
  )

  assert.equal(second.length,1)

  const survivor=
    second[0].trackId

  const loser=
    ids.find(id=>id!==survivor)

  assert.ok(loser)

  assert.ok(
    engine.evolution.snapshot(
      survivor
    ).length>=1
  )

  assert.equal(
    engine.evolution.snapshot(
      loser
    ).length,
    0
  )
})
