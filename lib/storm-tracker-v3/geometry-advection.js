'use strict'

const {
  sampleMotionField
}=require('./motion-interpolation')

function finite(v){
  return Number.isFinite(v)
}

function sampleMotionNearest(
  motion,
  x,
  y
){
  const ix=Math.round(x)
  const iy=Math.round(y)

  if(
    ix<0 || ix>=motion.width ||
    iy<0 || iy>=motion.height
  ){
    return null
  }

  const index=iy*motion.width+ix

  if(!(motion.support?.[index]>0)){
    return null
  }

  const dx=motion.eastPixels?.[index]
  const dy=motion.northPixels?.[index]

  if(
    !finite(dx) ||
    !finite(dy)
  ){
    return null
  }

  const uncertainty=
    finite(motion.uncertaintyPixels?.[index])
      ? motion.uncertaintyPixels[index]
      : null

  return {
    dx,
    dy,
    uncertainty
  }
}

function sampleMotion(
  motion,
  x,
  y,
  options={}
){
  if(options.sampleMode==='interpolated'){
    const sampled=
      sampleMotionField(
        motion,
        x,
        y,
        options.interpolation ?? {}
      )

    if(!sampled.supported){
      return null
    }

    return {
      dx:sampled.dx,
      dy:sampled.dy,
      uncertainty:
        sampled.uncertaintyPixels
    }
  }

  return sampleMotionNearest(
    motion,
    x,
    y
  )
}

const MIN_SHORT_GAP_SUPPORT_FRACTION=0.95
const MAX_SHORT_GAP_VERTICES=2


function coordinatesEqual(
  a,
  b
){
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length>=2 &&
    b.length>=2 &&
    a[0]===b[0] &&
    a[1]===b[1]
  )
}


function finiteMax(
  ...values
){
  const finiteValues=
    values.filter(finite)

  return finiteValues.length
    ? Math.max(...finiteValues)
    : null
}


function advectRing(
  ring,
  motion,
  options={}
){
  const totalVertices=
    ring.length

  const samples=
    ring.map(
      coordinate=>{
        const [x,y]=coordinate

        return sampleMotion(
          motion,
          x,
          y,
          options
        )
      }
    )

  const supportedVertices=
    samples.filter(Boolean).length

  const unsupportedVertices=
    totalVertices-
    supportedVertices

  const support={
    totalVertices,
    supportedVertices,
    unsupportedVertices,

    fraction:
      totalVertices>0
        ? supportedVertices/
          totalVertices
        : 0,

    repairedVertices:0
  }


  /*
   * Fast path: complete observed motion support.
   */
  if(unsupportedVertices===0){
    const coordinates=[]
    const uncertainties=[]

    for(let i=0;i<ring.length;i++){
      const [x,y]=ring[i]
      const sampled=samples[i]

      coordinates.push([
        x+sampled.dx,
        y+sampled.dy
      ])

      if(finite(sampled.uncertainty)){
        uncertainties.push(
          sampled.uncertainty
        )
      }
    }

    return {
      supported:true,
      coordinates,
      uncertainties,
      support
    }
  }


  /*
   * Short-gap repair is deliberately conservative.
   *
   * Raw evidence accounting above remains unchanged.
   * Repaired vertices are inference used only to keep
   * an otherwise strongly supported boundary advectable.
   */
  if(
    support.fraction<
      MIN_SHORT_GAP_SUPPORT_FRACTION
  ){
    return {
      supported:false,
      coordinates:null,
      uncertainties:[],
      support
    }
  }


  /*
   * GeoJSON rings normally repeat the first coordinate
   * as the final coordinate. Analyse the physical ring
   * without that duplicate so cyclic gap detection is
   * not distorted by the closure point.
   */
  const closed=
    ring.length>1 &&
    coordinatesEqual(
      ring[0],
      ring[ring.length-1]
    )

  const coreLength=
    closed
      ? ring.length-1
      : ring.length

  if(coreLength<3){
    return {
      supported:false,
      coordinates:null,
      uncertainties:[],
      support
    }
  }

  const coreRing=
    ring.slice(
      0,
      coreLength
    )

  const coreSamples=
    samples.slice(
      0,
      coreLength
    )

  const firstSupported=
    coreSamples.findIndex(Boolean)

  if(firstSupported<0){
    return {
      supported:false,
      coordinates:null,
      uncertainties:[],
      support
    }
  }


  /*
   * Discover unsupported runs cyclically.
   * Starting immediately after a supported vertex makes
   * a gap spanning the array boundary one logical run.
   */
  const runs=[]
  let currentRun=[]

  for(
    let offset=1;
    offset<=coreLength;
    offset++
  ){
    const index=
      (
        firstSupported+
        offset
      )%coreLength

    if(!coreSamples[index]){
      currentRun.push(index)
      continue
    }

    if(currentRun.length){
      runs.push(currentRun)
      currentRun=[]
    }
  }

  if(currentRun.length){
    runs.push(currentRun)
  }


  if(
    runs.some(
      run=>
        run.length>
          MAX_SHORT_GAP_VERTICES
    )
  ){
    return {
      supported:false,
      coordinates:null,
      uncertainties:[],
      support
    }
  }


  /*
   * Every short run must be bounded on both sides by
   * real supported motion samples. Interpolate dx/dy
   * only between those two observed samples.
   */
  const repairedSamples=
    coreSamples.slice()

  for(const run of runs){
    const firstIndex=
      run[0]

    const lastIndex=
      run[run.length-1]

    const previousIndex=
      (
        firstIndex-
        1+
        coreLength
      )%coreLength

    const nextIndex=
      (
        lastIndex+
        1
      )%coreLength

    const previous=
      repairedSamples[
        previousIndex
      ]

    const next=
      repairedSamples[
        nextIndex
      ]

    if(
      !previous ||
      !next
    ){
      return {
        supported:false,
        coordinates:null,
        uncertainties:[],
        support
      }
    }

    for(
      let position=0;
      position<run.length;
      position++
    ){
      const index=
        run[position]

      const t=
        (position+1)/
        (run.length+1)

      repairedSamples[index]={
        dx:
          previous.dx+
          t*(
            next.dx-
            previous.dx
          ),

        dy:
          previous.dy+
          t*(
            next.dy-
            previous.dy
          ),

        /*
         * Do not claim lower uncertainty than either
         * real sample bracketing the inferred point.
         */
        uncertainty:
          finiteMax(
            previous.uncertainty,
            next.uncertainty
          ),

        repaired:true
      }
    }
  }


  const coordinates=[]
  const uncertainties=[]

  for(let i=0;i<coreLength;i++){
    const [x,y]=coreRing[i]
    const sampled=
      repairedSamples[i]

    if(!sampled){
      return {
        supported:false,
        coordinates:null,
        uncertainties:[],
        support
      }
    }

    coordinates.push([
      x+sampled.dx,
      y+sampled.dy
    ])

    if(sampled.repaired){
      support.repairedVertices++
    }

    if(finite(sampled.uncertainty)){
      uncertainties.push(
        sampled.uncertainty
      )
    }
  }


  if(closed){
    coordinates.push([
      ...coordinates[0]
    ])

    /*
     * Preserve coordinate-entry accounting. If the
     * physical first vertex was repaired, the repeated
     * closing coordinate is also an inferred coordinate.
     */
    if(
      repairedSamples[0]
        ?.repaired
    ){
      support.repairedVertices++
    }

    const closureUncertainty=
      repairedSamples[0]
        ?.uncertainty

    if(finite(closureUncertainty)){
      uncertainties.push(
        closureUncertainty
      )
    }
  }


  return {
    supported:true,
    coordinates,
    uncertainties,
    support
  }
}



function geographicToPixelPosition(
  coordinate,
  field
){
  const [lon,lat]=coordinate
  const [west,south,east,north]=field.bounds

  const dx=(east-west)/field.width
  const dy=(north-south)/field.height

  return [
    (lon-west)/dx,
    (north-lat)/dy
  ]
}

function pixelToGeographicPosition(
  coordinate,
  field
){
  const [x,y]=coordinate
  const [west,south,east,north]=field.bounds

  const dx=(east-west)/field.width
  const dy=(north-south)/field.height

  return [
    west+x*dx,
    north-y*dy
  ]
}

function mapGeometryCoordinates(
  geometry,
  mapper
){
  if(!geometry){
    throw new TypeError(
      'geometry is required'
    )
  }

  if(geometry.type==='Polygon'){
    return {
      type:'Polygon',
      coordinates:
        geometry.coordinates.map(
          ring=>
            ring.map(mapper)
        )
    }
  }

  if(geometry.type==='MultiPolygon'){
    return {
      type:'MultiPolygon',
      coordinates:
        geometry.coordinates.map(
          polygon=>
            polygon.map(
              ring=>
                ring.map(mapper)
            )
        )
    }
  }

  throw new TypeError(
    `Unsupported geometry type ${geometry.type}`
  )
}

function geographicToPixelGeometry(
  geometry,
  field
){
  return mapGeometryCoordinates(
    geometry,
    coordinate=>
      geographicToPixelPosition(
        coordinate,
        field
      )
  )
}

function pixelToGeographicGeometry(
  geometry,
  field
){
  return mapGeometryCoordinates(
    geometry,
    coordinate=>
      pixelToGeographicPosition(
        coordinate,
        field
      )
  )
}



function advectGeographicGeometry(
  geometry,
  field,
  motion,
  options={}
){
  const pixelGeometry=
    geographicToPixelGeometry(
      geometry,
      field
    )

  const predicted=
    advectPixelGeometry(
      pixelGeometry,
      motion,
      options
    )

  if(!predicted.supported){
    return {
      supported:false,
      geometry:null,
      uncertaintyPixels:null,
      support:
        predicted.support ?? null
    }
  }

  return {
    supported:true,
    geometry:
      pixelToGeographicGeometry(
        predicted.geometry,
        field
      ),
    uncertaintyPixels:
      predicted.uncertaintyPixels,
    support:
      predicted.support ?? null
  }
}

function advectPixelGeometry(
  geometry,
  motion,
  options={}
){
  if(
    !geometry ||
    ![
      'Polygon',
      'MultiPolygon'
    ].includes(geometry.type) ||
    !Array.isArray(geometry.coordinates)
  ){
    throw new TypeError(
      'Polygon or MultiPolygon pixel geometry is required'
    )
  }

  if(
    !motion ||
    !Number.isInteger(motion.width) ||
    !Number.isInteger(motion.height)
  ){
    throw new TypeError(
      'motion field is required'
    )
  }

  const uncertainties=[]

  let totalVertices=0
  let supportedVertices=0
  let repairedVertices=0

  let totalPolygons=0
  let supportedPolygons=0


  function accumulateSupport(
    result
  ){
    const support=
      result.support

    if(!support){
      return
    }

    totalVertices+=
      support.totalVertices

    supportedVertices+=
      support.supportedVertices

    repairedVertices+=
      support.repairedVertices ?? 0
  }


  function supportSummary(){
    const unsupportedVertices=
      totalVertices-
      supportedVertices

    const unsupportedPolygons=
      totalPolygons-
      supportedPolygons

    return {
      totalVertices,
      supportedVertices,
      unsupportedVertices,
      repairedVertices,

      fraction:
        totalVertices>0
          ? supportedVertices/
            totalVertices
          : 0,

      totalPolygons,
      supportedPolygons,
      unsupportedPolygons,

      partial:
        supportedPolygons>0 &&
        unsupportedPolygons>0
    }
  }


  function advectPolygonCoordinates(
    polygonCoordinates
  ){
    const rings=[]
    const polygonUncertainties=[]

    let polygonSupported=true

    for(const ring of polygonCoordinates){
      const result=
        advectRing(
          ring,
          motion,
          options
        )

      accumulateSupport(
        result
      )

      if(!result.supported){
        polygonSupported=false
        continue
      }

      rings.push(
        result.coordinates
      )

      polygonUncertainties.push(
        ...result.uncertainties
      )
    }

    return {
      supported:
        polygonSupported,

      coordinates:
        polygonSupported
          ? rings
          : null,

      uncertainties:
        polygonSupported
          ? polygonUncertainties
          : []
    }
  }


  let predictedGeometry=null
  let geometrySupported=false


  if(geometry.type==='Polygon'){
    totalPolygons=1

    const result=
      advectPolygonCoordinates(
        geometry.coordinates
      )

    if(result.supported){
      supportedPolygons=1
      geometrySupported=true

      predictedGeometry={
        type:'Polygon',
        coordinates:
          result.coordinates
      }

      uncertainties.push(
        ...result.uncertainties
      )
    }
  } else {
    const polygons=[]

    for(
      const polygonCoordinates
      of geometry.coordinates
    ){
      totalPolygons++

      const result=
        advectPolygonCoordinates(
          polygonCoordinates
        )

      if(!result.supported){
        continue
      }

      supportedPolygons++

      polygons.push(
        result.coordinates
      )

      uncertainties.push(
        ...result.uncertainties
      )
    }

    if(polygons.length>0){
      geometrySupported=true

      predictedGeometry={
        type:'MultiPolygon',
        coordinates:polygons
      }
    }
  }


  const support=
    supportSummary()


  if(!geometrySupported){
    return {
      supported:false,
      geometry:null,
      uncertaintyPixels:null,
      support
    }
  }


  const uncertaintyPixels=
    uncertainties.length
      ? Math.max(...uncertainties)
      : null

  return {
    supported:true,
    geometry:predictedGeometry,
    uncertaintyPixels,
    support
  }
}


module.exports={
  advectPixelGeometry,
  advectGeographicGeometry,
  geographicToPixelGeometry,
  pixelToGeographicGeometry
}
