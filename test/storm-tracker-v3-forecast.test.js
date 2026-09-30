'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  projectHazardGeometry,
  DEFAULT_HORIZONS_MINUTES
}=require('../lib/storm-tracker-v3/forecast')


function constantMotion({
  width=20,
  height=20,
  east=1,
  north=0,
  uncertainty=0.5,
  supported=true
}={}){
  const count=width*height

  return {
    width,
    height,

    eastPixels:
      Float64Array.from(
        {length:count},
        ()=>east
      ),

    northPixels:
      Float64Array.from(
        {length:count},
        ()=>north
      ),

    uncertaintyPixels:
      Float64Array.from(
        {length:count},
        ()=>uncertainty
      ),

    support:
      Uint8Array.from(
        {length:count},
        ()=>supported ? 1 : 0
      )
  }
}


function square(){
  return {
    type:'Polygon',

    coordinates:[[
      [5,15],
      [6,15],
      [6,14],
      [5,14],
      [5,15]
    ]]
  }
}


const field={
  width:20,
  height:20,
  bounds:[0,0,20,20]
}


test(
  'default forecast horizons are operational 5 10 20 30 minutes',
  ()=>{
    assert.deepEqual(
      DEFAULT_HORIZONS_MINUTES,
      [5,10,20,30]
    )
  }
)


test(
  'projects geometry to all operational horizons',
  ()=>{
    const result=
      projectHazardGeometry({
        geometry:square(),
        field,
        motion:constantMotion(),
        baseIntervalMinutes:5
      })

    assert.deepEqual(
      result.map(x=>x.horizonMinutes),
      [5,10,20,30]
    )

    /*
     * Motion is one eastward pixel per 5 minutes.
     * With this synthetic field one pixel = one degree,
     * so the first polygon vertex moves:
     *
     * +5  -> lon 6
     * +10 -> lon 7
     * +20 -> lon 9
     * +30 -> lon 11
     */
    assert.deepEqual(
      result.map(
        x=>
          x.geometry
            .coordinates[0][0]
      ),
      [
        [6,15],
        [7,15],
        [9,15],
        [11,15]
      ]
    )
  }
)


test(
  'forecast uncertainty increases with forecast horizon',
  ()=>{
    const result=
      projectHazardGeometry({
        geometry:square(),
        field,
        motion:
          constantMotion({
            uncertainty:0.5
          }),
        baseIntervalMinutes:5
      })

    assert.deepEqual(
      result.map(
        x=>x.uncertaintyPixels
      ),
      [
        0.5,
        1,
        2,
        3
      ]
    )
  }
)


test(
  'forecast preserves advection support diagnostics',
  ()=>{
    const result=
      projectHazardGeometry({
        geometry:square(),
        field,
        motion:constantMotion(),
        baseIntervalMinutes:5
      })

    for(const prediction of result){
      assert.equal(
        prediction.supported,
        true
      )

      assert.ok(
        prediction.support
      )

      assert.equal(
        prediction.support.fraction,
        1
      )
    }
  }
)


test(
  'unsupported geometry remains explicitly unsupported',
  ()=>{
    const result=
      projectHazardGeometry({
        geometry:square(),
        field,
        motion:
          constantMotion({
            supported:false
          }),
        baseIntervalMinutes:5
      })

    assert.equal(
      result.length,
      4
    )

    for(const prediction of result){
      assert.equal(
        prediction.supported,
        false
      )

      assert.equal(
        prediction.geometry,
        null
      )
    }
  }
)


test(
  'requires a real positive base motion interval',
  ()=>{
    assert.throws(
      ()=>
        projectHazardGeometry({
          geometry:square(),
          field,
          motion:constantMotion(),
          baseIntervalMinutes:0
        }),

      /baseIntervalMinutes/
    )
  }
)
