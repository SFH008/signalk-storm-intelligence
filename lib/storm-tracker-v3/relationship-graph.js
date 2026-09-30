'use strict'

const polygonClipping=
  require('polygon-clipping')


function geometryBounds(geometry){
  if(
    !geometry ||
    ![
      'Polygon',
      'MultiPolygon'
    ].includes(geometry.type)
  ){
    throw new TypeError(
      'Polygon or MultiPolygon geometry is required'
    )
  }

  let west=Infinity
  let south=Infinity
  let east=-Infinity
  let north=-Infinity

  function visitRing(ring){
    for(const coordinate of ring){
      const [x,y]=coordinate

      if(
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ){
        throw new TypeError(
          'finite geometry coordinates are required'
        )
      }

      west=Math.min(west,x)
      south=Math.min(south,y)
      east=Math.max(east,x)
      north=Math.max(north,y)
    }
  }

  if(geometry.type==='Polygon'){
    for(const ring of geometry.coordinates){
      visitRing(ring)
    }
  } else {
    for(const polygon of geometry.coordinates){
      for(const ring of polygon){
        visitRing(ring)
      }
    }
  }

  return {
    west,
    south,
    east,
    north
  }
}


function boundsOverlap(a,b){
  return !(
    a.east<b.west ||
    b.east<a.west ||
    a.north<b.south ||
    b.north<a.south
  )
}


function asMultiPolygonCoordinates(
  geometry
){
  if(geometry.type==='Polygon'){
    return [
      geometry.coordinates
    ]
  }

  if(geometry.type==='MultiPolygon'){
    return geometry.coordinates
  }

  throw new TypeError(
    'Polygon or MultiPolygon geometry is required'
  )
}


function ringArea(
  ring
){
  let sum=0

  for(let i=0;i<ring.length-1;i++){
    const [x1,y1]=ring[i]
    const [x2,y2]=ring[i+1]

    sum+=
      x1*y2-
      x2*y1
  }

  return Math.abs(sum)/2
}


function polygonArea(
  polygon
){
  if(!polygon.length){
    return 0
  }

  let area=
    ringArea(
      polygon[0]
    )

  for(let i=1;i<polygon.length;i++){
    area-=
      ringArea(
        polygon[i]
      )
  }

  return Math.max(
    0,
    area
  )
}


function multiPolygonArea(
  multiPolygon
){
  return multiPolygon.reduce(
    (sum,polygon)=>
      sum+
      polygonArea(polygon),
    0
  )
}


function geometryArea(
  geometry
){
  /*
   * polygon-clipping normalizes non-simple geometry
   * while performing boolean operations.
   *
   * Source areas used for relationship evidence must
   * use the same interpreted topology as intersection
   * areas. Otherwise an advected self-crossing boundary
   * can yield impossible overlap fractions greater than 1.
   */
  const normalized=
    polygonClipping.union(
      asMultiPolygonCoordinates(
        geometry
      )
    )

  return multiPolygonArea(
    normalized ?? []
  )
}


function geometryOverlapEvidence(
  a,
  b
){
  const intersection=
    polygonClipping.intersection(
      asMultiPolygonCoordinates(a),
      asMultiPolygonCoordinates(b)
    )

  if(
    !intersection ||
    !intersection.length
  ){
    return null
  }

  const previousArea=
    geometryArea(a)

  const currentArea=
    geometryArea(b)

  const intersectionArea=
    multiPolygonArea(
      intersection
    )

  if(
    !(previousArea>0) ||
    !(currentArea>0) ||
    !(intersectionArea>0)
  ){
    return null
  }

  const unionArea=
    previousArea+
    currentArea-
    intersectionArea

  return {
    previousFraction:
      intersectionArea/
      previousArea,

    currentFraction:
      intersectionArea/
      currentArea,

    iou:
      unionArea>0
        ? intersectionArea/
          unionArea
        : 0
  }
}


function geometriesOverlap(
  a,
  b
){
  const intersection=
    polygonClipping.intersection(
      asMultiPolygonCoordinates(a),
      asMultiPolygonCoordinates(b)
    )

  return Boolean(
    intersection &&
    intersection.length
  )
}


function featureId(feature){
  return (
    feature?.properties?.sourceId ??
    feature?.id ??
    null
  )
}


function grosslyImplausibleScaleRelationship(
  overlap,
  scaleRatio
){
  if(
    !Number.isFinite(overlap?.iou) ||
    !Number.isFinite(scaleRatio) ||
    !(scaleRatio>0)
  ){
    return false
  }

  /*
   * V3.6 operational sanity guard.
   *
   * Reject only when both:
   *   - predicted/current spatial agreement is negligible
   *   - object scale changes catastrophically
   *
   * Either condition alone remains allowed.
   */
  const negligibleOverlap=
    overlap.iou<0.05

  const catastrophicScaleChange=
    (
      scaleRatio>8 ||
      scaleRatio<1/8
    )

  return (
    negligibleOverlap &&
    catastrophicScaleChange
  )
}


function buildRelationshipGraph(
  predicted,
  current
){
  if(!Array.isArray(predicted)){
    throw new TypeError(
      'predicted regions are required'
    )
  }

  if(!Array.isArray(current)){
    throw new TypeError(
      'current regions are required'
    )
  }

  const predictedRows=
    predicted.map(feature=>({
      feature,
      id:featureId(feature),
      bounds:
        geometryBounds(
          feature.geometry
        )
    }))

  const currentRows=
    current.map(feature=>({
      feature,
      id:featureId(feature),
      bounds:
        geometryBounds(
          feature.geometry
        )
    }))

  const edges=[]

  /*
   * Sparse physical-admissibility graph.
   *
   * At this stage an edge means only:
   *
   *   "the current region spatially overlaps the
   *    already-advected previous region"
   *
   * It does NOT mean continuation, identity,
   * split, merge, or best match.
   */
  for(const previous of predictedRows){
    for(const next of currentRows){
      /*
       * Cheap rejection first.
       */
      if(
        !boundsOverlap(
          previous.bounds,
          next.bounds
        )
      ){
        continue
      }

      /*
       * Bounding-box overlap is not enough.
       * Admit a relationship only when the
       * actual advected/current geometries overlap.
       */
      const overlap=
        geometryOverlapEvidence(
          previous.feature.geometry,
          next.feature.geometry
        )

      if(!overlap){
        continue
      }

      const previousArea=
        geometryArea(
          previous.feature.geometry
        )

      const currentArea=
        geometryArea(
          next.feature.geometry
        )

      const scaleRatio=
        previousArea>0
          ? currentArea/
            previousArea
          : null

      if(
        grosslyImplausibleScaleRelationship(
          overlap,
          scaleRatio
        )
      ){
        continue
      }

      edges.push({
        from:previous.id,
        to:next.id,

        overlap,

        size:{
          previousArea,
          currentArea,
          ratio:scaleRatio
        }
      })
    }
  }

  return {
    edges
  }
}


module.exports={
  buildRelationshipGraph,
  geometryBounds
}
