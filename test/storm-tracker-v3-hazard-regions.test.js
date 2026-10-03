'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  buildHazardRegions,
  DEFAULT_MIN_REGION_AREA_KM2
}=require('../lib/storm-tracker-v3/hazard-regions')


function square(
  id,
  west,
  south,
  east,
  north,
  areaKm2
){
  return {
    type:'Feature',
    id,
    geometry:{
      type:'Polygon',
      coordinates:[[
        [west,south],
        [east,south],
        [east,north],
        [west,north],
        [west,south]
      ]]
    },
    properties:{
      sourceId:id,
      detection:{
        areaKm2
      }
    }
  }
}


test(
  'uses agreed pragmatic minimum hazard-region area',
  ()=>{
    assert.equal(
      DEFAULT_MIN_REGION_AREA_KM2,
      25
    )
  }
)


test(
  'nearby sub-threshold candidates remain separate and suppressed',
  ()=>{
    const candidates=[
      square('a',0,0,0.05,0.05,10),
      square('b',0.15,0,0.20,0.05,9),
      square('c',0.30,0,0.35,0.05,8)
    ]

    const result=
      buildHazardRegions(
        candidates
      )

    assert.equal(
      result.regions.length,
      0
    )

    assert.equal(
      result.suppressed.length,
      3
    )

    assert.deepEqual(
      result.suppressed.map(
        region=>region.properties.memberCount
      ),
      [1,1,1]
    )

    assert.deepEqual(
      result.suppressed.map(
        region=>region.properties.combinedAreaKm2
      ),
      [10,9,8]
    )
  }
)


test(
  'disconnected candidate geometries are never bridged by a synthetic envelope',
  ()=>{
    const candidates=[
      square('a',0,0,0.05,0.05,30),
      square('b',0.15,0,0.20,0.05,30)
    ]

    const result=
      buildHazardRegions(
        candidates
      )

    assert.equal(
      result.regions.length,
      2
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
  'each promoted hazard region preserves exactly one source candidate',
  ()=>{
    const candidates=[
      square('a',0,0,0.05,0.05,30),
      square('b',0.15,0,0.20,0.05,30)
    ]

    const result=
      buildHazardRegions(
        candidates
      )

    assert.equal(
      result.regions.length,
      2
    )

    assert.equal(
      result.regions[0].members.length,
      1
    )

    assert.equal(
      result.regions[1].members.length,
      1
    )

    assert.equal(
      result.regions[0].members[0],
      candidates[0]
    )

    assert.equal(
      result.regions[1].members[0],
      candidates[1]
    )
  }
)


test(
  'small isolated region is not promoted',
  ()=>{
    const candidates=[
      square(
        'small',
        0,
        0,
        0.05,
        0.05,
        8
      )
    ]

    const result=
      buildHazardRegions(
        candidates
      )

    assert.equal(
      result.regions.length,
      0
    )

    assert.equal(
      result.suppressed.length,
      1
    )

    assert.equal(
      result.suppressed[0]
        .properties
        .combinedAreaKm2,
      8
    )
  }
)


test(
  'large singleton remains a tracked hazard region',
  ()=>{
    const candidate=
      square(
        'large',
        0,
        0,
        0.10,
        0.10,
        60
      )

    const result=
      buildHazardRegions([
        candidate
      ])

    assert.equal(
      result.regions.length,
      1
    )

    assert.equal(
      result.regions[0]
        .properties
        .memberCount,
      1
    )

    /*
     * Do not unnecessarily alter the observed
     * geometry of a singleton.
     */
    assert.deepEqual(
      result.regions[0].geometry,
      candidate.geometry
    )
  }
)


test(
  'distant candidates remain separate regions',
  ()=>{
    const candidates=[
      square(
        'a',
        0,
        0,
        0.05,
        0.05,
        30
      ),

      square(
        'b',
        1,
        0,
        1.05,
        0.05,
        30
      )
    ]

    const result=
      buildHazardRegions(
        candidates
      )

    assert.equal(
      result.regions.length,
      2
    )
  }
)


test(
  'nearby sub-threshold candidates are not transitively combined',
  ()=>{
    const candidates=[
      square(
        'a',
        0,
        0,
        0.04,
        0.04,
        10
      ),

      square(
        'b',
        0.18,
        0,
        0.22,
        0.04,
        10
      ),

      square(
        'c',
        0.36,
        0,
        0.40,
        0.04,
        10
      )
    ]

    const result=
      buildHazardRegions(
        candidates
      )

    assert.equal(
      result.regions.length,
      0
    )

    assert.equal(
      result.suppressed.length,
      3
    )

    assert.deepEqual(
      result.suppressed.map(
        region=>
          region.properties.memberCount
      ),
      [1,1,1]
    )
  }
)

test(
  'hazard region observation id is unique to its observation time',
  ()=>{
    const observedAt=
      '2026-09-30T10:00:00.000Z'

    const candidate=
      square(
        'a',
        -8.5,37,
        -8.4,37.1,
        30
      )

    candidate.properties.detection.maxReflectivityDbz=42
    candidate.properties.evidence={
      reflectivity:{
        available:true,
        units:'dBZ',
        maxDbz:42,
        representation:'measurement'
      }
    }

    const result=
      buildHazardRegions(
        [candidate],
        {observedAt}
      )

    assert.equal(
      result.regions[0].id,
      `${observedAt}:hazard-region-1`
    )

    assert.equal(
      result.regions[0]
        .properties
        .observedAt,
      observedAt
    )
  }
)


test(
  'hazard-region stage preserves candidate area and evidence without aggregation',
  ()=>{
    const observedAt=
      '2026-09-30T10:00:00.000Z'

    const a=
      square(
        'a',
        0,0,
        0.05,0.05,
        15
      )

    const b=
      square(
        'b',
        0.15,0,
        0.20,0.05,
        16
      )

    a.properties.detection.maxReflectivityDbz=38
    a.properties.evidence={
      reflectivity:{
        available:true,
        units:'dBZ',
        maxDbz:38,
        representation:'measurement'
      }
    }

    b.properties.detection.maxReflectivityDbz=47
    b.properties.evidence={
      reflectivity:{
        available:true,
        units:'dBZ',
        maxDbz:47,
        representation:'measurement'
      }
    }

    const result=
      buildHazardRegions(
        [a,b],
        {observedAt}
      )

    assert.equal(
      result.regions.length,
      0
    )

    assert.equal(
      result.suppressed.length,
      2
    )

    assert.deepEqual(
      result.suppressed.map(
        region=>
          region.properties.detection.areaKm2
      ),
      [15,16]
    )

    assert.deepEqual(
      result.suppressed.map(
        region=>
          region.properties.evidence.reflectivity.maxDbz
      ),
      [38,47]
    )

    assert.deepEqual(
      result.suppressed.map(
        region=>
          region.properties.memberCount
      ),
      [1,1]
    )
  }
)
