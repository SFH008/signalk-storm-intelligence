'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  StormEngineV3
}=require('../lib/storm-engine-v3')

const {
  InferenceEngineV2
}=require('../lib/inference-engine-v2')

const {
  createDeterministicObservationInference
}=require('../lib/inference-deterministic-v2')


function region(
  id,
  observedAt
){
  return {
    type:'Feature',
    id,

    geometry:{
      type:'Polygon',
      coordinates:[[
        [-8.50,37.00],
        [-8.40,37.00],
        [-8.40,37.10],
        [-8.50,37.10],
        [-8.50,37.00]
      ]]
    },

    properties:{
      sourceId:id,
      observationId:id,
      observedAt,

      classification:
        'operational-hazard-region',

      detection:{
        method:
          'reflectivity-threshold-development-v1',

        qualification:{
          quantity:'reflectivity',
          operator:'>=',
          thresholdDbz:24
        },

        areaKm2:50,
        maxReflectivityDbz:42
      },

      evidence:{
        reflectivity:{
          available:true,
          units:'dBZ',
          maxDbz:42,
          representation:'measurement'
        }
      }
    }
  }
}


test(
  'first accepted hazard region becomes a persistent tracked birth',
  async()=>{
    const observedAt=
      '2026-09-30T10:00:00.000Z'

    const observationId=
      `${observedAt}:hazard-region-1`

    const inferenceEngine=
      new InferenceEngineV2({
        algorithms:[
          createDeterministicObservationInference()
        ]
      })

    const engine=
      new StormEngineV3({
        inferenceEngine
      })

    const result=
      await engine.processFrame({
        observedAt,

        regions:[
          region(
            observationId,
            observedAt
          )
        ],

        now:
          Date.parse(observedAt)
      })


    assert.equal(
      result.observations.length,
      1
    )

    const observation=
      result.observations[0]

    assert.equal(
      observation.id,
      observationId
    )

    assert.equal(
      observation
        .properties
        .inference
        .schema,
      'storm-inference/2'
    )

    assert.equal(
      observation
        .properties
        .inference
        .accepted,
      true
    )


    assert.deepEqual(
      result.lineage,
      {
        relationships:[],
        births:[
          observationId
        ],
        disappearances:[]
      }
    )


    assert.equal(
      result.identity
        .activeByObservation
        .get(observationId),
      'track-1'
    )


    assert.equal(
      result.hazards.length,
      1
    )

    assert.equal(
      result.hazards[0].id,
      observationId
    )

    assert.equal(
      result.hazards[0].trackId,
      'track-1'
    )

    assert.deepEqual(
      result.hazards[0].geometry,
      observation.geometry
    )
  }
)


test(
  'observation with unusable evidence is not promoted to tracked hazard',
  async()=>{
    const observedAt=
      '2026-09-30T10:00:00.000Z'

    const observationId=
      `${observedAt}:hazard-region-1`

    const source=
      region(
        observationId,
        observedAt
      )

    source.properties.evidence={}

    const inferenceEngine=
      new InferenceEngineV2({
        algorithms:[
          createDeterministicObservationInference()
        ]
      })

    const engine=
      new StormEngineV3({
        inferenceEngine
      })

    const result=
      await engine.processFrame({
        observedAt,
        regions:[source],
        now:Date.parse(observedAt)
      })


    assert.equal(
      result.observations.length,
      1
    )

    assert.equal(
      result.observations[0]
        .properties
        .inference
        .accepted,
      null
    )

    assert.equal(
      result.hazards.length,
      0
    )

    assert.deepEqual(
      result.lineage,
      {
        relationships:[],
        births:[],
        disappearances:[]
      }
    )

    assert.equal(
      result.identity
        .activeByObservation
        .size,
      0
    )
  }
)

function uniformMotionField({
  width=100,
  height=100,
  dx=10,
  dy=0
}={}){
  const length=width*height

  return {
    width,
    height,

    eastPixels:
      Float64Array.from(
        {length},
        ()=>dx
      ),

    northPixels:
      Float64Array.from(
        {length},
        ()=>dy
      ),

    support:
      Uint8Array.from(
        {length},
        ()=>1
      ),

    uncertaintyPixels:
      Float64Array.from(
        {length},
        ()=>0
      )
  }
}


function movingRegion(
  id,
  observedAt,
  west,
  east
){
  return {
    type:'Feature',
    id,

    geometry:{
      type:'Polygon',
      coordinates:[[
        [west,0.40],
        [east,0.40],
        [east,0.50],
        [west,0.50],
        [west,0.40]
      ]]
    },

    properties:{
      sourceId:id,
      observationId:id,
      observedAt,

      classification:
        'operational-hazard-region',

      detection:{
        method:
          'reflectivity-threshold-development-v1',

        qualification:{
          quantity:'reflectivity',
          operator:'>=',
          thresholdDbz:24
        },

        areaKm2:50,
        maxReflectivityDbz:42
      },

      evidence:{
        reflectivity:{
          available:true,
          units:'dBZ',
          maxDbz:42,
          representation:'measurement'
        }
      }
    }
  }
}


test(
  'advected previous hazard continues with the same persistent track',
  async()=>{
    const firstTime=
      '2026-09-30T10:00:00.000Z'

    const secondTime=
      '2026-09-30T10:05:00.000Z'

    const firstId=
      `${firstTime}:hazard-region-1`

    const secondId=
      `${secondTime}:hazard-region-1`


    const inferenceEngine=
      new InferenceEngineV2({
        algorithms:[
          createDeterministicObservationInference()
        ]
      })


    const engine=
      new StormEngineV3({
        inferenceEngine
      })


    const first=
      await engine.processFrame({
        observedAt:firstTime,

        regions:[
          movingRegion(
            firstId,
            firstTime,
            0.20,
            0.30
          )
        ],

        now:
          Date.parse(firstTime)
      })


    assert.equal(
      first.hazards.length,
      1
    )

    assert.equal(
      first.hazards[0].trackId,
      'track-1'
    )


    const field={
      width:100,
      height:100,
      bounds:[
        0,
        0,
        1,
        1
      ]
    }


    /*
     * 10 pixels east on this field = 0.1 degrees.
     *
     * Previous:
     *   0.20 .. 0.30
     *
     * Predicted:
     *   0.30 .. 0.40
     *
     * Current:
     *   0.30 .. 0.40
     */
    const motion=
      uniformMotionField({
        width:100,
        height:100,
        dx:10,
        dy:0
      })


    const second=
      await engine.processFrame({
        observedAt:secondTime,

        regions:[
          movingRegion(
            secondId,
            secondTime,
            0.30,
            0.40
          )
        ],

        field,
        motion,

        now:
          Date.parse(secondTime)
      })


    assert.equal(
      second.hazards.length,
      1
    )


    assert.deepEqual(
      second.lineage,
      {
        relationships:[
          {
            type:'continuation',
            previous:[firstId],
            current:[secondId]
          }
        ],

        births:[],
        disappearances:[]
      }
    )


    assert.equal(
      second.identity
        .activeByObservation
        .get(secondId),
      'track-1'
    )


    assert.equal(
      second.hazards[0].trackId,
      'track-1'
    )


    const track=
      second.identity
        .tracks
        .get('track-1')

    assert.deepEqual(
      track.observations,
      [
        firstId,
        secondId
      ]
    )

    assert.equal(
      track.firstSeen,
      firstTime
    )

    assert.equal(
      track.lastSeen,
      secondTime
    )
  }
)

test(
  'continued hazard exposes authoritative multi-horizon geometry forecast',
  async()=>{
    const firstTime=
      '2026-09-30T10:00:00.000Z'

    const secondTime=
      '2026-09-30T10:05:00.000Z'

    const firstId=
      `${firstTime}:hazard-region-1`

    const secondId=
      `${secondTime}:hazard-region-1`


    const inferenceEngine=
      new InferenceEngineV2({
        algorithms:[
          createDeterministicObservationInference()
        ]
      })


    const engine=
      new StormEngineV3({
        inferenceEngine
      })


    const first=
      await engine.processFrame({
        observedAt:firstTime,

        regions:[
          movingRegion(
            firstId,
            firstTime,
            0.20,
            0.30
          )
        ],

        now:
          Date.parse(firstTime)
      })


    assert.equal(
      first.hazards.length,
      1
    )

    assert.equal(
      first.hazards[0]
        .severity
        .components
        .evolution
        .available,
      false
    )

    assert.equal(
      first.hazards[0]
        .severity
        .components
        .evolution
        .score,
      null
    )


    const field={
      width:100,
      height:100,

      bounds:[
        0,
        0,
        1,
        1
      ]
    }


    const motion=
      uniformMotionField({
        width:100,
        height:100,
        dx:10,
        dy:0
      })


    const second=
      await engine.processFrame({
        observedAt:secondTime,

        regions:[
          movingRegion(
            secondId,
            secondTime,
            0.30,
            0.40
          )
        ],

        field,
        motion,

        now:
          Date.parse(secondTime)
      })


    assert.equal(
      second.hazards.length,
      1
    )


    const hazard=
      second.hazards[0]


    assert.equal(
      hazard.trackId,
      'track-1'
    )


    assert.ok(
      hazard.evolution
    )

    assert.equal(
      hazard.evolution.method,
      'deterministic-evolution-v1'
    )

    assert.equal(
      hazard
        .severity
        .components
        .evolution
        .available,
      true
    )

    assert.ok(
      Number.isFinite(
        hazard
          .severity
          .components
          .evolution
          .score
      )
    )

    assert.ok(
      hazard
        .severity
        .components
        .evolution
        .score>=0 &&
      hazard
        .severity
        .components
        .evolution
        .score<=1
    )


    assert.ok(
      Array.isArray(
        hazard.forecast
      )
    )

    assert.deepEqual(
      hazard.forecast.map(
        row=>row.horizonMinutes
      ),
      [
        5,
        10,
        20,
        30
      ]
    )


    for(const row of hazard.forecast){
      assert.equal(
        row.supported,
        true
      )

      assert.ok(
        row.geometry
      )

      assert.ok(
        row.support
      )
    }


    function westEdge(row){
      return row
        .geometry
        .coordinates[0][0][0]
    }


    assert.ok(
      Math.abs(
        westEdge(hazard.forecast[0])-
        0.40
      )<1e-9
    )

    assert.ok(
      Math.abs(
        westEdge(hazard.forecast[1])-
        0.50
      )<1e-9
    )

    assert.ok(
      Math.abs(
        westEdge(hazard.forecast[2])-
        0.70
      )<1e-9
    )

    assert.ok(
      Math.abs(
        westEdge(hazard.forecast[3])-
        0.90
      )<1e-9
    )


    assert.equal(
      hazard.forecast[0].factor,
      1
    )

    assert.equal(
      hazard.forecast[1].factor,
      2
    )

    assert.equal(
      hazard.forecast[2].factor,
      4
    )

    assert.equal(
      hazard.forecast[3].factor,
      6
    )
  }
)

test('StormEngineV3 attaches storm-severity-v1 contract to every hazard',async()=>{
  const engine=new StormEngineV3({
    inferenceEngine:{
      async inferObservation(){
        return {
          schema:'storm-inference/2',
          stage:'observation',
          accepted:true,
          classification:{
            convectiveCell:{value:null,confidence:null},
            thunderstorm:{value:null,confidence:null},
            squallPotential:{value:null,confidence:null}
          },
          quality:{
            score:0.8,
            confidence:0.9,
            reasons:[]
          },
          contributions:[],
          provenance:{
            engine:'test'
          }
        }
      }
    }
  })

  const region={
    id:'region-1',
    type:'Feature',
    geometry:{
      type:'Polygon',
      coordinates:[[
        [0,0],
        [0.1,0],
        [0.1,0.1],
        [0,0.1],
        [0,0]
      ]]
    },
    properties:{
      observedAt:'2026-10-01T18:50:00.000Z',
      detection:{
        method:'reflectivity-threshold-development-v1',
        qualification:{
          quantity:'reflectivity',
          operator:'>=',
          thresholdDbz:24
        },
        areaKm2:100,
        maxReflectivityDbz:48
      },
      evidence:{
        reflectivity:{
          available:true,
          units:'dBZ',
          maxDbz:48,
          representation:'lower-bound'
        }
      },
      memberCount:4,
      provider:'aemet',
      product:'COMPO'
    }
  }

  const result=
    await engine.processFrame({
      observedAt:'2026-10-01T18:50:00.000Z',
      regions:[region]
    })

  assert.equal(result.hazards.length,1)

  const severity=
    result.hazards[0].severity

  assert.ok(severity)

  assert.equal(
    severity.method,
    'storm-severity-v1'
  )

  assert.ok(
    severity.score>=0 &&
    severity.score<=1
  )

  assert.ok(
    severity.level>=1 &&
    severity.level<=5
  )

  assert.ok(
    severity.confidence>=0 &&
    severity.confidence<=1
  )

  assert.equal(
    severity.components.radarIntensity.available,
    true
  )

  assert.equal(
    severity.components.stormSize.available,
    true
  )

  assert.equal(
    severity.components.morphology.available,
    true
  )

  assert.equal(
    severity.components.evolution.available,
    false
  )

  assert.equal(
    severity.components.lightning.available,
    false
  )

  assert.equal(
    severity.components.wind.available,
    false
  )

  assert.equal(
    severity.components.wind.score,
    null
  )
})

test(
  'StormEngineV3 associates available lightning evidence with severity',
  async()=>{
    const observedAt=
      '2026-09-30T10:00:00.000Z'

    const id=
      `${observedAt}:hazard-region-lightning`

    const inferenceEngine=
      new InferenceEngineV2({
        algorithms:[
          createDeterministicObservationInference()
        ]
      })

    const engine=
      new StormEngineV3({
        inferenceEngine
      })

    const result=
      await engine.processFrame({
        observedAt,

        regions:[
          movingRegion(
            id,
            observedAt,
            0.20,
            0.30
          )
        ],

        lightning:{
          available:true,

          strikes:[
            {
              id:'strike-1',
              time:
                '2026-09-30T09:59:00.000Z',

              position:{
                longitude:0.25,
                latitude:0.45
              }
            }
          ],

          lookbackMinutes:30,
          associationRadiusM:15000
        },

        now:
          Date.parse(observedAt)
      })

    assert.equal(
      result.hazards.length,
      1
    )

    const hazard=
      result.hazards[0]

    assert.equal(
      hazard.lightning.available,
      true
    )

    assert.equal(
      hazard.lightning.countAssociated,
      1
    )

    assert.equal(
      hazard.severity
        .components
        .lightning
        .available,
      true
    )

    assert.ok(
      hazard.severity
        .components
        .lightning
        .score>0
    )
  }
)

