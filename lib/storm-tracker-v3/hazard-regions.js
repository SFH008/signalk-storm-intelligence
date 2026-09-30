'use strict'

const {
  centroidGeometry
}=require('../storm-geometry')


const DEFAULT_CLUSTER_DISTANCE_KM=25
const DEFAULT_MIN_REGION_AREA_KM2=25


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


function haversineKm(
  a,
  b
){
  const R=6371

  const lat1=
    a[1]*
    Math.PI/180

  const lat2=
    b[1]*
    Math.PI/180

  const dLat=
    (b[1]-a[1])*
    Math.PI/180

  const dLon=
    (b[0]-a[0])*
    Math.PI/180

  const s=
    Math.sin(dLat/2)**2+
    Math.cos(lat1)*
    Math.cos(lat2)*
    Math.sin(dLon/2)**2

  return 2*R*Math.asin(
    Math.min(
      1,
      Math.sqrt(s)
    )
  )
}


function geometryVertices(
  geometry
){
  if(
    !geometry ||
    ![
      'Polygon',
      'MultiPolygon'
    ].includes(geometry.type)
  ){
    throw new TypeError(
      'Polygon or MultiPolygon geometry required'
    )
  }

  const points=[]

  function addRing(ring){
    for(const coordinate of ring){
      if(
        Array.isArray(coordinate) &&
        finite(coordinate[0]) &&
        finite(coordinate[1])
      ){
        points.push([
          Number(coordinate[0]),
          Number(coordinate[1])
        ])
      }
    }
  }


  if(geometry.type==='Polygon'){
    for(const ring of geometry.coordinates){
      addRing(ring)
    }
  } else {
    for(const polygon of geometry.coordinates){
      for(const ring of polygon){
        addRing(ring)
      }
    }
  }

  return points
}


function cross(
  origin,
  a,
  b
){
  return (
    (a[0]-origin[0])*
    (b[1]-origin[1])-
    (a[1]-origin[1])*
    (b[0]-origin[0])
  )
}


function convexHull(
  points
){
  const unique=
    [...new Map(
      points.map(
        point=>[
          `${point[0]},${point[1]}`,
          point
        ]
      )
    ).values()]
      .sort(
        (a,b)=>
          a[0]-b[0] ||
          a[1]-b[1]
      )


  if(unique.length<3){
    return null
  }


  const lower=[]

  for(const point of unique){
    while(
      lower.length>=2 &&
      cross(
        lower[lower.length-2],
        lower[lower.length-1],
        point
      )<=0
    ){
      lower.pop()
    }

    lower.push(point)
  }


  const upper=[]

  for(
    let i=unique.length-1;
    i>=0;
    i--
  ){
    const point=unique[i]

    while(
      upper.length>=2 &&
      cross(
        upper[upper.length-2],
        upper[upper.length-1],
        point
      )<=0
    ){
      upper.pop()
    }

    upper.push(point)
  }


  lower.pop()
  upper.pop()

  const hull=[
    ...lower,
    ...upper
  ]


  if(hull.length<3){
    return null
  }


  return {
    type:'Polygon',

    coordinates:[[
      ...hull,
      hull[0]
    ]]
  }
}


function coherentEnvelope(
  members
){
  if(members.length===1){
    return members[0].geometry
  }

  const vertices=
    members.flatMap(
      member=>
        geometryVertices(
          member.geometry
        )
    )

  return convexHull(vertices)
}


function proximityClusters(
  rows,
  clusterDistanceKm
){
  const parent=
    rows.map((_,index)=>index)


  function find(index){
    while(parent[index]!==index){
      parent[index]=
        parent[parent[index]]

      index=
        parent[index]
    }

    return index
  }


  function join(a,b){
    const rootA=find(a)
    const rootB=find(b)

    if(rootA!==rootB){
      parent[rootB]=rootA
    }
  }


  for(let i=0;i<rows.length;i++){
    for(let j=i+1;j<rows.length;j++){
      const distance=
        haversineKm(
          rows[i].centroid,
          rows[j].centroid
        )

      if(
        distance<=
        clusterDistanceKm
      ){
        join(i,j)
      }
    }
  }


  const groups=
    new Map()


  for(let i=0;i<rows.length;i++){
    const root=find(i)

    if(!groups.has(root)){
      groups.set(root,[])
    }

    groups.get(root)
      .push(rows[i])
  }


  return [
    ...groups.values()
  ]
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
    coherentEnvelope(
      members
    )

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


function buildHazardRegions(
  candidates,
  options={}
){
  const clusterDistanceKm=
    Number(
      options.clusterDistanceKm ??
      DEFAULT_CLUSTER_DISTANCE_KM
    )

  const minRegionAreaKm2=
    Number(
      options.minRegionAreaKm2 ??
      DEFAULT_MIN_REGION_AREA_KM2
    )

  const observedAt=
    options.observedAt ??
    null


  if(
    !(clusterDistanceKm>0)
  ){
    throw new TypeError(
      'positive clusterDistanceKm required'
    )
  }


  if(
    !(minRegionAreaKm2>=0)
  ){
    throw new TypeError(
      'non-negative minRegionAreaKm2 required'
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


  const clusters=
    proximityClusters(
      rows,
      clusterDistanceKm
    )


  /*
   * Keep ordering deterministic so source IDs do
   * not depend on Map insertion accidents.
   */
  clusters.sort(
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

  for(const cluster of clusters){
    const region=
      buildRegion(
        cluster,
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

      proximityClusters:
        clusters.length,

      promotedRegions:
        promoted.length,

      suppressedRegions:
        suppressed.length,

      clusterDistanceKm,
      minRegionAreaKm2
    }
  }
}


module.exports={
  DEFAULT_CLUSTER_DISTANCE_KM,
  DEFAULT_MIN_REGION_AREA_KM2,
  haversineKm,
  coherentEnvelope,
  buildHazardRegions
}
