'use strict'

const sharp=require('sharp')

const {
  rainRateToDbz
}=require('./radar-normalization')

/*
 * Official NOA XPOL rainfall-rate palette.
 *
 * Class values and RGB mapping are reproduced from NOA's
 * leaflet.rainviewer_noa.js rgb2Rvalue() implementation.
 *
 * Class 1 is explicitly treated by NOA as zero rainfall.
 */
const NOA_RAIN_RATE_RGB=Object.freeze([
  [0,0,0],
  [0,0,64],
  [0,0,128],
  [0,0,160],
  [0,0,192],
  [0,64,192],
  [0,128,192],
  [0,160,192],
  [0,192,192],
  [0,192,160],
  [0,192,128],
  [0,192,96],
  [0,192,64],
  [0,224,0],
  [64,224,0],
  [128,224,0],
  [160,224,0],
  [192,224,0],
  [224,255,0],
  [255,255,0],
  [255,224,0],
  [255,192,0],
  [255,128,0],
  [255,64,0],
  [255,0,0],
  [224,0,0],
  [192,0,0],
  [128,0,0],
  [128,0,64],
  [128,0,128],
  [192,0,192],
  [255,0,255]
])

const RGB_TO_CLASS=new Map(
  NOA_RAIN_RATE_RGB.map(
    (rgb,index)=>[rgb.join(','),index+1]
  )
)

function rainRateForClass(classIndex) {
  const d=Number(classIndex)

  if(!Number.isInteger(d) || d<1 || d>32) {
    return NaN
  }

  if(d===1)return 0

  const min=0.2
  const max=200

  return min*Math.pow(
    10,
    ((d-1)/(NOA_RAIN_RATE_RGB.length-1))*
      Math.log10(max/min)
  )
}

function classForRgb(rgb) {
  if(
    !Array.isArray(rgb) ||
    rgb.length<3
  ) {
    return null
  }

  return RGB_TO_CLASS.get(
    `${rgb[0]},${rgb[1]},${rgb[2]}`
  ) ?? null
}

async function normalizeNoaRainRate(buffer,options={}) {
  const bounds=options.bounds
  const observedAt=options.observedAt

  if(!Buffer.isBuffer(buffer)) {
    throw new TypeError('NOA RAIN_RATE PNG buffer is required')
  }

  if(!Array.isArray(bounds) || bounds.length!==4) {
    throw new TypeError(
      'NOA RAIN_RATE geographic bounds are required'
    )
  }

  if(observedAt===undefined || observedAt===null) {
    throw new TypeError(
      'NOA RAIN_RATE observation time is required'
    )
  }

  const {data,info}=await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({resolveWithObject:true})

  const size=info.width*info.height
  const reflectivityDbz=new Float32Array(size)
  reflectivityDbz.fill(NaN)

  let physicalPixels=0
  let unavailablePixels=0

  for(let pixel=0;pixel<size;pixel++) {
    const offset=pixel*4

    const r=data[offset]
    const g=data[offset+1]
    const b=data[offset+2]
    const a=data[offset+3]

    if(a===0) {
      unavailablePixels++
      continue
    }

    const classIndex=classForRgb([r,g,b])

    if(classIndex===null) {
      unavailablePixels++
      continue
    }

    const rainRateMmPerHour=
      rainRateForClass(classIndex)

    const dbz=rainRateToDbz(
      rainRateMmPerHour
    )

    /*
     * NOA class 1 means zero rainfall.
     * Zero rainfall has no finite reflectivity estimate and remains
     * unavailable to the reflectivity detector.
     */
    if(!Number.isFinite(dbz)) {
      unavailablePixels++
      continue
    }

    reflectivityDbz[pixel]=dbz
    physicalPixels++
  }

  return {
    schema:'storm-normalized-evidence/1',
    domain:'radar',
    quantity:'reflectivity',
    units:'dBZ',
    observedAt:new Date(observedAt).toISOString(),
    width:info.width,
    height:info.height,
    bounds:bounds.map(Number),

    /*
     * Normalized Storm Evidence v1.
     *
     * NOA supplies a discrete rainfall-rate estimate rather than a
     * conservative class lower bound. The derived reflectivity therefore
     * remains an estimate.
     */
    values:reflectivityDbz,
    valueSemantics:{
      representation:'estimate',
      derivation:'converted',
      sourceQuantity:'rainfallRate',
      sourceUnits:'mm/h',
      intervalSemantics:null,
      conversion:{
        method:'marshall-palmer-z-r',
        relation:'Z=200*R^1.6'
      }
    },

    reflectivityDbz,
    availability:{
      available:physicalPixels>0,
      physicalPixels,
      unavailablePixels,
      totalPixels:size
    },
    provenance:{
      provider:'noa',
      product:'RAIN_RATE',
      method:'noa-xpol-rain-rate-to-reflectivity-v1',
      sourceQuantity:'rainfallRate',
      sourceUnits:'mm/h',
      representation:'derived-reflectivity-estimate',
      sourceEncoding:{
        method:'noa-xpol-rgb-class',
        classes:32,
        rainfallFormula:
          'R=0.2*10^(((class-1)/31)*log10(200/0.2))'
      },
      conversion:{
        method:'marshall-palmer-z-r',
        relation:'Z=200*R^1.6'
      }
    }
  }
}

module.exports={
  NOA_RAIN_RATE_RGB,
  classForRgb,
  rainRateForClass,
  normalizeNoaRainRate
}
