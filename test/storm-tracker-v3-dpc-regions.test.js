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
    observedAt:'2026-10-02T12:00:00.000Z',

    /*
     * At the equator:
     * 0.1 degree longitude ~= 11.1 km.
     *
     * Each synthetic pixel is intentionally large
     * enough to exceed the 25 km2 region threshold.
     */
    width:4,
    height:1,
    bounds:[0,0,0.4,0.1],

    values:Float32Array.from(values),

    valueSemantics:{
      representation:'measurement',
      derivation:'native',
      sourceQuantity:'reflectivity',
      sourceUnits:'dBZ',
      intervalSemantics:null,
      conversion:null
    },

    provenance:{
      provider:'test',
      product:'synthetic',
      method:'dpc-region-experiment'
    }
  }
}


test(
  'DPC-inspired segmentation keeps nearby disconnected qualified regions separate',
  ()=>{
    const candidates=
      detectStormCandidates(
        field([
          30,
          NaN,
          30,
          NaN
        ]),
        {
          minReflectivityDbz:24,
          minAreaKm2:25,
          maxAreaKm2:1000
        }
      )

    assert.equal(
      candidates.length,
      2
    )

    assert.equal(
      candidates[0].geometry.type,
      'Polygon'
    )

    assert.equal(
      candidates[1].geometry.type,
      'Polygon'
    )
  }
)


test(
  'hazard-region stage keeps nearby disconnected qualified regions separate',
  ()=>{
    const candidates=
      detectStormCandidates(
        field([
          30,
          NaN,
          30,
          NaN
        ]),
        {
          minReflectivityDbz:24,
          minAreaKm2:25,
          maxAreaKm2:1000
        }
      )

    assert.equal(
      candidates.length,
      2
    )

    const result=
      buildHazardRegions(
        candidates,
        {
          minRegionAreaKm2:25,
          observedAt:
            '2026-10-02T12:00:00.000Z'
        }
      )

    assert.equal(
      result.regions.length,
      2
    )

    assert.deepEqual(
      result.regions.map(
        region=>
          region.properties.memberCount
      ),
      [1,1]
    )

    assert.deepEqual(
      result.regions.map(
        region=>region.geometry
      ),
      candidates.map(
        candidate=>candidate.geometry
      )
    )
  }
)


test(
  'DPC-inspired segmentation preserves one contiguous qualified region directly',
  ()=>{
    const candidates=
      detectStormCandidates(
        field([
          30,
          30,
          NaN,
          NaN
        ]),
        {
          minReflectivityDbz:24,
          minAreaKm2:25,
          maxAreaKm2:1000
        }
      )

    assert.equal(
      candidates.length,
      1
    )

    assert.equal(
      candidates[0]
        .properties
        .detection
        .pixelCount,
      2
    )

    const ring=
      candidates[0]
        .geometry
        .coordinates[0]

    const xs=
      ring.map(
        point=>point[0]
      )

    assert.equal(
      Math.min(...xs),
      0
    )

    assert.equal(
      Math.max(...xs),
      0.2
    )
  }
)
