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
