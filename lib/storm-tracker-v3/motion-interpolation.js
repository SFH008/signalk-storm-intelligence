'use strict'

function finite(v){
  return Number.isFinite(v)
}

function median(values){
  const a=values
    .filter(finite)
    .sort((x,y)=>x-y)

  if(!a.length)return null

  const mid=Math.floor(a.length/2)

  if(a.length%2){
    return a[mid]
  }

  return (
    a[mid-1]+a[mid]
  )/2
}

function sampleMotionField(
  motion,
  x,
  y,
  options={}
){
  const radius=
    Number(options.radius ?? 20)

  const minSamples=
    Number(options.minSamples ?? 3)

  if(
    !motion ||
    !Number.isInteger(motion.width) ||
    !Number.isInteger(motion.height)
  ){
    throw new TypeError(
      'motion field is required'
    )
  }

  if(
    !finite(x) ||
    !finite(y)
  ){
    throw new TypeError(
      'finite sample coordinates are required'
    )
  }

  const r2=radius*radius

  const minX=Math.max(
    0,
    Math.floor(x-radius)
  )

  const maxX=Math.min(
    motion.width-1,
    Math.ceil(x+radius)
  )

  const minY=Math.max(
    0,
    Math.floor(y-radius)
  )

  const maxY=Math.min(
    motion.height-1,
    Math.ceil(y+radius)
  )

  const samples=[]

  for(let sy=minY;sy<=maxY;sy++){
    for(let sx=minX;sx<=maxX;sx++){
      const ddx=sx-x
      const ddy=sy-y

      if(
        ddx*ddx+
        ddy*ddy >
        r2
      )continue

      const i=
        sy*motion.width+
        sx

      if(!(motion.support?.[i]>0)){
        continue
      }

      const vx=
        motion.eastPixels?.[i]

      const vy=
        motion.northPixels?.[i]

      if(
        !finite(vx) ||
        !finite(vy)
      )continue

      samples.push({
        dx:vx,
        dy:vy,
        uncertainty:
          finite(
            motion
              .uncertaintyPixels?.[i]
          )
            ? motion
                .uncertaintyPixels[i]
            : null
      })
    }
  }

  if(samples.length<minSamples){
    return {
      supported:false,
      dx:null,
      dy:null,
      uncertaintyPixels:null,
      samples:samples.length
    }
  }

  /*
   * Robust local centre.
   *
   * Median is deliberately used here rather than
   * an arithmetic mean so that a single bad LK
   * vector cannot drag the interpolated field.
   */
  const dx=median(
    samples.map(s=>s.dx)
  )

  const dy=median(
    samples.map(s=>s.dy)
  )

  const localResiduals=
    samples.map(s=>
      Math.hypot(
        s.dx-dx,
        s.dy-dy
      )
    )

  /*
   * The motion centre is robust, but uncertainty must still
   * expose disagreement that the median centre deliberately
   * rejects. RMS radial residual is conservative: one locally
   * inconsistent vector cannot move the median motion estimate,
   * but it does increase uncertainty.
   */
  const disagreement=
    localResiduals.length
      ? Math.sqrt(
          localResiduals.reduce(
            (sum,value)=>
              sum+value*value,
            0
          )/
          localResiduals.length
        )
      : 0

  const sourceUncertainty=
    median(
      samples
        .map(s=>s.uncertainty)
        .filter(finite)
    )

  /*
   * Preserve both uncertainty sources:
   *
   * 1. uncertainty reported by LK itself
   * 2. disagreement among nearby supported vectors
   */
  const uncertaintyPixels=
    (
      finite(sourceUncertainty)
        ? sourceUncertainty
        : 0
    )+
    disagreement

  return {
    supported:true,
    dx,
    dy,
    uncertaintyPixels,
    samples:samples.length
  }
}

module.exports={
  sampleMotionField
}
