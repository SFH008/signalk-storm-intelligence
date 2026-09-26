'use strict'

const zlib=require('node:zlib')

const {
  rainRateToDbz
}=require('./radar-normalization')

const {
  IPMA_PCR_LEGEND_RGB
}=require('./ipma-pcr-legend')

/*
 * Official IPMA PCR legend bands.
 *
 * y 5..245 is the colour strip in the official 250px-high legend.
 * Values are conservative lower bounds in mm/h.
 */
const IPMA_PCR_BANDS=Object.freeze([
  {minY:5,   maxY:19,  minRainRate:200},
  {minY:20,  maxY:34,  minRainRate:100},
  {minY:35,  maxY:49,  minRainRate:70},
  {minY:50,  maxY:64,  minRainRate:50},
  {minY:65,  maxY:79,  minRainRate:40},
  {minY:80,  maxY:94,  minRainRate:30},
  {minY:95,  maxY:109, minRainRate:20},
  {minY:110, maxY:124, minRainRate:10},
  {minY:125, maxY:139, minRainRate:8},
  {minY:140, maxY:154, minRainRate:6},
  {minY:155, maxY:169, minRainRate:4},
  {minY:170, maxY:184, minRainRate:2},
  {minY:185, maxY:199, minRainRate:1},
  {minY:200, maxY:214, minRainRate:0.5},
  {minY:215, maxY:229, minRainRate:0.1},
  {minY:230, maxY:245, minRainRate:0.05}
])

function colourDistanceSq(a,b) {
  return (
    (a[0]-b[0])**2+
    (a[1]-b[1])**2+
    (a[2]-b[2])**2
  )
}

function legendYForRgb(rgb) {
  let bestIndex=-1
  let bestDistance=Infinity

  for(let i=0;i<IPMA_PCR_LEGEND_RGB.length;i++) {
    const d=colourDistanceSq(rgb,IPMA_PCR_LEGEND_RGB[i])

    if(d<bestDistance) {
      bestDistance=d
      bestIndex=i
    }
  }

  return {
    y:bestIndex+5,
    distance:Math.sqrt(bestDistance)
  }
}

function rainRateLowerBoundForLegendY(y) {
  const band=IPMA_PCR_BANDS.find(
    row=>y>=row.minY && y<=row.maxY
  )

  return band?.minRainRate ?? NaN
}

function parseIndexedPng(buffer) {
  if(!Buffer.isBuffer(buffer)) {
    throw new TypeError('Indexed PNG buffer is required')
  }

  const signature=Buffer.from([137,80,78,71,13,10,26,10])

  if(buffer.length<8 || !buffer.subarray(0,8).equals(signature)) {
    throw new Error('Invalid PNG signature')
  }

  let pos=8
  let ihdr=null
  let palette=null
  let transparency=null
  const idat=[]

  while(pos<buffer.length) {
    const len=buffer.readUInt32BE(pos)
    const type=buffer.toString('ascii',pos+4,pos+8)
    const data=buffer.subarray(pos+8,pos+8+len)

    if(type==='IHDR') {
      ihdr={
        width:data.readUInt32BE(0),
        height:data.readUInt32BE(4),
        bitDepth:data[8],
        colorType:data[9],
        compression:data[10],
        filter:data[11],
        interlace:data[12]
      }
    } else if(type==='PLTE') {
      palette=Buffer.from(data)
    } else if(type==='tRNS') {
      transparency=Buffer.from(data)
    } else if(type==='IDAT') {
      idat.push(Buffer.from(data))
    }

    pos+=12+len
  }

  if(!ihdr)throw new Error('PNG IHDR missing')
  if(ihdr.colorType!==3)throw new Error('IPMA PCR must be indexed PNG')
  if(ihdr.bitDepth!==8)throw new Error('IPMA PCR must use 8-bit indices')
  if(ihdr.interlace!==0)throw new Error('Interlaced IPMA PCR PNG unsupported')
  if(!palette)throw new Error('PNG PLTE missing')

  const width=ihdr.width
  const height=ihdr.height
  const stride=width
  const raw=zlib.inflateSync(Buffer.concat(idat))
  const indices=new Uint8Array(width*height)

  let previous=Buffer.alloc(stride)
  let offset=0

  function paeth(a,b,c) {
    const p=a+b-c
    const pa=Math.abs(p-a)
    const pb=Math.abs(p-b)
    const pc=Math.abs(p-c)

    if(pa<=pb && pa<=pc)return a
    if(pb<=pc)return b
    return c
  }

  for(let y=0;y<height;y++) {
    const filter=raw[offset++]
    const scan=Buffer.from(raw.subarray(offset,offset+stride))
    offset+=stride

    for(let x=0;x<stride;x++) {
      const left=x ? scan[x-1] : 0
      const up=previous[x]
      const upLeft=x ? previous[x-1] : 0

      switch(filter) {
        case 0: break
        case 1: scan[x]=(scan[x]+left)&255; break
        case 2: scan[x]=(scan[x]+up)&255; break
        case 3:
          scan[x]=(scan[x]+Math.floor((left+up)/2))&255
          break
        case 4:
          scan[x]=(scan[x]+paeth(left,up,upLeft))&255
          break
        default:
          throw new Error(`Unsupported PNG filter ${filter}`)
      }

      indices[y*width+x]=scan[x]
    }

    previous=scan
  }

  const paletteEntries=Array.from(
    {length:palette.length/3},
    (_,index)=>({
      index,
      rgb:[
        palette[index*3],
        palette[index*3+1],
        palette[index*3+2]
      ],
      alpha:
        transparency && index<transparency.length
          ? transparency[index]
          : 255
    })
  )

  return {
    width,
    height,
    indices,
    paletteEntries
  }
}

function buildPaletteLookup(paletteEntries) {
  const lookup=new Float32Array(256)
  lookup.fill(NaN)

  const mappings=[]

  for(const entry of paletteEntries) {
    /*
     * Transparent pixels are no data.
     * Opaque black is outside the official rainfall ramp and therefore
     * remains unavailable rather than being interpreted as zero rain.
     */
    if(
      entry.alpha===0 ||
      (
        entry.rgb[0]===0 &&
        entry.rgb[1]===0 &&
        entry.rgb[2]===0
      )
    ) {
      mappings.push({
        index:entry.index,
        available:false
      })
      continue
    }

    const matched=legendYForRgb(entry.rgb)
    const rainRateLowerBoundMmPerHour=
      rainRateLowerBoundForLegendY(matched.y)

    if(!Number.isFinite(rainRateLowerBoundMmPerHour)) {
      mappings.push({
        index:entry.index,
        available:false,
        legendY:matched.y,
        colourDistance:matched.distance
      })
      continue
    }

    const dbz=rainRateToDbz(
      rainRateLowerBoundMmPerHour
    )

    lookup[entry.index]=dbz

    mappings.push({
      index:entry.index,
      available:true,
      legendY:matched.y,
      colourDistance:matched.distance,
      rainRateLowerBoundMmPerHour,
      reflectivityLowerBoundDbz:dbz
    })
  }

  return {
    lookup,
    mappings
  }
}

function normalizeIpmaPcr(buffer,options={}) {
  const bounds=options.bounds
  const observedAt=options.observedAt

  if(!Array.isArray(bounds) || bounds.length!==4) {
    throw new TypeError('IPMA PCR geographic bounds are required')
  }

  if(observedAt===undefined || observedAt===null) {
    throw new TypeError('IPMA PCR observation time is required')
  }

  const decoded=parseIndexedPng(buffer)
  const palette=buildPaletteLookup(decoded.paletteEntries)

  const size=decoded.width*decoded.height

  const reflectivityLowerBoundDbz=
    new Float32Array(size)

  reflectivityLowerBoundDbz.fill(NaN)

  let physicalPixels=0
  let unavailablePixels=0

  for(let i=0;i<size;i++) {
    const value=palette.lookup[decoded.indices[i]]

    if(Number.isFinite(value)) {
      reflectivityLowerBoundDbz[i]=value
      physicalPixels++
    } else {
      unavailablePixels++
    }
  }

  return {
    schema:'storm-normalized-evidence/1',
    domain:'radar',
    quantity:'reflectivity',
    units:'dBZ',
    observedAt:new Date(observedAt).toISOString(),
    width:decoded.width,
    height:decoded.height,
    bounds:bounds.map(Number),

    /*
     * Normalized Storm Evidence v1.
     *
     * The source quantity is a conservative rainfall-rate lower bound.
     * Conversion therefore preserves lower-bound semantics.
     */
    values:reflectivityLowerBoundDbz,
    valueSemantics:{
      representation:'lower-bound',
      derivation:'converted',
      sourceQuantity:'rainfallRate',
      sourceUnits:'mm/h',
      intervalSemantics:{
        kind:'class-interval',
        boundUsed:'lower'
      },
      conversion:{
        method:'marshall-palmer-z-r',
        relation:'Z=200*R^1.6'
      }
    },

    reflectivityLowerBoundDbz,
    availability:{
      available:physicalPixels>0,
      physicalPixels,
      unavailablePixels,
      totalPixels:size
    },
    provenance:{
      provider:'ipma',
      product:'PCR',
      method:'ipma-pcr-rain-rate-to-reflectivity-v1',
      sourceQuantity:'rainfallRate',
      sourceUnits:'mm/h',
      representation:'derived-reflectivity-lower-bound',
      conversion:{
        method:'marshall-palmer-z-r',
        relation:'Z=200*R^1.6'
      }
    },
    paletteMappings:palette.mappings
  }
}

module.exports={
  IPMA_PCR_BANDS,
  buildPaletteLookup,
  legendYForRgb,
  normalizeIpmaPcr,
  parseIndexedPng,
  rainRateLowerBoundForLegendY
}
