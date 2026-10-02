'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  assessStormThreat
}=require('../lib/storm-threat')


function square(
  west,
  south,
  east,
  north
){
  return {
    type:'Polygon',
    coordinates:[[
      [west,south],
      [east,south],
      [east,north],
      [west,north],
      [west,south]
    ]]
  }
}


test(
  'calculates closing CPA and TCPA relative to ownship',
  ()=>{
    const hazard={
      geometry:
        square(
          0.195,-0.005,
          0.205, 0.005
        ),

      severity:{
        level:3
      },

      forecast:[
        {
          horizonMinutes:5,
          supported:true,
          geometry:
            square(
              0.145,-0.005,
              0.155, 0.005
            ),
          support:{
            fraction:1
          }
        }
      ]
    }

    const result=
      assessStormThreat({
        hazard,

        vessel:{
          position:{
            longitude:0,
            latitude:0
          },
          sog:0,
          cog:0
        },

        config:{
          warnDistanceM:30_000,
          alarmDistanceM:5_000,
          horizonMinutes:60,
          warnSeverity:3,
          alarmSeverity:4,
          pathStepSec:30
        }
      })

    assert.ok(
      result.distanceMeters>20_000
    )

    assert.equal(
      result.cpa.closing,
      true
    )

    assert.ok(
      result.cpa.tcpaSec>0
    )

    assert.ok(
      result.cpa.tcpaSec<1800
    )

    assert.ok(
      result.cpa.dcpaMeters<
      result.distanceMeters
    )
  }
)


test(
  'uses Signal K COG radians for vessel-relative CPA',
  ()=>{
    const geometry=
      square(
        0.095,-0.005,
        0.105, 0.005
      )

    const hazard={
      geometry,

      severity:{
        level:3
      },

      /*
       * A supported identical forecast represents
       * observed zero storm translation. This is
       * different from missing motion.
       */
      forecast:[
        {
          horizonMinutes:5,
          supported:true,
          geometry,
          support:{
            fraction:1
          }
        }
      ]
    }

    const result=
      assessStormThreat({
        hazard,

        vessel:{
          position:{
            longitude:0,
            latitude:0
          },

          /*
           * Signal K:
           * SOG = m/s
           * COG = radians true
           *
           * pi/2 therefore means east.
           */
          sog:10,
          cog:Math.PI/2
        },

        config:{
          warnDistanceM:20_000,
          alarmDistanceM:3_000,
          horizonMinutes:60,
          warnSeverity:3,
          alarmSeverity:4,
          pathStepSec:30
        }
      })

    assert.equal(
      result.cpa.closing,
      true
    )

    assert.ok(
      result.cpa.tcpaSec>900
    )

    assert.ok(
      result.cpa.tcpaSec<1300
    )

    assert.ok(
      result.cpa.dcpaMeters<1000
    )
  }
)


test(
  'warns for severe nearby hazard and alarms inside alarm distance',
  ()=>{
    const base={
      severity:{
        level:3
      },
      forecast:[]
    }

    const config={
      warnDistanceM:20_000,
      alarmDistanceM:5_000,
      horizonMinutes:60,
      warnSeverity:3,
      alarmSeverity:4,
      pathStepSec:30
    }

    const vessel={
      position:{
        longitude:0,
        latitude:0
      },
      sog:0,
      cog:0
    }

    const warning=
      assessStormThreat({
        hazard:{
          ...base,
          geometry:
            square(
              0.12,-0.005,
              0.13, 0.005
            )
        },
        vessel,
        config
      })

    assert.equal(
      warning.state,
      'warn'
    )

    assert.equal(
      warning.threat.predictive,
      false
    )

    const alarm=
      assessStormThreat({
        hazard:{
          ...base,
          geometry:
            square(
              0.02,-0.005,
              0.03,0.005
            )
        },
        vessel,
        config
      })

    assert.equal(
      alarm.state,
      'alarm'
    )
  }
)


test(
  'distant severe hazard remains normal',
  ()=>{
    const result=
      assessStormThreat({
        hazard:{
          geometry:
            square(
              1,-0.01,
              1.02,0.01
            ),

          severity:{
            level:5
          },

          forecast:[]
        },

        vessel:{
          position:{
            longitude:0,
            latitude:0
          },
          sog:0,
          cog:0
        },

        config:{
          warnDistanceM:20_000,
          alarmDistanceM:5_000,
          horizonMinutes:60,
          warnSeverity:3,
          alarmSeverity:4,
          pathStepSec:30
        }
      })

    assert.equal(
      result.state,
      'normal'
    )
  }
)


test(
  'missing storm motion never fabricates stationary predictive CPA',
  ()=>{
    const result=
      assessStormThreat({
        hazard:{
          geometry:
            square(
              0.12,-0.005,
              0.13,0.005
            ),

          severity:{
            level:3
          },

          forecast:[]
        },

        vessel:{
          position:{
            longitude:0,
            latitude:0
          },
          sog:8,
          cog:Math.PI/2
        },

        config:{
          warnDistanceM:20_000,
          alarmDistanceM:5_000,
          horizonMinutes:60,
          warnSeverity:3,
          alarmSeverity:4,
          pathStepSec:30
        }
      })

    assert.equal(
      result.cpa,
      null
    )

    assert.equal(
      result.pathThreat,
      null
    )

    assert.equal(
      result.threat.predictive,
      false
    )
  }
)
