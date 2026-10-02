'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  lightningScore
}=require('../lib/storm-severity-v1')


test('lightning severity remains unavailable without valid coverage',()=>{
  assert.equal(
    lightningScore(null),
    null
  )

  assert.equal(
    lightningScore({
      available:false,
      count10min:10,
      ratePerMinute:2,
      countAssociated:10,
      trend:'increasing',
      jump:{detected:true}
    }),
    null
  )
})


test('valid lightning coverage with zero strikes has zero severity contribution',()=>{
  assert.equal(
    lightningScore({
      available:true,
      count10min:0,
      ratePerMinute:0,
      countAssociated:0,
      trend:'steady',
      jump:{detected:false}
    }),
    0
  )
})


test('lightning severity uses deterministic normalized evidence weights',()=>{
  const score=
    lightningScore({
      available:true,
      count10min:10,
      ratePerMinute:2,
      countAssociated:5,
      trend:'steady',
      jump:{detected:false}
    })

  /*
   * count10:     10/50 = .20  * .35 = .0700
   * rate:         2/8  = .25  * .25 = .0625
   * jump:                     * .20 = .0000
   * trend steady:       .50   * .10 = .0500
   * associated:  5/50 = .10  * .10 = .0100
   *
   * total = .1925
   */
  assert.ok(
    Math.abs(score-0.1925)<1e-12
  )
})


test('maximum lightning evidence clamps to one',()=>{
  assert.equal(
    lightningScore({
      available:true,
      count10min:100,
      ratePerMinute:20,
      countAssociated:100,
      trend:'increasing',
      jump:{detected:true}
    }),
    1
  )
})

test('Storm Severity v1 includes available lightning evidence',()=>{
  const {
    calculateStormSeverityV1
  }=require('../lib/storm-severity-v1')

  const observation={
    type:'Feature',

    geometry:{
      type:'Polygon',
      coordinates:[[
        [12,40],
        [12.1,40],
        [12.1,40.1],
        [12,40.1],
        [12,40]
      ]]
    },

    properties:{
      memberCount:3,

      detection:{
        areaKm2:100
      },

      evidence:{
        reflectivity:{
          available:true,
          units:'dBZ',
          maxDbz:48,
          representation:'measurement'
        }
      }
    }
  }

  const severity=
    calculateStormSeverityV1(
      observation,
      null,
      {
        available:true,
        count10min:10,
        ratePerMinute:2,
        countAssociated:5,
        trend:'steady',
        jump:{detected:false}
      }
    )

  assert.equal(
    severity.components.lightning.available,
    true
  )

  assert.ok(
    Math.abs(
      severity.components.lightning.score-
      0.1925
    )<1e-12
  )
})

