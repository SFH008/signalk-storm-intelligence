'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  selectStormSource
}=require('../lib/storm-source-selector')


const sources=[
  {
    source:'ipma:PCR',
    bounds:[
      -12.454795,
      34.011513,
      -4.345465,
      43.792862
    ]
  },
  {
    source:'aemet:COMPO',
    bounds:[
      -12.11,
      33.2131131,
      6.111581,
      46.30
    ]
  }
]


test(
  'selector keeps current source while vessel and projected route remain covered',
  ()=>{
    const result=
      selectStormSource({
        sources,
        activeSource:'ipma:PCR',

        position:{
          longitude:-9.20,
          latitude:38.70
        },

        projectedPosition:{
          longitude:-8.50,
          latitude:38.70
        }
      })

    assert.equal(
      result.source,
      'ipma:PCR'
    )

    assert.equal(
      result.reason,
      'active-source-covers-route'
    )
  }
)


test(
  'selector changes source before projected route leaves current radar coverage',
  ()=>{
    const result=
      selectStormSource({
        sources,
        activeSource:'ipma:PCR',

        position:{
          longitude:-5.00,
          latitude:38.70
        },

        projectedPosition:{
          longitude:-3.80,
          latitude:38.70
        }
      })

    assert.equal(
      result.source,
      'aemet:COMPO'
    )

    assert.equal(
      result.reason,
      'projected-route-coverage'
    )
  }
)


test(
  'selector chooses provider covering vessel and route when there is no active source',
  ()=>{
    const result=
      selectStormSource({
        sources,
        activeSource:null,

        position:{
          longitude:-3.70,
          latitude:40.40
        },

        projectedPosition:{
          longitude:-3.20,
          latitude:40.40
        }
      })

    assert.equal(
      result.source,
      'aemet:COMPO'
    )
  }
)


test('projects vessel position from Signal K SOG and COG',()=>{
  const {
    projectVesselPosition
  }=require('../lib/storm-source-selector')

  const projected=
    projectVesselPosition({
      position:{
        longitude:-5.0,
        latitude:38.7
      },
      sog:10,
      cog:Math.PI/2,
      horizonMinutes:60
    })

  assert.ok(projected)
  assert.ok(projected.longitude>-4.7)
  assert.ok(projected.longitude<-4.4)
  assert.ok(Math.abs(projected.latitude-38.7)<0.1)
})


test('projection is unavailable without valid navigation data',()=>{
  const {
    projectVesselPosition
  }=require('../lib/storm-source-selector')

  assert.equal(
    projectVesselPosition({
      position:{longitude:-5,latitude:38.7},
      sog:null,
      cog:null,
      horizonMinutes:60
    }),
    null
  )
})
