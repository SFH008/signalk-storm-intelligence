'use strict'

const polygonClipping=require('polygon-clipping')

const EARTH_RADIUS_M=6371008.8
const DEG=Math.PI/180

function pixelBounds(field,x,y) {
  const [west,south,east,north]=field.bounds
  const dx=(east-west)/field.width
  const dy=(north-south)/field.height

  return {
    west:west+x*dx,
    east:west+(x+1)*dx,
    north:north-y*dy,
    south:north-(y+1)*dy
  }
}

function pixelAreaKm2(field,x,y) {
  const b=pixelBounds(field,x,y)

  const area=
    EARTH_RADIUS_M*EARTH_RADIUS_M *
    Math.abs((b.east-b.west)*DEG) *
    Math.abs(
      Math.sin(b.north*DEG)-
      Math.sin(b.south*DEG)
    )

  return area/1e6
}

function rectanglePolygon(b) {
  return [[
    [b.west,b.north],
    [b.east,b.north],
    [b.east,b.south],
    [b.west,b.south],
    [b.west,b.north]
  ]]
}

function componentRuns(component,width) {
  const rows=new Map()

  for(const index of component) {
    const y=Math.floor(index/width)
    const x=index-y*width

    if(!rows.has(y))rows.set(y,[])
    rows.get(y).push(x)
  }

  const runs=[]

  for(const y of [...rows.keys()].sort((a,b)=>a-b)) {
    const xs=rows.get(y).sort((a,b)=>a-b)

    let start=xs[0]
    let end=xs[0]

    for(let i=1;i<xs.length;i++) {
      if(xs[i]===end+1) {
        end=xs[i]
      } else {
        runs.push({y,start,end})
        start=end=xs[i]
      }
    }

    runs.push({y,start,end})
  }

  return runs
}

function runPolygon(field,run) {
  const first=pixelBounds(field,run.start,run.y)
  const last=pixelBounds(field,run.end,run.y)

  return rectanglePolygon({
    west:first.west,
    east:last.east,
    north:first.north,
    south:first.south
  })
}

function componentGeometry(field,component) {
  const runs=componentRuns(component,field.width)
  const polygons=runs.map(run=>runPolygon(field,run))

  if(!polygons.length)return null

  const union=polygonClipping.union(...polygons)

  if(!union?.length)return null

  if(union.length===1) {
    return {
      type:'Polygon',
      coordinates:union[0]
    }
  }

  return {
    type:'MultiPolygon',
    coordinates:union
  }
}

function componentBounds(field,component) {
  let west=Infinity
  let south=Infinity
  let east=-Infinity
  let north=-Infinity

  for(const index of component) {
    const y=Math.floor(index/field.width)
    const x=index-y*field.width
    const b=pixelBounds(field,x,y)

    west=Math.min(west,b.west)
    south=Math.min(south,b.south)
    east=Math.max(east,b.east)
    north=Math.max(north,b.north)
  }

  return [west,south,east,north]
}

function connectedComponents(field,qualifies) {
  const width=field.width
  const height=field.height
  const size=width*height
  const visited=new Uint8Array(size)
  const components=[]

  const neighbours=[
    [-1,-1],[0,-1],[1,-1],
    [-1, 0],       [1, 0],
    [-1, 1],[0, 1],[1, 1]
  ]

  for(let start=0;start<size;start++) {
    if(visited[start] || !qualifies(start))continue

    const queue=[start]
    let head=0
    visited[start]=1

    const component=[]

    while(head<queue.length) {
      const index=queue[head++]
      component.push(index)

      const y=Math.floor(index/width)
      const x=index-y*width

      for(const [dx,dy] of neighbours) {
        const nx=x+dx
        const ny=y+dy

        if(nx<0 || nx>=width || ny<0 || ny>=height)continue

        const ni=ny*width+nx

        if(visited[ni] || !qualifies(ni))continue

        visited[ni]=1
        queue.push(ni)
      }
    }

    components.push(component)
  }

  return components
}

function detectStormCandidates(field,options={}) {
  if(field?.schema!=='storm-normalized-evidence/1') {
    throw new TypeError('Normalized storm evidence v1 is required')
  }

  if(field.quantity!=='reflectivity') {
    throw new TypeError('Reflectivity evidence is required')
  }

  const minReflectivityDbz=Number(options.minReflectivityDbz ?? 24)
  const minAreaKm2=Number(options.minAreaKm2 ?? 0)
  const maxAreaKm2=Number(options.maxAreaKm2 ?? Infinity)

  const values=field.reflectivityLowerBoundDbz

  const components=connectedComponents(
    field,
    index=>
      Number.isFinite(values[index]) &&
      values[index]>=minReflectivityDbz
  )

  const rows=[]

  for(const component of components) {
    let areaKm2=0
    let maxReflectivityLowerBoundDbz=-Infinity

    for(const index of component) {
      const y=Math.floor(index/field.width)
      const x=index-y*field.width

      areaKm2+=pixelAreaKm2(field,x,y)
      maxReflectivityLowerBoundDbz=Math.max(
        maxReflectivityLowerBoundDbz,
        values[index]
      )
    }

    if(areaKm2<minAreaKm2 || areaKm2>maxAreaKm2)continue

    const bbox=componentBounds(field,component)
    const geometry=componentGeometry(field,component)

    if(!geometry)continue

    rows.push({
      component,
      areaKm2,
      bbox,
      geometry,
      maxReflectivityLowerBoundDbz
    })
  }

  rows.sort((a,b)=>
    a.bbox[0]-b.bbox[0] ||
    a.bbox[1]-b.bbox[1] ||
    b.areaKm2-a.areaKm2
  )

  return rows.map((row,index)=>{
    const ordinal=index+1
    const sourceId=`${field.observedAt}:${ordinal}`

    return {
      type:'Feature',
      id:sourceId,
      geometry:row.geometry,
      properties:{
        sourceId,
        observedAt:field.observedAt,
        detection:{
          method:'reflectivity-threshold-development-v1',
          qualification:{
            quantity:'reflectivity',
            operator:'>=',
            thresholdDbz:minReflectivityDbz
          },
          pixelCount:row.component.length,
          areaKm2:row.areaKm2,
          bbox:row.bbox,
          maxReflectivityLowerBoundDbz:
            row.maxReflectivityLowerBoundDbz
        },
        evidence:{
          reflectivity:{
            available:true,
            units:'dBZ',
            maxLowerBoundDbz:row.maxReflectivityLowerBoundDbz,
            provenance:field.provenance
          }
        }
      }
    }
  })
}

module.exports={
  connectedComponents,
  detectStormCandidates,
  pixelAreaKm2
}
