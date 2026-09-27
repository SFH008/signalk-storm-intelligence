'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

let StormEvolution

try {
  ({StormEvolution}=require('../lib/storm-evolution'))
} catch {
  StormEvolution=null
}

function observation({
  observedAt,
  areaKm2,
  maxDbz,
  representation='measurement',
  thresholdDbz=24,
  method='reflectivity-threshold-development-v1'
}) {
  return {
    type:'Feature',
    geometry:{
      type:'Polygon',
      coordinates:[[
        [12.00,40.00],
        [12.05,40.00],
        [12.05,40.05],
        [12.00,40.05],
        [12.00,40.00]
      ]]
    },
    properties:{
      observedAt,
      detection:{
        method,
        qualification:{
          quantity:'reflectivity',
          operator:'>=',
          thresholdDbz
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

function requireImplementation(){
  assert.ok(
    StormEvolution,
    'storm-evolution module must export StormEvolution'
  )
}

test('evolution is unavailable with only one observation',()=>{
  requireImplementation()

  const e=new StormEvolution()

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:30
    })
  )

  assert.equal(result,null)
})

test('area growth is detected from comparable observations',()=>{
  requireImplementation()

  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:30
    })
  )

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:15,
      maxDbz:30
    })
  )

  assert.ok(result)
  assert.ok(result.areaTrend)

  assert.ok(
    result.areaTrend.rateKm2PerMin > 0
  )

  assert.equal(
    result.areaTrend.direction,
    'growing'
  )
})

test('area decay is detected from comparable observations',()=>{
  requireImplementation()

  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:20,
      maxDbz:30
    })
  )

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:10,
      maxDbz:30
    })
  )

  assert.ok(
    result.areaTrend.rateKm2PerMin < 0
  )

  assert.equal(
    result.areaTrend.direction,
    'shrinking'
  )
})

test('compatible reflectivity observations produce intensity trend',()=>{
  requireImplementation()

  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:28,
      representation:'measurement'
    })
  )

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:10,
      maxDbz:34,
      representation:'measurement'
    })
  )

  assert.ok(result.intensityTrend)

  assert.ok(
    result.intensityTrend.rateDbzPerMin > 0
  )

  assert.equal(
    result.intensityTrend.direction,
    'intensifying'
  )
})

test('incompatible reflectivity representations remain incomparable',()=>{
  requireImplementation()

  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:28,
      representation:'lower-bound'
    })
  )

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:10,
      maxDbz:34,
      representation:'estimate'
    })
  )

  assert.equal(
    result.intensityTrend,
    null,
    'incompatible evidence semantics must remain missing'
  )
})

test('different storm identities keep independent evolution history',()=>{
  requireImplementation()

  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:28
    })
  )

  e.update(
    'storm-2',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:30,
      maxDbz:40
    })
  )

  const one=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:15,
      maxDbz:30
    })
  )

  const two=e.update(
    'storm-2',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:20,
      maxDbz:35
    })
  )

  assert.equal(
    one.areaTrend.direction,
    'growing'
  )

  assert.equal(
    two.areaTrend.direction,
    'shrinking'
  )
})

test('same-timestamp replacement does not create artificial evolution',()=>{
  requireImplementation()

  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:30
    })
  )

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:12,
      maxDbz:32
    })
  )

  assert.equal(
    result,
    null,
    'same-time replacement must not fabricate a zero-duration trend'
  )
})

test('geometry trend remains unavailable until justified algorithm exists',()=>{
  requireImplementation()

  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:30
    })
  )

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:15,
      maxDbz:32
    })
  )

  assert.equal(
    result.geometryTrend,
    null
  )
})

test('evolution method is stable and provider-neutral',()=>{
  requireImplementation()

  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:30
    })
  )

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:15,
      maxDbz:32
    })
  )

  assert.equal(
    result.method,
    'deterministic-evolution-v1'
  )

  assert.ok(
    Number.isFinite(result.confidence)
  )

  assert.ok(
    result.confidence>=0 &&
    result.confidence<=1
  )
})


// PHASE 7.3f3 EVOLUTION STRESS VALIDATION

test('changed detection threshold prevents area and intensity comparison',()=>{
  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:30,
      thresholdDbz:24
    })
  )

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:20,
      maxDbz:36,
      thresholdDbz:30
    })
  )

  assert.ok(result)
  assert.equal(result.areaTrend,null)
  assert.equal(result.intensityTrend,null)
  assert.equal(result.state,'unknown')
})


test('changed detection method prevents scientific comparison',()=>{
  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:30,
      method:'method-a'
    })
  )

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:20,
      maxDbz:36,
      method:'method-b'
    })
  )

  assert.equal(result.areaTrend,null)
  assert.equal(result.intensityTrend,null)
  assert.equal(result.state,'unknown')
})


test('missing reflectivity preserves area evolution but leaves intensity missing',()=>{
  const e=new StormEvolution()

  const first=observation({
    observedAt:'2026-09-27T10:00:00Z',
    areaKm2:10,
    maxDbz:30
  })

  const second=observation({
    observedAt:'2026-09-27T10:05:00Z',
    areaKm2:15,
    maxDbz:32
  })

  second.properties.evidence.reflectivity.available=false
  second.properties.evidence.reflectivity.maxDbz=null

  e.update('storm-1',first)

  const result=e.update(
    'storm-1',
    second
  )

  assert.ok(result.areaTrend)
  assert.equal(
    result.areaTrend.direction,
    'growing'
  )

  assert.equal(
    result.intensityTrend,
    null
  )
})


test('irregular intervals produce rates normalized by elapsed time',()=>{
  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:30
    })
  )

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:20:00Z',
      areaKm2:30,
      maxDbz:40
    })
  )

  assert.equal(
    result.areaTrend.rateKm2PerMin,
    1
  )

  assert.equal(
    result.intensityTrend.rateDbzPerMin,
    0.5
  )

  assert.equal(
    result.areaTrend.durationMin,
    20
  )
})


test('same-time replacement after longer history does not fabricate trend',()=>{
  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:30
    })
  )

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:15,
      maxDbz:35
    })
  )

  const replaced=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:20,
      maxDbz:40
    })
  )

  assert.ok(replaced)

  assert.equal(
    replaced.areaTrend.fromKm2,
    10
  )

  assert.equal(
    replaced.areaTrend.toKm2,
    20
  )

  assert.equal(
    replaced.areaTrend.durationMin,
    5
  )

  const history=e.snapshot('storm-1')

  assert.equal(history.length,2)
})


test('history retention obeys configured historyFrames',()=>{
  const e=new StormEvolution({
    historyFrames:3
  })

  for(let i=0;i<6;i++){
    e.update(
      'storm-1',
      observation({
        observedAt:
          new Date(
            Date.parse(
              '2026-09-27T10:00:00Z'
            )+
            i*300000
          ).toISOString(),
        areaKm2:10+i,
        maxDbz:30+i
      })
    )
  }

  const history=e.snapshot('storm-1')

  assert.equal(history.length,3)

  assert.equal(
    history[0].observedAt,
    '2026-09-27T10:15:00.000Z'
  )
})


test('clearing one storm does not affect another storm history',()=>{
  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:30
    })
  )

  e.update(
    'storm-2',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:20,
      maxDbz:40
    })
  )

  e.clear('storm-1')

  assert.equal(
    e.snapshot('storm-1').length,
    0
  )

  assert.equal(
    e.snapshot('storm-2').length,
    1
  )
})


test('steady intensity and steady area produce steady state',()=>{
  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:10,
      maxDbz:30
    })
  )

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:10,
      maxDbz:30
    })
  )

  assert.equal(
    result.areaTrend.direction,
    'steady'
  )

  assert.equal(
    result.intensityTrend.direction,
    'steady'
  )

  assert.equal(
    result.state,
    'steady'
  )
})


test('opposing area and intensity tendencies produce mixed state',()=>{
  const e=new StormEvolution()

  e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:00:00Z',
      areaKm2:20,
      maxDbz:30
    })
  )

  const result=e.update(
    'storm-1',
    observation({
      observedAt:'2026-09-27T10:05:00Z',
      areaKm2:10,
      maxDbz:36
    })
  )

  assert.equal(
    result.areaTrend.direction,
    'shrinking'
  )

  assert.equal(
    result.intensityTrend.direction,
    'intensifying'
  )

  assert.equal(
    result.state,
    'mixed'
  )
})
