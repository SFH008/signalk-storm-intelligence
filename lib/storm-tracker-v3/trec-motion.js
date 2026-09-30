'use strict'

function finite(v){
  return Number.isFinite(v)
}

function normalizedCrossCorrelation(
  previous,
  current,
  width,
  height,
  x,
  y,
  dx,
  dy,
  radius,
  minSamples
){
  let count=0

  let sumA=0
  let sumB=0
  let sumAA=0
  let sumBB=0
  let sumAB=0

  for(let oy=-radius;oy<=radius;oy++){
    const ay=y+oy
    const by=ay+dy

    if(
      ay<0 || ay>=height ||
      by<0 || by>=height
    )continue

    for(let ox=-radius;ox<=radius;ox++){
      const ax=x+ox
      const bx=ax+dx

      if(
        ax<0 || ax>=width ||
        bx<0 || bx>=width
      )continue

      const a=previous[ay*width+ax]
      const b=current[by*width+bx]

      if(!finite(a) || !finite(b))continue

      count++

      sumA+=a
      sumB+=b
      sumAA+=a*a
      sumBB+=b*b
      sumAB+=a*b
    }
  }

  if(count<minSamples)return null

  const numerator=
    sumAB-(sumA*sumB/count)

  const varianceA=
    sumAA-(sumA*sumA/count)

  const varianceB=
    sumBB-(sumB*sumB/count)

  /*
   * A flat block contains no trackable structure.
   */
  if(
    varianceA<=1e-9 ||
    varianceB<=1e-9
  )return null

  const denominator=
    Math.sqrt(varianceA*varianceB)

  if(!(denominator>0))return null

  return {
    correlation:
      Math.max(
        -1,
        Math.min(1,numerator/denominator)
      ),
    count
  }
}

function estimateTrecMotionField(
  previous,
  current,
  options={}
){
  if(
    !previous ||
    !current ||
    previous.width!==current.width ||
    previous.height!==current.height
  ){
    throw new TypeError(
      'TREC fields must have equal dimensions'
    )
  }

  const width=previous.width
  const height=previous.height
  const size=width*height

  const cfg={
    patchRadius:
      options.patchRadius ?? 4,

    searchRadius:
      options.searchRadius ?? 8,

    featureStep:
      options.featureStep ?? 4,

    minSamples:
      options.minSamples ??
      Math.ceil(
        ((options.patchRadius ?? 4)*2+1)**2*
        0.75
      ),

    minCorrelation:
      options.minCorrelation ?? 0.6,

    /*
     * TREC must not turn an ambiguous correlation surface
     * into a forced motion vector.
     */
    minMargin:
      options.minMargin ?? 1e-6,

    /*
     * Optional fixed sampling lattice.
     *
     * Patch/search size may change without moving the
     * physical locations at which motion is measured.
     */
    gridOriginX:
      options.gridOriginX ?? null,

    gridOriginY:
      options.gridOriginY ?? null
  }

  const eastPixels=
    new Float32Array(size)

  const northPixels=
    new Float32Array(size)

  const correlation=
    new Float32Array(size)

  const margin=
    new Float32Array(size)

  eastPixels.fill(NaN)
  northPixels.fill(NaN)
  correlation.fill(NaN)
  margin.fill(NaN)

  const support=
    new Uint8Array(size)

  const border=
    cfg.patchRadius+
    cfg.searchRadius

  function firstGridCoordinate(
    borderValue,
    origin,
    step
  ){
    if(!Number.isFinite(origin)){
      return borderValue
    }

    if(origin>=borderValue){
      return origin
    }

    return (
      origin+
      Math.ceil(
        (borderValue-origin)/step
      )*step
    )
  }

  const startX=firstGridCoordinate(
    border,
    cfg.gridOriginX,
    cfg.featureStep
  )

  const startY=firstGridCoordinate(
    border,
    cfg.gridOriginY,
    cfg.featureStep
  )

  for(
    let y=startY;
    y<height-border;
    y+=cfg.featureStep
  ){
    for(
      let x=startX;
      x<width-border;
      x+=cfg.featureStep
    ){
      let best=null
      let secondBest=-Infinity

      for(
        let dy=-cfg.searchRadius;
        dy<=cfg.searchRadius;
        dy++
      ){
        for(
          let dx=-cfg.searchRadius;
          dx<=cfg.searchRadius;
          dx++
        ){
          const result=
            normalizedCrossCorrelation(
              previous.values,
              current.values,
              width,
              height,
              x,
              y,
              dx,
              dy,
              cfg.patchRadius,
              cfg.minSamples
            )

          if(!result)continue

          const score=result.correlation

          if(
            !best ||
            score>best.correlation
          ){
            if(best){
              secondBest=best.correlation
            }

            best={
              dx,
              dy,
              correlation:score
            }
          }else if(score>secondBest){
            secondBest=score
          }
        }
      }

      if(!best)continue

      const peakMargin=
        Number.isFinite(secondBest)
          ? best.correlation-secondBest
          : Infinity

      if(
        best.correlation<cfg.minCorrelation ||
        peakMargin<=cfg.minMargin
      )continue

      const index=y*width+x

      eastPixels[index]=best.dx
      northPixels[index]=best.dy
      correlation[index]=best.correlation
      margin[index]=peakMargin
      support[index]=1
    }
  }

  return {
    width,
    height,
    eastPixels,
    northPixels,
    support,
    correlation,
    margin,
    method:'trec-ncc-v1'
  }
}

module.exports={
  estimateTrecMotionField
}
