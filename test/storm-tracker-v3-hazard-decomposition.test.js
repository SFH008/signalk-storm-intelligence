'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  detectStormCandidates
}=require('../lib/storm-detector')

const {
  buildHazardRegions
}=require('../lib/storm-tracker-v3/hazard-regions')


function field(values){
  return {
    schema:'storm-normalized-evidence/1',
    domain:'radar',
    quantity:'reflectivity',
    units:'dBZ',
    observedAt:'2026-10-04T16:50:00.000Z',
    width:5,
    height:3,
    bounds:[0,0,0.5,0.3],
    values:Float64Array.from(values),
    valueSemantics:{
      representation:'measurement'
    },
    provenance:{
      provider:'test'
    }
  }
}


test(
  'compound 24 dBZ structure with two 36 dBZ seeds becomes two hazards',
  ()=>{
    const radar=field([
      24,24,24,24,24,
      36,30,30,30,36,
      24,24,24,24,24
    ])

    const candidates=
      detectStormCandidates(radar)

    assert.equal(candidates.length,1)

    const result=
      buildHazardRegions(
        candidates,
        {
          field:radar,
          observedAt:radar.observedAt
        }
      )

    assert.equal(result.regions.length,2)
  }
)


test(
  'single seeded hazard uses the 30 dBZ body rather than the full 24 dBZ parent',
  ()=>{
    const radar=field([
      24,24,24,24,24,
      30,30,36,30,30,
      24,24,24,24,24
    ])

    const candidates=
      detectStormCandidates(radar)

    assert.equal(candidates.length,1)

    const parentArea=
      candidates[0].properties.detection.areaKm2

    const result=
      buildHazardRegions(
        candidates,
        {
          field:radar,
          observedAt:radar.observedAt
        }
      )

    assert.equal(result.regions.length,1)

    assert.ok(
      result.regions[0].properties.detection.areaKm2 <
      parentArea
    )
  }
)


test(
  'operational decomposition still finds hazards when the 24 dBZ parent is absent from filtered candidates',
  ()=>{
    const width=20
    const height=20
    const values=[]

    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        let v=24

        if(y>=5 && y<=14 && x>=3 && x<=16){
          v=30
        }

        if(y>=7 && y<=11 && x>=5 && x<=8){
          v=36
        }

        if(y>=7 && y<=11 && x>=11 && x<=14){
          v=36
        }

        values.push(v)
      }
    }

    const radar={
      schema:'storm-normalized-evidence/1',
      domain:'radar',
      quantity:'reflectivity',
      units:'dBZ',
      observedAt:'2026-10-04T16:50:00.000Z',
      width,
      height,

      /*
       * Deliberately large geographic footprint so the
       * connected >=24 dBZ parent is far above 1000 km².
       */
      bounds:[0,0,4,4],

      values:Float64Array.from(values),

      valueSemantics:{
        representation:'measurement'
      },

      provenance:{
        provider:'test'
      }
    }

    const filteredCandidates=
      detectStormCandidates(
        radar,
        {
          minReflectivityDbz:24,
          minAreaKm2:5,
          maxAreaKm2:1000
        }
      )

    assert.equal(
      filteredCandidates.length,
      0
    )

    const result=
      buildHazardRegions(
        filteredCandidates,
        {
          field:radar,
          observedAt:radar.observedAt
        }
      )

    assert.equal(
      result.regions.length,
      2
    )
  }
)

test('decomposition rejects malformed grids, units and thresholds',()=>{
  const radar=field(Array(15).fill(36))
  for(const patch of [
    {width:0}, {height:1.5}, {values:new Float64Array(1)},
    {bounds:[0,0,Infinity,1]}, {bounds:[1,0,0,1]},
    {units:'mm/h'}, {domain:'environment'}
  ]){
    assert.throws(()=>buildHazardRegions([], {field:{...radar,...patch}}),TypeError)
  }
  for(const options of [
    {bodyReflectivityDbz:NaN}, {seedReflectivityDbz:Infinity},
    {minSeedAreaKm2:-1}, {minRegionAreaKm2:Infinity}
  ]){
    assert.throws(()=>buildHazardRegions([], {field:radar,...options}),TypeError)
  }
})

test('unseeded reflectivity bodies do not become hazards',()=>{
  const radar=field(Array(15).fill(30))
  assert.equal(buildHazardRegions([], {field:radar}).regions.length,0)
})

test('configured body threshold preserves measured reflectivity fractions and timestamp',()=>{
  const radar=field(Array(15).fill(24))
  const result=buildHazardRegions([], {
    field:radar, bodyReflectivityDbz:24, seedReflectivityDbz:24,
    minSeedAreaKm2:0, minRegionAreaKm2:0
  })
  assert.equal(result.regions.length,1)
  assert.equal(result.regions[0].properties.observedAt,radar.observedAt)
  assert.equal(result.regions[0].properties.detection.areaFractionAtOrAbove30,0)
})
