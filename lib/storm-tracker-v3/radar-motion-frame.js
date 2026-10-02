'use strict'

function motionFrameFromNormalizedRadarEvidence(evidence) {
  if(
    !evidence ||
    evidence.schema!=='storm-normalized-evidence/1' ||
    evidence.domain!=='radar' ||
    evidence.quantity!=='reflectivity' ||
    evidence.units!=='dBZ' ||
    !Number.isInteger(evidence.width) ||
    evidence.width<=0 ||
    !Number.isInteger(evidence.height) ||
    evidence.height<=0 ||
    !(evidence.values instanceof Float32Array)
  ){
    throw new TypeError(
      'valid normalized radar evidence is required'
    )
  }

  const size=
    evidence.width *
    evidence.height

  if(evidence.values.length!==size){
    throw new TypeError(
      'normalized radar evidence dimensions are inconsistent'
    )
  }

  const backgroundMask=
    evidence.motionBackgroundMask

  if(
    !(backgroundMask instanceof Uint8Array) ||
    backgroundMask.length!==size
  ){
    throw new TypeError(
      'motion background mask dimensions are inconsistent'
    )
  }

  const values=
    new Float32Array(size)

  values.fill(NaN)

  for(let i=0;i<size;i++){
    const value=evidence.values[i]

    /*
     * Real normalized reflectivity always wins.
     *
     * The background mask is only allowed to convert an otherwise
     * unavailable normalized pixel into known zero radar return for
     * motion estimation.
     *
     * Unknown/no-data pixels remain NaN.
     */
    if(Number.isFinite(value)){
      values[i]=value
    }else if(backgroundMask[i]!==0){
      values[i]=0
    }
  }

  return {
    width:evidence.width,
    height:evidence.height,
    values
  }
}

module.exports={
  motionFrameFromNormalizedRadarEvidence
}
