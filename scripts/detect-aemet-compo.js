'use strict'

const fs=require('node:fs')
const {PRODUCTS}=require('../lib/aemet-provider')
const {normalizeAemetCompo}=require('../lib/aemet-compo-evidence')
const {detectStormCandidates}=require('../lib/storm-detector')

async function main() {
  const file=process.argv[2]
  const epochMs=Number(process.argv[3])

  if(!file || !Number.isFinite(epochMs)) {
    console.error(
      'usage: node scripts/detect-aemet-compo.js <frame.tif> <epochMs>'
    )
    process.exit(2)
  }

  const buffer=fs.readFileSync(file)

  const evidence=await normalizeAemetCompo(buffer,{
    bounds:PRODUCTS.COMPO.bounds,
    observedAt:epochMs
  })

  const candidates=detectStormCandidates(evidence,{
    minReflectivityDbz:24,
    minAreaKm2:0,
    maxAreaKm2:Infinity
  })

  console.log(JSON.stringify({
    evidence:{
      observedAt:evidence.observedAt,
      width:evidence.width,
      height:evidence.height,
      bounds:evidence.bounds,
      availability:evidence.availability,
      provenance:evidence.provenance
    },
    detector:{
      method:'reflectivity-threshold-development-v1',
      thresholdDbz:24,
      candidateCount:candidates.length
    },
    candidates:candidates.map(c=>({
      sourceId:c.id,
      geometryType:c.geometry.type,
      pixelCount:c.properties.detection.pixelCount,
      areaKm2:Number(c.properties.detection.areaKm2.toFixed(2)),
      bbox:c.properties.detection.bbox,
      maxReflectivityLowerBoundDbz:
        c.properties.detection.maxReflectivityLowerBoundDbz
    }))
  },null,2))
}

main().catch(err=>{
  console.error(err)
  process.exit(1)
})
