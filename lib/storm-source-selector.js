'use strict'

const {
  destination
}=require('./weather-api-fusion')


function projectVesselPosition({
  position=null,
  sog=null,
  cog=null,
  horizonMinutes=60
}={}){
  if(
    !position ||
    sog==null ||
    cog==null ||
    horizonMinutes==null
  ){
    return null
  }

  const speed=Number(sog)
  const course=Number(cog)
  const horizon=Number(horizonMinutes)

  if(
    !Number.isFinite(Number(position.longitude)) ||
    !Number.isFinite(Number(position.latitude)) ||
    !Number.isFinite(speed) ||
    !Number.isFinite(course) ||
    !Number.isFinite(horizon) ||
    speed<0 ||
    horizon<0
  ){
    return null
  }

  const distanceM=
    speed*horizon*60

  const bearingDeg=
    course*180/Math.PI

  return destination(
    position,
    bearingDeg,
    distanceM
  )
}


function pointInsideBounds(
  position,
  bounds
){
  if(
    !position ||
    !Array.isArray(bounds) ||
    bounds.length!==4
  ){
    return false
  }

  const longitude=
    Number(position.longitude)

  const latitude=
    Number(position.latitude)

  if(
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude)
  ){
    return false
  }

  const [
    west,
    south,
    east,
    north
  ]=bounds.map(Number)

  return (
    longitude>=west &&
    longitude<=east &&
    latitude>=south &&
    latitude<=north
  )
}


function selectStormSource({
  sources=[],
  activeSource=null,
  position=null,
  projectedPosition=null
}={}){
  const usable=
    sources.filter(
      source=>
        source &&
        typeof source.source==='string' &&
        Array.isArray(source.bounds)
    )

  const active=
    usable.find(
      source=>
        source.source===activeSource
    )

  if(
    active &&
    pointInsideBounds(position,active.bounds) &&
    pointInsideBounds(projectedPosition,active.bounds)
  ){
    return {
      source:active.source,
      reason:'active-source-covers-route'
    }
  }


  const coveringRoute=
    usable.find(
      source=>
        pointInsideBounds(position,source.bounds) &&
        pointInsideBounds(
          projectedPosition,
          source.bounds
        )
    )

  if(coveringRoute){
    return {
      source:coveringRoute.source,
      reason:
        activeSource
          ? 'projected-route-coverage'
          : 'route-coverage'
    }
  }


  const coveringVessel=
    usable.find(
      source=>
        pointInsideBounds(position,source.bounds)
    )

  if(coveringVessel){
    return {
      source:coveringVessel.source,
      reason:'vessel-coverage'
    }
  }


  return {
    source:null,
    reason:'no-radar-coverage'
  }
}


module.exports={
  pointInsideBounds,
  projectVesselPosition,
  selectStormSource
}
