'use strict'

const R = 6371008.8
const rad = d => d * Math.PI / 180
const deg = r => r * 180 / Math.PI

const normalizeLongitude=lon=>{
  let value=((Number(lon)+180)%360+360)%360-180
  return Object.is(value,-0)?0:value
}

const unwrapLongitude=(lon,reference)=>{
  let value=Number(lon)
  while(value-reference>=180)value-=360
  while(value-reference< -180)value+=360
  return value
}

function haversine(a,b) {
  const p1=rad(a[1]), p2=rad(b[1])
  const dp=p2-p1
  const dl=rad(b[0]-a[0])

  const h=
    Math.sin(dp/2)**2 +
    Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2

  return 2*R*Math.asin(
    Math.min(1,Math.sqrt(h))
  )
}

function bearing(a,b) {
  const p1=rad(a[1])
  const p2=rad(b[1])
  const dl=rad(b[0]-a[0])

  const y=Math.sin(dl)*Math.cos(p2)

  const x=
    Math.cos(p1)*Math.sin(p2) -
    Math.sin(p1)*Math.cos(p2)*Math.cos(dl)

  return (deg(Math.atan2(y,x))+360)%360
}

function velocityBetween(a,b,dtSec) {
  if(!a || !b || !dtSec){
    return {
      east:0,
      north:0,
      speed:0,
      course:null
    }
  }

  const d=haversine(a,b)
  const br=rad(bearing(a,b))
  const speed=d/dtSec

  return {
    east:speed*Math.sin(br),
    north:speed*Math.cos(br),
    speed,
    course:(deg(br)+360)%360
  }
}

function localVectorMeters(origin,target) {
  const north=
    rad(target[1]-origin[1])*R

  const east=
    rad(
      unwrapLongitude(
        target[0],
        origin[0]
      )-origin[0]
    ) *
    R *
    Math.cos(
      rad((origin[1]+target[1])/2)
    )

  return {east,north}
}

function localPoint(origin,east,north) {
  const lat=origin[1]+deg(north/R)

  const cos=Math.max(
    .05,
    Math.cos(
      rad((origin[1]+lat)/2)
    )
  )

  let lon=
    origin[0]+deg(east/(R*cos))

  while(lon>180)lon-=360
  while(lon<-180)lon+=360

  return [lon,lat]
}

function median(xs){
  const a=xs
    .filter(Number.isFinite)
    .sort((a,b)=>a-b)

  if(!a.length)return 0

  const m=Math.floor(a.length/2)

  return a.length%2
    ? a[m]
    : (a[m-1]+a[m])/2
}

function robustTrackVelocity(history) {
  if(!history || history.length<2){
    return {
      east:0,
      north:0,
      speed:0,
      course:null,
      samples:history?.length||0,
      confidence:0,
      residualMeters:null,
      method:'track-robust'
    }
  }

  const steps=[]

  for(let i=1;i<history.length;i++){
    const dt=
      (
        history[i].epochMs -
        history[i-1].epochMs
      )/1000

    if(dt>0){
      const v=velocityBetween(
        history[i-1].centroid,
        history[i].centroid,
        dt
      )

      steps.push({...v,dt})
    }
  }

  if(!steps.length){
    return {
      east:0,
      north:0,
      speed:0,
      course:null,
      samples:history.length,
      confidence:0,
      residualMeters:null,
      method:'track-robust'
    }
  }

  const east=
    median(steps.map(s=>s.east))

  const north=
    median(steps.map(s=>s.north))

  const speed=
    Math.hypot(east,north)

  const course=
    speed>1e-6
      ? (
          deg(Math.atan2(east,north))+360
        )%360
      : null

  const residuals=steps.map(
    s=>
      Math.hypot(
        s.east-east,
        s.north-north
      )*s.dt
  )

  const residualMeters=
    median(residuals)

  const sampleScore=
    Math.min(
      1,
      (history.length-1)/4
    )

  const residualScore=
    Math.max(
      0,
      1-Math.min(
        1,
        residualMeters/15000
      )
    )

  const confidence=
    Math.max(
      0,
      Math.min(
        1,
        .15 +
        .55*sampleScore +
        .30*residualScore
      )
    )

  return {
    east,
    north,
    speed,
    course,
    samples:history.length,
    confidence,
    residualMeters,
    method:'track-robust'
  }
}

module.exports={
  haversine,
  bearing,
  velocityBetween,
  localVectorMeters,
  localPoint,
  robustTrackVelocity,
  normalizeLongitude,
  unwrapLongitude
}
