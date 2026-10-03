'use strict'

const {
  centroidGeometry
}=require('../storm-geometry')


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
