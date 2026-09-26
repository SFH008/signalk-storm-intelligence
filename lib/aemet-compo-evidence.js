'use strict'

const sharp = require('sharp')

/*
 * AEMET COMPO is distributed as an indexed GeoTIFF. Sharp expands the
 * palette to RGB, so this table restores the original class identity.
 *
 * Class-to-dBZ intervals follow the published AEMET COMPO reflectivity
 * legend. We preserve interval semantics and use only the conservative
 * lower bound for detector qualification.
 */
const COMPO_CLASSES = Object.freeze({
  0: { rgb:[255,255,255], minDbz:null, maxDbz:null, noData:true },
  1: { rgb:[239,242,249], minDbz:null, maxDbz:12 },
  2: { rgb:[0,0,252], minDbz:12, maxDbz:18 },
  3: { rgb:[0,148,252], minDbz:18, maxDbz:24 },
  4: { rgb:[67,131,35], minDbz:24, maxDbz:30 },
  5: { rgb:[0,192,0], minDbz:30, maxDbz:36 },
  6: { rgb:[0,252,252], minDbz:36, maxDbz:42 },
  7: { rgb:[0,255,0], minDbz:42, maxDbz:48 },
  8: { rgb:[255,255,0], minDbz:48, maxDbz:54 },
  9: { rgb:[255,187,0], minDbz:54, maxDbz:60 },
  10:{ rgb:[255,127,0], minDbz:60, maxDbz:66 },
  11:{ rgb:[255,0,0], minDbz:66, maxDbz:72 },
  12:{ rgb:[200,0,90], minDbz:72, maxDbz:null }
})

const RGB_TO_CLASS = new Map(
  Object.entries(COMPO_CLASSES).map(([index,c]) => [
    c.rgb.join(','),
    Number(index)
  ])
)

async function normalizeAemetCompo(buffer, options={}) {
  const bounds=options.bounds
  const observedAt=options.observedAt

  if(!Buffer.isBuffer(buffer)) {
    throw new TypeError('AEMET COMPO buffer is required')
  }

  if(!Array.isArray(bounds) || bounds.length!==4) {
    throw new TypeError('AEMET COMPO geographic bounds are required')
  }

  if(observedAt === undefined || observedAt === null) {
    throw new TypeError('AEMET COMPO observation time is required')
  }

  const {data,info}=await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({resolveWithObject:true})

  if(info.channels!==3) {
    throw new Error(`Unexpected AEMET COMPO channel count ${info.channels}`)
  }

  const size=info.width*info.height
  const classIndex=new Uint8Array(size)
  classIndex.fill(255)

  const reflectivityLowerBoundDbz=new Float32Array(size)
  reflectivityLowerBoundDbz.fill(NaN)

  let unknownPixels=0
  let physicalPixels=0

  for(let pixel=0,offset=0;pixel<size;pixel++,offset+=3) {
    const key=`${data[offset]},${data[offset+1]},${data[offset+2]}`
    const cls=RGB_TO_CLASS.get(key)

    if(cls===undefined) {
      unknownPixels++
      continue
    }

    classIndex[pixel]=cls

    const definition=COMPO_CLASSES[cls]

    if(Number.isFinite(definition.minDbz)) {
      reflectivityLowerBoundDbz[pixel]=definition.minDbz
      physicalPixels++
    }
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
    classIndex,

    /*
     * Normalized Storm Evidence v1.
     *
     * values is the provider-neutral scientific field consumed by
     * downstream modules. reflectivityLowerBoundDbz remains temporarily
     * as a compatibility alias for existing callers.
     */
    values:reflectivityLowerBoundDbz,
    valueSemantics:{
      representation:'lower-bound',
      derivation:'native',
      sourceQuantity:'reflectivity',
      sourceUnits:'dBZ',
      intervalSemantics:{
        kind:'class-interval',
        boundUsed:'lower'
      },
      conversion:null
    },

    reflectivityLowerBoundDbz,
    classes:COMPO_CLASSES,
    availability:{
      available:physicalPixels>0,
      physicalPixels,
      unknownPixels,
      totalPixels:size
    },
    provenance:{
      provider:'aemet',
      product:'COMPO',
      method:'aemet-compo-palette-v1',
      representation:'reflectivity-class-interval-lower-bound'
    }
  }
}

module.exports={
  COMPO_CLASSES,
  normalizeAemetCompo
}
