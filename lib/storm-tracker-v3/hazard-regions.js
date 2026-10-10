'use strict'

const {
  centroidGeometry
}=require('../storm-geometry')

const {
  connectedComponents,
  componentGeometry,
  pixelAreaKm2
}=require('../storm-detector')


const DEFAULT_MIN_REGION_AREA_KM2=25
const DEFAULT_BODY_REFLECTIVITY_DBZ=30
const DEFAULT_SEED_REFLECTIVITY_DBZ=36
const DEFAULT_MIN_SEED_AREA_KM2=25


function finite(value){
  return Number.isFinite(
    Number(value)
  )
}


function candidateId(
  candidate,
  index
){
  return String(
    candidate
      ?.properties
      ?.sourceId ??
    candidate?.id ??
    `candidate-${index}`
  )
}


function candidateAreaKm2(
  candidate
){
  const area=
    Number(
      candidate
        ?.properties
        ?.detection
        ?.areaKm2
    )

  return Number.isFinite(area)
    ? area
    : 0
}


function usableReflectivity(
  candidate
){
  const reflectivity=
    candidate
      ?.properties
      ?.evidence
      ?.reflectivity

  if(
    reflectivity?.available===true &&
    reflectivity.units==='dBZ' &&
    Number.isFinite(
      Number(
        reflectivity.maxDbz
      )
    )
  ){
    return {
      ...reflectivity,
      maxDbz:
        Number(
          reflectivity.maxDbz
        )
    }
  }

  return null
}


function strongestReflectivityMember(
  rows
){
  let strongest=null
  let strongestDbz=-Infinity

  for(const row of rows){
    const reflectivity=
      usableReflectivity(
        row.candidate
      )

    if(
      reflectivity &&
      reflectivity.maxDbz>
      strongestDbz
    ){
      strongest={
        row,
        reflectivity
      }

      strongestDbz=
        reflectivity.maxDbz
    }
  }

  return strongest
}


function buildRegion(
  rows,
  ordinal,
  observedAt=null
){
  const members=
    rows.map(
      row=>row.candidate
    )

  const memberIds=
    rows
      .map(row=>row.id)
      .sort()


  const combinedAreaKm2=
    rows.reduce(
      (sum,row)=>
        sum+
        row.areaKm2,
      0
    )


  const geometry=
    members[0]?.geometry ?? null

  if(!geometry){
    return null
  }


  const strongest=
    strongestReflectivityMember(
      rows
    )


  /*
   * Preserve the strongest member's provider-neutral
   * observation metadata as the evidence base.
   *
   * The region geometry and area are aggregate
   * operational properties, not fabricated radar
   * measurements.
   */
  const strongestProperties=
    strongest
      ?.row
      ?.candidate
      ?.properties ||
    rows[0]
      ?.candidate
      ?.properties ||
    {}


  const maxReflectivityDbz=
    strongest
      ? strongest.reflectivity.maxDbz
      : rows
          .map(
            row=>
              Number(
                row.candidate
                  ?.properties
                  ?.detection
                  ?.maxReflectivityDbz
              )
          )
          .filter(Number.isFinite)
          .reduce(
            (max,value)=>
              Math.max(max,value),
            -Infinity
          )


  const localId=
    `hazard-region-${ordinal}`

  const observationId=
    observedAt
      ? `${observedAt}:${localId}`
      : localId


  const detection={
    ...(strongestProperties.detection||{}),

    areaKm2:
      combinedAreaKm2
  }


  if(
    Number.isFinite(
      maxReflectivityDbz
    )
  ){
    detection.maxReflectivityDbz=
      maxReflectivityDbz
  }


  const evidence={
    ...(strongestProperties.evidence||{})
  }


  if(strongest){
    evidence.reflectivity={
      ...strongest.reflectivity
    }
  }


  return {
    type:'Feature',

    id:
      observationId,

    geometry,

    properties:{
      ...strongestProperties,

      sourceId:
        observationId,

      observationId:
        observationId,

      ...(observedAt
        ? {observedAt}
        : {}),

      classification:
        'operational-hazard-region',

      memberCount:
        members.length,

      memberIds,

      combinedAreaKm2,

      detection,

      evidence
    },

    /*
     * Original detected radar objects remain
     * evidence only. They do not become independent
     * operational tracks.
     */
    members
  }
}



function componentAreaKm2(
  field,
  component
){
  let areaKm2=0

  for(const index of component){
    const y=Math.floor(index/field.width)
    const x=index-y*field.width

    areaKm2+=
      pixelAreaKm2(
        field,
        x,
        y
      )
  }

  return areaKm2
}


function partitionBody(
  body,
  seeds,
  width,
  height
){
  if(seeds.length===1){
    return [body]
  }

  const size=width*height
  const inside=new Uint8Array(size)
  const labels=new Int32Array(size)

  labels.fill(-1)

  for(const index of body){
    inside[index]=1
  }

  const queue=[]

  seeds.forEach(
    (seed,label)=>{
      for(const index of seed){
        labels[index]=label
        queue.push(index)
      }
    }
  )

  const neighbours=[
    [-1,-1],[0,-1],[1,-1],
    [-1,0],         [1,0],
    [-1,1], [0,1], [1,1]
  ]

  let head=0

  while(head<queue.length){
    const index=queue[head++]
    const label=labels[index]

    const y=Math.floor(index/width)
    const x=index-y*width

    for(const [dx,dy] of neighbours){
      const nx=x+dx
      const ny=y+dy

      if(
        nx<0 ||
        nx>=width ||
        ny<0 ||
        ny>=height
      ){
        continue
      }

      const ni=ny*width+nx

      if(
        inside[ni]!==1 ||
        labels[ni]!==-1
      ){
        continue
      }

      labels[ni]=label
      queue.push(ni)
    }
  }

  const parts=
    seeds.map(()=>[])

  for(const index of body){
    const label=labels[index]

    if(label>=0){
      parts[label].push(index)
    }
  }

  return parts.filter(
    part=>part.length>0
  )
}


function buildDecomposedRegions(
  field,
  options={}
){
  if(
    field?.schema!==
    'storm-normalized-evidence/1'
  ){
    throw new TypeError(
      'Normalized storm evidence v1 is required'
    )
  }

  if(
    field.domain!=='radar' ||
    field.quantity!=='reflectivity' ||
    field.units!=='dBZ'
  ){
    throw new TypeError(
      'Reflectivity evidence is required'
    )
  }

  const values=field.values

  if(
    !Number.isInteger(field.width) || field.width <= 0 ||
    !Number.isInteger(field.height) || field.height <= 0 ||
    !values || values.length !== field.width * field.height ||
    !Array.isArray(field.bounds) || field.bounds.length !== 4 ||
    !field.bounds.every(Number.isFinite) ||
    field.bounds[0] >= field.bounds[2] || field.bounds[1] >= field.bounds[3] ||
    field.bounds[0] < -180 || field.bounds[2] > 180 ||
    field.bounds[1] < -90 || field.bounds[3] > 90
  ){
    throw new TypeError(
      'Valid reflectivity grid dimensions, values and geographic bounds are required'
    )
  }

  const bodyDbz=
    Number(
      options.bodyReflectivityDbz ??
      DEFAULT_BODY_REFLECTIVITY_DBZ
    )

  const seedDbz=
    Number(
      options.seedReflectivityDbz ??
      DEFAULT_SEED_REFLECTIVITY_DBZ
    )

  const minSeedAreaKm2=
    Number(
      options.minSeedAreaKm2 ??
      DEFAULT_MIN_SEED_AREA_KM2
    )

  const minRegionAreaKm2=
    Number(
      options.minRegionAreaKm2 ??
      DEFAULT_MIN_REGION_AREA_KM2
    )

  if (
    !Number.isFinite(bodyDbz) || bodyDbz < -20 || bodyDbz > 80 ||
    !Number.isFinite(seedDbz) || seedDbz < -20 || seedDbz > 80 ||
    !Number.isFinite(minSeedAreaKm2) || minSeedAreaKm2 < 0 ||
    !Number.isFinite(minRegionAreaKm2) || minRegionAreaKm2 < 0
  ) {
    throw new TypeError('Valid reflectivity thresholds and non-negative finite areas are required')
  }

  const observedAt=
    options.observedAt ??
    field.observedAt ??
    null

  const bodies=
    connectedComponents(
      field,
      index=>
        Number.isFinite(values[index]) &&
        values[index]>=bodyDbz
    )

  const seeds=
    connectedComponents(
      field,
      index=>
        Number.isFinite(values[index]) &&
        values[index]>=Math.max(bodyDbz,seedDbz)
    )
      .map(component=>({
        component,
        areaKm2:
          componentAreaKm2(
            field,
            component
          )
      }))
      .filter(
        seed=>
          seed.areaKm2>=
          minSeedAreaKm2
      )

  const bodyByPixel=
    new Int32Array(
      field.width*
      field.height
    )

  bodyByPixel.fill(-1)

  bodies.forEach(
    (body,index)=>{
      for(const pixel of body){
        bodyByPixel[pixel]=index
      }
    }
  )

  const seedsByBody=
    new Map()

  for(const seed of seeds){
    const bodyIndex=
      bodyByPixel[
        seed.component[0]
      ]

    if(bodyIndex<0){
      continue
    }

    if(!seedsByBody.has(bodyIndex)){
      seedsByBody.set(
        bodyIndex,
        []
      )
    }

    seedsByBody
      .get(bodyIndex)
      .push(seed)
  }

  const promoted=[]
  const suppressed=[]

  let ordinal=1

  for(
    let bodyIndex=0;
    bodyIndex<bodies.length;
    bodyIndex++
  ){
    const bodySeeds=
      seedsByBody.get(bodyIndex)

    if(!bodySeeds?.length){
      continue
    }

    bodySeeds.sort(
      (a,b)=>
        a.component[0]-
        b.component[0]
    )

    const parts=
      partitionBody(
        bodies[bodyIndex],
        bodySeeds.map(
          seed=>seed.component
        ),
        field.width,
        field.height
      )

    for(
      let partIndex=0;
      partIndex<parts.length;
      partIndex++
    ){
      const component=
        parts[partIndex]

      const geometry=
        componentGeometry(
          field,
          component
        )

      if(!geometry){
        continue
      }

      let areaKm2=0
      let maxReflectivityDbz=-Infinity
      let sumReflectivityDbz=0
      let count=0
      let area30Km2=0
      let area36Km2=0
      let area42Km2=0

      for(const index of component){
        const y=
          Math.floor(
            index/field.width
          )

        const x=
          index-
          y*field.width

        const pixelArea=
          pixelAreaKm2(
            field,
            x,
            y
          )

        const value=
          values[index]

        areaKm2+=pixelArea
        if(value>=30){
          area30Km2+=pixelArea
        }

        if(value>=36){
          area36Km2+=pixelArea
        }

        if(value>=42){
          area42Km2+=pixelArea
        }

        maxReflectivityDbz=
          Math.max(
            maxReflectivityDbz,
            value
          )

        sumReflectivityDbz+=value
        count++
      }

      const localId=
        `hazard-region-${ordinal++}`

      const observationId=
        observedAt
          ? `${observedAt}:${localId}`
          : localId

      const seed=
        bodySeeds[
          Math.min(
            partIndex,
            bodySeeds.length-1
          )
        ]

      const region={
        type:'Feature',

        id:observationId,

        geometry,

        properties:{
          sourceId:
            observationId,

          observationId,

          ...(observedAt
            ? {observedAt}
            : {}),

          classification:
            'operational-hazard-region',

          memberCount:1,

          memberIds:[],

          combinedAreaKm2:
            areaKm2,

          detection:{
            method:
              'reflectivity-core-decomposition-v1',

            qualification:{
              bodyThresholdDbz:
                bodyDbz,

              seedThresholdDbz:
                seedDbz,

              minSeedAreaKm2
            },

            pixelCount:
              component.length,

            areaKm2,

            maxReflectivityDbz,

            meanReflectivityDbz:
              count
                ? sumReflectivityDbz/count
                : null,

            areaFractionAtOrAbove30:
              areaKm2
                ? area30Km2/areaKm2
                : 0,

            areaFractionAtOrAbove36:
              areaKm2
                ? area36Km2/areaKm2
                : 0,

            areaFractionAtOrAbove42:
              areaKm2
                ? area42Km2/areaKm2
                : 0
          },

          evidence:{
            reflectivity:{
              available:true,
              units:'dBZ',
              maxDbz:
                maxReflectivityDbz,

              representation:
                field
                  ?.valueSemantics
                  ?.representation ??
                field
                  ?.provenance
                  ?.representation,

              provenance:
                field.provenance
            }
          },

          decomposition:{
            method:
              'seeded-geodesic-reflectivity-v1',

            bodyThresholdDbz:
              bodyDbz,

            seedThresholdDbz:
              seedDbz,

            seedAreaKm2:
              seed?.areaKm2 ?? null,

            bodyIndex:
              bodyIndex+1,

            seedIndex:
              partIndex+1,

            seedsInBody:
              bodySeeds.length
          }
        },

        members:[]
      }

      if(
        areaKm2>=
        minRegionAreaKm2
      ){
        promoted.push(region)
      }else{
        suppressed.push(region)
      }
    }
  }

  return {
    regions:promoted,

    suppressed,

    diagnostics:{
      mode:
        'reflectivity-core-decomposition-v1',

      bodies30:
        bodies.length,

      qualifiedSeeds36:
        seeds.length,

      promotedRegions:
        promoted.length,

      suppressedRegions:
        suppressed.length,

      bodyReflectivityDbz:
        bodyDbz,

      seedReflectivityDbz:
        seedDbz,

      minSeedAreaKm2,

      minRegionAreaKm2
    }
  }
}


function buildHazardRegions(
  candidates,
  options={}
){
  const minRegionAreaKm2=
    Number(
      options.minRegionAreaKm2 ??
      DEFAULT_MIN_REGION_AREA_KM2
    )

  const observedAt=
    options.observedAt ??
    null


  if(
    !(minRegionAreaKm2>=0)
  ){
    throw new TypeError(
      'non-negative minRegionAreaKm2 required'
    )
  }


  if(options.field){
    return buildDecomposedRegions(
      options.field,
      {
        ...options,
        minRegionAreaKm2,
        observedAt
      }
    )
  }


  const rows=
    (candidates||[])
      .map(
        (candidate,index)=>{
          const centroid=
            centroidGeometry(
              candidate.geometry
            )

          return {
            candidate,

            id:
              candidateId(
                candidate,
                index
              ),

            areaKm2:
              candidateAreaKm2(
                candidate
              ),

            centroid
          }
        }
      )
      .filter(
        row=>
          Array.isArray(
            row.centroid
          ) &&
          finite(
            row.centroid[0]
          ) &&
          finite(
            row.centroid[1]
          )
      )


  /*
   * Operational hazard regions preserve each
   * contiguous detected radar object independently.
   *
   * Nearby but disconnected candidates must not be
   * merged into one artificial envelope.
   */
  const candidateRegions=
    rows.map(
      row=>[row]
    )


  /*
   * Keep ordering deterministic so source IDs do
   * not depend on input ordering accidents.
   */
  candidateRegions.sort(
    (a,b)=>{
      const ac=a[0].centroid
      const bc=b[0].centroid

      return (
        ac[0]-bc[0] ||
        ac[1]-bc[1]
      )
    }
  )


  const promoted=[]
  const suppressed=[]


  let ordinal=1

  for(const candidateRegion of candidateRegions){
    const region=
      buildRegion(
        candidateRegion,
        ordinal++,
        observedAt
      )

    if(!region){
      continue
    }


    if(
      region
        .properties
        .combinedAreaKm2 >=
      minRegionAreaKm2
    ){
      promoted.push(region)
    } else {
      suppressed.push(region)
    }
  }


  return {
    regions:promoted,
    suppressed,

    diagnostics:{
      inputCandidates:
        rows.length,

      candidateRegions:
        candidateRegions.length,

      promotedRegions:
        promoted.length,

      suppressedRegions:
        suppressed.length,

      minRegionAreaKm2
    }
  }
}


module.exports={
  DEFAULT_MIN_REGION_AREA_KM2,
  buildHazardRegions
}
