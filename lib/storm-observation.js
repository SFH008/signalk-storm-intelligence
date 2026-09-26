'use strict'

/*
 * Storm observation object construction.
 *
 * This module is deliberately limited to one physical evidence frame.
 * It does not create persistent storm identity, perform temporal
 * association, estimate motion, infer evolution, forecast, or calculate
 * vessel-relative threat.
 *
 * Phase 7 extraction rule:
 * preserve existing observable detector output before enhancing the
 * Storm Model v2 representation.
 */

function buildStormObservations(rows,field,options={}) {
  if(!Array.isArray(rows)) {
    throw new TypeError('Detector rows are required')
  }

  if(field?.schema!=='storm-normalized-evidence/1') {
    throw new TypeError('Normalized storm evidence v1 is required')
  }

  const method=String(options.method ?? '')
  const minReflectivityDbz=Number(options.minReflectivityDbz)
  const representation=options.representation
  const isLowerBound=options.isLowerBound===true

  if(!method) {
    throw new TypeError('Observation method is required')
  }

  if(!Number.isFinite(minReflectivityDbz)) {
    throw new TypeError('Reflectivity threshold is required')
  }

  if(!representation) {
    throw new TypeError('Reflectivity representation is required')
  }

  return rows.map((row,index)=>{
    const ordinal=index+1

    /*
     * sourceId is intentionally preserved unchanged during extraction.
     * It identifies one derived spatial object in one observed frame.
     * It is NOT persistent storm identity.
     */
    const sourceId=`${field.observedAt}:${ordinal}`

    return {
      type:'Feature',
      id:sourceId,
      geometry:row.geometry,
      properties:{
        sourceId,
        observedAt:field.observedAt,
        detection:{
          method,
          qualification:{
            quantity:'reflectivity',
            operator:'>=',
            thresholdDbz:minReflectivityDbz
          },
          pixelCount:row.component.length,
          areaKm2:row.areaKm2,
          bbox:row.bbox,
          maxReflectivityDbz:row.maxReflectivityDbz,
          ...(isLowerBound
            ? {
                maxReflectivityLowerBoundDbz:
                  row.maxReflectivityDbz
              }
            : {})
        },
        evidence:{
          reflectivity:{
            available:true,
            units:'dBZ',
            maxDbz:row.maxReflectivityDbz,
            representation,
            ...(isLowerBound
              ? {
                  maxLowerBoundDbz:
                    row.maxReflectivityDbz
                }
              : {}),
            provenance:field.provenance
          }
        }
      }
    }
  })
}

module.exports={
  buildStormObservations
}
