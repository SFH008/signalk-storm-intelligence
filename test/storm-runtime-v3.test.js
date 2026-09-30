'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  StormRuntimeV3
}=require('../lib/storm-runtime-v3')


function region(
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
        [west,0.60],
        [east,0.60],
        [east,0.70],
        [west,0.70],
        [west,0.60]
      ]]
    },

    properties:{
      sourceId:id,
      observationId:id,
      observedAt,

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


function frame(
  dx=0
){
  const width=96
  const height=96

  const values=
    new Float32Array(
      width*height
    )

  values.fill(0)

  /*
   * Asymmetric radar-like echo.
   */
  for(let y=25;y<32;y++){
    for(let x=25+dx;x<50+dx;x++){
      values[y*width+x]=30
    }
  }

  for(let y=32;y<48;y++){
    for(let x=30+dx;x<44+dx;x++){
      values[y*width+x]=42
    }
  }

  for(let y=37;y<46;y++){
    for(let x=50+dx;x<60+dx;x++){
      values[y*width+x]=48
    }
  }

  return {
    width,
    height,
    values
  }
}


test(
  'runtime derives motion from consecutive frames and preserves track',
  async()=>{
    const runtime=
      new StormRuntimeV3()

    const firstTime=
      '2026-09-30T10:00:00.000Z'

    const secondTime=
      '2026-09-30T10:05:00.000Z'

    const field={
      width:96,
      height:96,
      bounds:[0,0,0.96,0.96]
    }

    const firstId=
      `${firstTime}:hazard-region-1`

    const secondId=
      `${secondTime}:hazard-region-1`


    const first=
      await runtime.processFrame({
        observedAt:firstTime,
        regions:[
          region(
            firstId,
            firstTime,
            0.25,
            0.35
          )
        ],
        motionFrame:frame(0),
        field,
        now:Date.parse(firstTime)
      })

    assert.equal(
      first.hazards.length,
      1
    )

    assert.equal(
      first.hazards[0].trackId,
      'track-1'
    )

    assert.equal(
      first.motion,
      null
    )


    const second=
      await runtime.processFrame({
        observedAt:secondTime,
        regions:[
          region(
            secondId,
            secondTime,
            0.30,
            0.40
          )
        ],
        motionFrame:frame(5),
        field,
        now:Date.parse(secondTime)
      })

    assert.ok(
      second.motion
    )

    assert.equal(
      second.hazards.length,
      1
    )

    const {
      advectGeographicGeometry,
      geographicToPixelGeometry
    }=require('../lib/storm-tracker-v3/geometry-advection')

    const {
      sampleMotionField
    }=require('../lib/storm-tracker-v3/motion-interpolation')

    const firstGeometry=
      first.hazards[0].geometry

    const pixelGeometry=
      geographicToPixelGeometry(
        firstGeometry,
        field
      )

    console.log(
      'PIXEL_GEOMETRY',
      JSON.stringify(
        pixelGeometry,
        null,
        2
      )
    )

    for(
      const point
      of pixelGeometry.coordinates[0]
    ){
      console.log(
        'VERTEX_MOTION',
        point,
        sampleMotionField(
          second.motion,
          point[0],
          point[1]
        )
      )
    }

    console.log(
      'DIRECT_ADVECTION',
      JSON.stringify(
        advectGeographicGeometry(
          firstGeometry,
          field,
          second.motion
        ),
        null,
        2
      )
    )

    console.log(
      'MOTION_DIAG',
      {
        supported:
          second.motion
            ? Array.from(second.motion.support || [])
                .filter(v=>v>0).length
            : 0,

        east:
          second.motion
            ? Array.from(second.motion.eastPixels || [])
                .filter(Number.isFinite)
                .slice(0,20)
            : [],

        north:
          second.motion
            ? Array.from(second.motion.northPixels || [])
                .filter(Number.isFinite)
                .slice(0,20)
            : []
      }
    )

    console.log(
      'PREDICTED_PREVIOUS',
      JSON.stringify(
        second.predictedPrevious,
        null,
        2
      )
    )

    console.log(
      'LINEAGE_DIAG',
      JSON.stringify(
        second.lineage,
        null,
        2
      )
    )

    assert.equal(
      second.hazards[0].trackId,
      'track-1'
    )

    assert.deepEqual(
      second.hazards[0]
        .forecast
        .map(row=>row.horizonMinutes),
      [5,10,20,30]
    )
  }
)
