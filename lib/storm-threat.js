'use strict'

const {
  localVectorMeters,
  localPoint
}=require('./storm-motion')

const {
  centroidGeometry,
  translateGeometryLocal
}=require('./storm-geometry')


const METHOD='vessel-relative-kinematic-v1'


function clamp01(value){
  const n=Number(value)

  return Number.isFinite(n)
    ? Math.max(0,Math.min(1,n))
    : 0
}


function pointInRing(
  point,
  ring
){
  let inside=false

  for(
    let i=0,j=ring.length-1;
    i<ring.length;
    j=i++
  ){
    const xi=ring[i][0]
    const yi=ring[i][1]
    const xj=ring[j][0]
    const yj=ring[j][1]

    const intersects=
      (
        (yi>point[1]) !==
        (yj>point[1])
      ) &&
      (
        point[0] <
        (
          (xj-xi) *
          (point[1]-yi) /
          (yj-yi) +
          xi
        )
      )

    if(intersects){
      inside=!inside
    }
  }

  return inside
}


function pointSegmentDistanceMeters(
  point,
  a,
  b
){
  const av=
    localVectorMeters(
      point,
      a
    )

  const bv=
    localVectorMeters(
      point,
      b
    )

  const dx=bv.east-av.east
  const dy=bv.north-av.north

  const denom=
    dx*dx+
    dy*dy

  const t=
    denom>0
      ? Math.max(
          0,
          Math.min(
            1,
            -(
              av.east*dx+
              av.north*dy
            )/
            denom
          )
        )
      : 0

  return Math.hypot(
    av.east+dx*t,
    av.north+dy*t
  )
}


function distanceToGeometryMeters(
  point,
  geometry
){
  if(
    !point ||
    !geometry
  ){
    return null
  }

  const polygons=
    geometry.type==='Polygon'
      ? [geometry.coordinates]
      : geometry.type==='MultiPolygon'
        ? geometry.coordinates
        : []

  let best=Infinity

  for(const polygon of polygons){
    const outer=
      polygon?.[0] || []

    if(
      outer.length>=3 &&
      pointInRing(
        point,
        outer
      )
    ){
      return 0
    }

    for(const ring of polygon || []){
      for(
        let i=1;
        i<ring.length;
        i++
      ){
        best=
          Math.min(
            best,
            pointSegmentDistanceMeters(
              point,
              ring[i-1],
              ring[i]
            )
          )
      }
    }
  }

  return Number.isFinite(best)
    ? best
    : null
}


function vesselVelocity(
  vessel
){
  const sog=
    Number(vessel?.sog)

  const cog=
    Number(vessel?.cog)

  if(
    !Number.isFinite(sog) ||
    sog<0 ||
    !Number.isFinite(cog)
  ){
    return null
  }

  /*
   * Signal K:
   *
   * speedOverGround      = m/s
   * courseOverGroundTrue = radians true
   */
  return {
    east:
      sog*Math.sin(cog),

    north:
      sog*Math.cos(cog),

    speed:sog,
    course:cog
  }
}


function stormVelocityFromForecast(
  hazard
){
  const current=
    centroidGeometry(
      hazard?.geometry
    )

  if(!current){
    return null
  }

  const forecast=
    (hazard?.forecast || [])
      .filter(item=>
        item?.supported===true &&
        item.geometry &&
        Number.isFinite(
          Number(item.horizonMinutes)
        ) &&
        Number(item.horizonMinutes)>0
      )
      .sort(
        (a,b)=>
          Number(a.horizonMinutes)-
          Number(b.horizonMinutes)
      )[0]

  if(!forecast){
    return null
  }

  const future=
    centroidGeometry(
      forecast.geometry
    )

  if(!future){
    return null
  }

  const dt=
    Number(
      forecast.horizonMinutes
    )*60

  const displacement=
    localVectorMeters(
      current,
      future
    )

  const east=
    displacement.east/dt

  const north=
    displacement.north/dt

  return {
    east,
    north,

    speed:
      Math.hypot(
        east,
        north
      ),

    horizonMinutes:
      Number(
        forecast.horizonMinutes
      ),

    confidence:
      clamp01(
        forecast
          ?.support
          ?.fraction ?? 1
      ),

    method:
      'v3-forecast-centroid'
  }
}


function cpa(
  vesselPosition,
  stormPosition,
  stormVelocity,
  ownshipVelocity,
  horizonSec
){
  const relativePosition=
    localVectorMeters(
      vesselPosition,
      stormPosition
    )

  const east=
    stormVelocity.east-
    ownshipVelocity.east

  const north=
    stormVelocity.north-
    ownshipVelocity.north

  const speed2=
    east*east+
    north*north

  let tcpaSec=
    speed2>1e-6
      ? -(
          relativePosition.east*east+
          relativePosition.north*north
        )/
        speed2
      : 0

  tcpaSec=
    Math.max(
      0,
      Math.min(
        horizonSec,
        tcpaSec
      )
    )

  const closestEast=
    relativePosition.east+
    east*tcpaSec

  const closestNorth=
    relativePosition.north+
    north*tcpaSec

  return {
    tcpaSec,

    dcpaMeters:
      Math.hypot(
        closestEast,
        closestNorth
      ),

    closing:
      (
        relativePosition.east*east+
        relativePosition.north*north
      )<0
  }
}


function pathPolygonThreat(
  vesselPosition,
  ownshipVelocity,
  geometry,
  stormVelocity,
  horizonSec,
  {
    stepSec=60
  }={}
){
  let best=Infinity
  let bestT=0
  let intercept=null

  const sample=
    time=>{
      const vesselPoint=
        localPoint(
          vesselPosition,
          ownshipVelocity.east*time,
          ownshipVelocity.north*time
        )

      const stormGeometry=
        translateGeometryLocal(
          geometry,
          stormVelocity.east,
          stormVelocity.north,
          time
        )

      const distance=
        distanceToGeometryMeters(
          vesselPoint,
          stormGeometry
        )

      if(
        Number.isFinite(distance) &&
        distance<best
      ){
        best=distance
        bestT=time
      }

      if(
        intercept===null &&
        distance===0
      ){
        intercept=time
      }
    }

  const increment=
    Math.max(
      1,
      Number(stepSec)||60
    )

  for(
    let time=0;
    time<=horizonSec;
    time+=increment
  ){
    sample(time)
  }

  if(
    horizonSec%increment!==0
  ){
    sample(horizonSec)
  }

  return {
    intersects:
      intercept!==null,

    interceptSec:
      intercept,

    minDistanceMeters:
      Number.isFinite(best)
        ? best
        : null,

    minDistanceSec:
      Number.isFinite(best)
        ? bestT
        : null,

    stepSec:
      increment
  }
}


function severityLevel(
  hazard
){
  const raw=
    (
      hazard?.severity &&
      typeof hazard.severity==='object'
    )
      ? hazard.severity.level
      : hazard?.severity

  const level=
    Number(raw)

  return Number.isFinite(level)
    ? level
    : null
}


function threatState(
  severity,
  distance,
  config
){
  if(
    !Number.isFinite(distance) ||
    distance>config.warnDistanceM
  ){
    return 'normal'
  }

  const severe=
    severity===null ||
    severity>=config.warnSeverity

  if(!severe){
    return 'normal'
  }

  if(
    distance<=config.alarmDistanceM ||
    (
      severity!==null &&
      severity>=config.alarmSeverity &&
      distance<=config.warnDistanceM
    )
  ){
    return 'alarm'
  }

  return 'warn'
}


function assessStormThreat({
  hazard,
  vessel,
  config={}
}={}){
  const geometry=
    hazard?.geometry

  const position=
    vessel?.position

  const validPosition=
    position &&
    Number.isFinite(
      Number(position.longitude)
    ) &&
    Number.isFinite(
      Number(position.latitude)
    )

  if(
    !geometry ||
    !validPosition
  ){
    return {
      ...hazard,

      distanceMeters:null,
      cpa:null,
      pathThreat:null,

      threat:{
        state:'normal',
        confidence:0,
        method:METHOD,
        predictive:false,
        authoritative:false,
        reason:'vessel-position-unavailable',
        intersects:false,
        interceptSec:null,
        minDistanceMeters:null,
        minDistanceSec:null
      },

      state:'normal'
    }
  }

  const vesselPosition=[
    Number(position.longitude),
    Number(position.latitude)
  ]

  const distanceMeters=
    distanceToGeometryMeters(
      vesselPosition,
      geometry
    )

  const ownshipVelocity=
    vesselVelocity(
      vessel
    )

  const stormVelocity=
    stormVelocityFromForecast(
      hazard
    )

  const predictive=
    !!(
      ownshipVelocity &&
      stormVelocity
    )

  const horizonSec=
    Math.max(
      0,
      Number(
        config.horizonMinutes ?? 60
      )*60
    )

  const stormCentroid=
    centroidGeometry(
      geometry
    )

  const approach=
    (
      predictive &&
      stormCentroid
    )
      ? cpa(
          vesselPosition,
          stormCentroid,
          stormVelocity,
          ownshipVelocity,
          horizonSec
        )
      : null

  const pathThreat=
    predictive
      ? pathPolygonThreat(
          vesselPosition,
          ownshipVelocity,
          geometry,
          stormVelocity,
          horizonSec,
          {
            stepSec:
              config.pathStepSec ?? 60
          }
        )
      : null

  let relevantDistance=
    distanceMeters

  if(
    approach?.closing &&
    Number.isFinite(
      approach.dcpaMeters
    )
  ){
    relevantDistance=
      Math.min(
        relevantDistance,
        approach.dcpaMeters
      )
  }

  if(
    Number.isFinite(
      pathThreat
        ?.minDistanceMeters
    )
  ){
    relevantDistance=
      Math.min(
        relevantDistance,
        pathThreat.minDistanceMeters
      )
  }

  const state=
    threatState(
      severityLevel(hazard),
      relevantDistance,
      {
        warnDistanceM:
          Number(
            config.warnDistanceM
          ),

        alarmDistanceM:
          Number(
            config.alarmDistanceM
          ),

        warnSeverity:
          Number(
            config.warnSeverity
          ),

        alarmSeverity:
          Number(
            config.alarmSeverity
          )
      }
    )

  const confidence=
    predictive
      ? stormVelocity.confidence
      : 0

  return {
    ...hazard,

    distanceMeters,
    cpa:approach,
    pathThreat,

    threat:{
      state,
      confidence,
      method:METHOD,

      predictive,
      authoritative:
        predictive,

      reason:
        predictive
          ? null
          : (
              !stormVelocity
                ? 'storm-motion-unavailable'
                : 'vessel-motion-unavailable'
            ),

      intersects:
        pathThreat
          ?.intersects === true,

      interceptSec:
        pathThreat
          ?.interceptSec ?? null,

      minDistanceMeters:
        pathThreat
          ?.minDistanceMeters ?? null,

      minDistanceSec:
        pathThreat
          ?.minDistanceSec ?? null
    },

    state
  }
}


module.exports={
  METHOD,
  assessStormThreat,
  cpa,
  distanceToGeometryMeters,
  pathPolygonThreat,
  stormVelocityFromForecast,
  vesselVelocity
}
