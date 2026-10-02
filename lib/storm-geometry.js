'use strict'

const polygonClipping=require('polygon-clipping')

const {
  localVectorMeters,
  localPoint,
  normalizeLongitude,
  unwrapLongitude
}=require('./storm-motion')


function centroidGeometry(g){
  if(!g)return null

  const polygons=
    g.type==='Polygon'
      ? [g.coordinates]
      : g.type==='MultiPolygon'
        ? g.coordinates
        : null

  if(!polygons?.length)return null

  const first=
    g.coordinates
      ?.flat(3)
      .find(Number.isFinite)

  const reference=
    Number.isFinite(first)
      ? first
      : 0

  let weightedX=0
  let weightedY=0
  let totalWeight=0

  const fallback=[]

  for(const polygon of polygons){
    for(const [ringIndex,ring] of (polygon||[]).entries()){
      if(!Array.isArray(ring))continue

      const localRing=
        ring.map(p=>[
          unwrapLongitude(p[0],reference),
          p[1]
        ])

      for(let i=0;i<localRing.length;i++){
        if(
          Array.isArray(localRing[i]) &&
          localRing[i].length>=2 &&
          (
            i===0 ||
            localRing[i][0]!==localRing[i-1][0] ||
            localRing[i][1]!==localRing[i-1][1]
          )
        ){
          fallback.push(localRing[i])
        }
      }

      let twiceArea=0
      let cx=0
      let cy=0

      for(let i=0;i<localRing.length;i++){
        const a=localRing[i]
        const b=localRing[(i+1)%localRing.length]

        if(!a || !b)continue

        const cross=
          a[0]*b[1] -
          b[0]*a[1]

        twiceArea+=cross
        cx+=(a[0]+b[0])*cross
        cy+=(a[1]+b[1])*cross
      }

      if(Math.abs(twiceArea)>1e-12){
        const weight=
          (ringIndex===0 ? 1 : -1) *
          Math.abs(twiceArea)/2

        weightedX+=
          (cx/(3*twiceArea))*weight

        weightedY+=
          (cy/(3*twiceArea))*weight

        totalWeight+=weight
      }
    }
  }

  if(Math.abs(totalWeight)>1e-12){
    return [
      normalizeLongitude(
        weightedX/totalWeight
      ),
      weightedY/totalWeight
    ]
  }

  if(!fallback.length)return null

  const unique=
    fallback.filter(
      (p,i)=>
        i===0 ||
        p[0]!==fallback[0][0] ||
        p[1]!==fallback[0][1] ||
        i<fallback.length-1
    )

  return [
    normalizeLongitude(
      unique.reduce(
        (sum,p)=>sum+p[0],
        0
      )/unique.length
    ),

    unique.reduce(
      (sum,p)=>sum+p[1],
      0
    )/unique.length
  ]
}


function translateGeometryLocal(
  geometry,
  east,
  north,
  seconds
){
  if(
    !geometry ||
    !['Polygon','MultiPolygon'].includes(
      geometry.type
    )
  ){
    return null
  }

  const base=
    centroidGeometry(geometry)

  if(!base)return geometry

  const movePoint=point=>{
    const vector=
      localVectorMeters(
        base,
        point
      )

    return localPoint(
      base,
      vector.east +
        east*seconds,
      vector.north +
        north*seconds
    )
  }

  const ring=
    value=>value.map(movePoint)

  return geometry.type==='Polygon'
    ? {
        type:'Polygon',
        coordinates:
          geometry.coordinates.map(ring)
      }
    : {
        type:'MultiPolygon',
        coordinates:
          geometry.coordinates.map(
            polygon=>
              polygon.map(ring)
          )
      }
}


function geometryForClipping(
  geometry,
  referenceLongitude
){
  if(
    !geometry ||
    !['Polygon','MultiPolygon'].includes(
      geometry.type
    )
  ){
    return null
  }

  const polygons=
    geometry.type==='Polygon'
      ? [geometry.coordinates]
      : geometry.coordinates

  return polygons.map(
    polygon=>
      polygon.map(
        ring=>
          ring.map(point=>[
            unwrapLongitude(
              Number(point[0]),
              referenceLongitude
            ),
            Number(point[1])
          ])
      )
  )
}


function ringArea(ring){
  let area=0

  for(let i=0;i<ring.length;i++){
    const a=ring[i]
    const b=ring[(i+1)%ring.length]

    if(!a || !b)continue

    area+=
      a[0]*b[1] -
      b[0]*a[1]
  }

  return Math.abs(area)/2
}


function multiPolygonArea(multiPolygon){
  let total=0

  for(const polygon of multiPolygon||[]){
    if(!polygon?.length)continue

    total+=ringArea(
      polygon[0]||[]
    )

    for(let i=1;i<polygon.length;i++){
      total-=ringArea(
        polygon[i]||[]
      )
    }
  }

  return Math.max(0,total)
}


function polygonIoU(a,b){
  const centroid=
    centroidGeometry(a)

  if(!centroid)return 0

  const aa=
    geometryForClipping(
      a,
      centroid[0]
    )

  const bb=
    geometryForClipping(
      b,
      centroid[0]
    )

  if(!aa || !bb)return 0

  try {
    const intersection=
      polygonClipping.intersection(
        aa,
        bb
      )

    const union=
      polygonClipping.union(
        aa,
        bb
      )

    const intersectionArea=
      multiPolygonArea(
        intersection
      )

    const unionArea=
      multiPolygonArea(
        union
      )

    return unionArea>0
      ? Math.max(
          0,
          Math.min(
            1,
            intersectionArea/unionArea
          )
        )
      : 0
  }catch{
    return 0
  }
}



function pointInRing(point,ring){
  const px=Number(point[0])

  const localRing=
    ring.map(p=>[
      unwrapLongitude(p[0],px),
      p[1]
    ])

  let inside=false

  for(
    let i=0,j=localRing.length-1;
    i<localRing.length;
    j=i++
  ){
    const xi=localRing[i][0]
    const yi=localRing[i][1]
    const xj=localRing[j][0]
    const yj=localRing[j][1]

    const hit=
      ((yi>point[1])!==(yj>point[1])) &&
      (
        px<
        (xj-xi)*
        (point[1]-yi)/
        ((yj-yi)||1e-15)+
        xi
      )

    if(hit)inside=!inside
  }

  return inside
}


function pointSegmentDistanceMeters(origin,a,b){
  const A=localVectorMeters(origin,a)
  const B=localVectorMeters(origin,b)

  const dx=B.east-A.east
  const dy=B.north-A.north
  const den=dx*dx+dy*dy

  const t=
    den>0
      ? Math.max(
          0,
          Math.min(
            1,
            -(
              A.east*dx+
              A.north*dy
            )/den
          )
        )
      : 0

  return Math.hypot(
    A.east+t*dx,
    A.north+t*dy
  )
}


function distanceToGeometryMeters(point,geometry){
  if(!geometry)return null

  const polygons=
    geometry.type==='Polygon'
      ? [geometry.coordinates]
      : geometry.type==='MultiPolygon'
        ? geometry.coordinates
        : []

  let best=Infinity

  for(const poly of polygons){
    const outer=poly?.[0]||[]

    if(
      outer.length>=3 &&
      pointInRing(point,outer)
    ){
      return 0
    }

    for(const ring of poly||[]){
      for(let i=1;i<ring.length;i++){
        best=Math.min(
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

module.exports={
  centroidGeometry,
  polygonIoU,
  translateGeometryLocal,
  distanceToGeometryMeters
}
