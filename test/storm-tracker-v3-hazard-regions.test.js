'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  buildHazardRegions,
  DEFAULT_CLUSTER_DISTANCE_KM,
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
  'uses agreed pragmatic defaults',
  ()=>{
    assert.equal(
      DEFAULT_CLUSTER_DISTANCE_KM,
      25
    )

    assert.equal(
      DEFAULT_MIN_REGION_AREA_KM2,
      25
    )
  }
)


test(
  'nearby candidates become one promoted hazard region',
  ()=>{
    /*
     * Roughly 11 km longitude separation at the equator.
     */
    const candidates=[
      square(
        'a',
        0,
        0,
        0.05,
        0.05,
        10
      ),

      square(
        'b',
        0.15,
        0,
        0.20,
        0.05,
        9
      ),

      square(
        'c',
        0.30,
        0,
        0.35,
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
      1
    )

    const region=
      result.regions[0]

    assert.equal(
      region.properties.memberCount,
      3
    )

    assert.equal(
      region.properties.combinedAreaKm2,
      27
    )

    assert.deepEqual(
      region.properties.memberIds,
      ['a','b','c']
    )
  }
)


test(
  'cluster envelope is one coherent Polygon',
  ()=>{
    const candidates=[
      square(
        'a',
        0,
        0,
        0.05,
        0.05,
        15
      ),

      square(
        'b',
        0.15,
        0,
        0.20,
        0.05,
        15
      )
    ]

    const result=
      buildHazardRegions(
        candidates
      )

    assert.equal(
      result.regions.length,
      1
    )

    assert.equal(
      result.regions[0].geometry.type,
      'Polygon'
    )

    /*
     * Operational envelope must span the gap
     * between the disconnected radar cores.
     */
    const ring=
      result.regions[0]
        .geometry
        .coordinates[0]

    const xs=
      ring.map(p=>p[0])

    assert.equal(
      Math.min(...xs),
      0
    )

    assert.equal(
      Math.max(...xs),
      0.20
    )
  }
)


test(
  'actual member geometries are preserved separately',
  ()=>{
    const candidates=[
      square(
        'a',
        0,
        0,
        0.05,
        0.05,
        15
      ),

      square(
        'b',
        0.15,
        0,
        0.20,
        0.05,
        15
      )
    ]

    const result=
      buildHazardRegions(
        candidates
      )

    const region=
      result.regions[0]

    assert.equal(
      region.members.length,
      2
    )

    assert.equal(
      region.members[0],
      candidates[0]
    )

    assert.equal(
      region.members[1],
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
  'proximity clustering is transitive',
  ()=>{
    /*
     * A-B and B-C are each inside the clustering
     * radius. A-C does not need to be.
     */
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
        candidates,
        {
          clusterDistanceKm:25
        }
      )

    assert.equal(
      result.regions.length,
      1
    )

    assert.equal(
      result.regions[0]
        .properties
        .memberCount,
      3
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
  'hazard region preserves strongest reflectivity evidence and aggregate area',
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
      1
    )

    const region=
      result.regions[0]

    assert.equal(
      region.properties.detection.areaKm2,
      31
    )

    assert.equal(
      region.properties.detection.maxReflectivityDbz,
      47
    )

    assert.equal(
      region.properties.evidence.reflectivity.maxDbz,
      47
    )

    assert.equal(
      region.properties.evidence.reflectivity.units,
      'dBZ'
    )
  }
)
