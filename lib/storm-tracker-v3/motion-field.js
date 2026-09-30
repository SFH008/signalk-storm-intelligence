'use strict'

function finite(v){
  return Number.isFinite(v)
}

function sample(image,width,height,x,y){
  if(
    x<0 ||
    y<0 ||
    x>width-1 ||
    y>height-1
  )return NaN

  const x0=Math.floor(x)
  const y0=Math.floor(y)
  const x1=Math.min(width-1,x0+1)
  const y1=Math.min(height-1,y0+1)

  const fx=x-x0
  const fy=y-y0

  const a=image[y0*width+x0]
  const b=image[y0*width+x1]
  const c=image[y1*width+x0]
  const d=image[y1*width+x1]

  if(
    !finite(a) ||
    !finite(b) ||
    !finite(c) ||
    !finite(d)
  )return NaN

  return (
    a*(1-fx)*(1-fy)+
    b*fx*(1-fy)+
    c*(1-fx)*fy+
    d*fx*fy
  )
}

function downsample(level){
  const width=Math.max(
    1,
    Math.floor(level.width/2)
  )

  const height=Math.max(
    1,
    Math.floor(level.height/2)
  )

  const values=
    new Float32Array(width*height)

  values.fill(NaN)

  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      let sum=0
      let count=0

      for(let dy=0;dy<2;dy++){
        for(let dx=0;dx<2;dx++){
          const sx=x*2+dx
          const sy=y*2+dy

          if(
            sx>=level.width ||
            sy>=level.height
          )continue

          const v=
            level.values[
              sy*level.width+sx
            ]

          if(!finite(v))continue

          sum+=v
          count++
        }
      }

      if(count){
        values[y*width+x]=sum/count
      }
    }
  }

  return {
    width,
    height,
    values
  }
}

function pyramid(field,levels){
  const result=[{
    width:field.width,
    height:field.height,
    values:field.values
  }]

  while(result.length<levels){
    const next=downsample(
      result[result.length-1]
    )

    if(
      next.width<12 ||
      next.height<12
    )break

    result.push(next)
  }

  return result
}

function structureTensor(
  image,
  width,
  height,
  x,
  y,
  radius
){
  let gxx=0
  let gxy=0
  let gyy=0
  let count=0

  for(let dy=-radius;dy<=radius;dy++){
    for(let dx=-radius;dx<=radius;dx++){
      const px=x+dx
      const py=y+dy

      const l=sample(
        image,width,height,
        px-1,py
      )

      const r=sample(
        image,width,height,
        px+1,py
      )

      const u=sample(
        image,width,height,
        px,py-1
      )

      const d=sample(
        image,width,height,
        px,py+1
      )

      if(
        !finite(l) ||
        !finite(r) ||
        !finite(u) ||
        !finite(d)
      )continue

      const ix=(r-l)*0.5
      const iy=(d-u)*0.5

      gxx+=ix*ix
      gxy+=ix*iy
      gyy+=iy*iy
      count++
    }
  }

  return {
    gxx,
    gxy,
    gyy,
    count,
    determinant:gxx*gyy-gxy*gxy
  }
}

function trackPoint(
  previous,
  current,
  x,
  y,
  initialDx,
  initialDy,
  options
){
  const radius=options.windowRadius
  let dx=initialDx
  let dy=initialDy

  for(
    let iteration=0;
    iteration<options.iterations;
    iteration++
  ){
    let a11=0
    let a12=0
    let a22=0
    let b1=0
    let b2=0
    let count=0

    for(let wy=-radius;wy<=radius;wy++){
      for(let wx=-radius;wx<=radius;wx++){
        const px=x+wx
        const py=y+wy

        const p=sample(
          previous.values,
          previous.width,
          previous.height,
          px,
          py
        )

        const cx=px+dx
        const cy=py+dy

        const c=sample(
          current.values,
          current.width,
          current.height,
          cx,
          cy
        )

        const cl=sample(
          current.values,
          current.width,
          current.height,
          cx-1,
          cy
        )

        const cr=sample(
          current.values,
          current.width,
          current.height,
          cx+1,
          cy
        )

        const cu=sample(
          current.values,
          current.width,
          current.height,
          cx,
          cy-1
        )

        const cd=sample(
          current.values,
          current.width,
          current.height,
          cx,
          cy+1
        )

        if(
          !finite(p) ||
          !finite(c) ||
          !finite(cl) ||
          !finite(cr) ||
          !finite(cu) ||
          !finite(cd)
        )continue

        const ix=(cr-cl)*0.5
        const iy=(cd-cu)*0.5
        const error=p-c

        a11+=ix*ix
        a12+=ix*iy
        a22+=iy*iy

        b1+=ix*error
        b2+=iy*error
        count++
      }
    }

    const det=a11*a22-a12*a12

    if(
      count<options.minSamples ||
      !Number.isFinite(det) ||
      det<=options.minDeterminant
    ){
      return null
    }

    const stepX=
      (a22*b1-a12*b2)/det

    const stepY=
      (-a12*b1+a11*b2)/det

    if(
      !finite(stepX) ||
      !finite(stepY)
    )return null

    dx+=stepX
    dy+=stepY

    if(
      Math.hypot(stepX,stepY)<
      options.convergence
    )break
  }

  return {dx,dy}
}

function trackPyramidal(
  previousPyramid,
  currentPyramid,
  x,
  y,
  options
){
  let dx=0
  let dy=0

  const top=
    Math.min(
      previousPyramid.length,
      currentPyramid.length
    )-1

  for(let level=top;level>=0;level--){
    const scale=2**level

    if(level!==top){
      dx*=2
      dy*=2
    }

    const previous=
      previousPyramid[level]

    const current=
      currentPyramid[level]

    const result=trackPoint(
      previous,
      current,
      x/scale,
      y/scale,
      dx,
      dy,
      options
    )

    if(!result)return null

    dx=result.dx
    dy=result.dy
  }

  return {dx,dy}
}

function estimateMotionField(
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
      'motion fields must have equal dimensions'
    )
  }

  const width=previous.width
  const height=previous.height
  const size=width*height

  const cfg={
    pyramidLevels:
      options.pyramidLevels ?? 4,

    windowRadius:
      options.windowRadius ?? 4,

    iterations:
      options.iterations ?? 15,

    featureStep:
      options.featureStep ?? 4,

    minSamples:
      options.minSamples ?? 20,

    minDeterminant:
      options.minDeterminant ?? 1e-3,

    featureDeterminant:
      options.featureDeterminant ?? 1,

    convergence:
      options.convergence ?? 0.01
  }

  const previousPyramid=
    pyramid(previous,cfg.pyramidLevels)

  const currentPyramid=
    pyramid(current,cfg.pyramidLevels)

  const eastPixels=
    new Float32Array(size)

  const northPixels=
    new Float32Array(size)

  eastPixels.fill(NaN)
  northPixels.fill(NaN)

  const support=
    new Uint8Array(size)

  /*
   * Quality diagnostics.
   *
   * These do not influence whether a motion vector is accepted.
   * They measure forward/backward consistency only.
   */
  const forwardBackwardErrorPixels=
    new Float32Array(size)

  const confidence=
    new Float32Array(size)

  forwardBackwardErrorPixels.fill(NaN)
  confidence.fill(NaN)

  /*
   * Initial explicit uncertainty measure.
   *
   * For v3.1 this is intentionally identical to the
   * forward/backward consistency error and therefore has
   * a direct physical interpretation in pixels.
   *
   * Do not combine support, confidence, local dispersion,
   * or provider-specific assumptions here yet.
   */
  const uncertaintyPixels=
    forwardBackwardErrorPixels

  for(
    let y=cfg.windowRadius+2;
    y<height-cfg.windowRadius-2;
    y+=cfg.featureStep
  ){
    for(
      let x=cfg.windowRadius+2;
      x<width-cfg.windowRadius-2;
      x+=cfg.featureStep
    ){
      const tensor=structureTensor(
        previous.values,
        width,
        height,
        x,
        y,
        cfg.windowRadius
      )

      if(
        tensor.count<cfg.minSamples ||
        tensor.determinant<
          cfg.featureDeterminant
      )continue

      const result=trackPyramidal(
        previousPyramid,
        currentPyramid,
        x,
        y,
        cfg
      )

      if(!result)continue

      const index=y*width+x

      eastPixels[index]=result.dx
      northPixels[index]=result.dy
      support[index]=1

      /*
       * Reverse-track the estimated endpoint from the current
       * image back into the previous image.
       *
       * Perfectly consistent motion gives:
       *
       *   forward + reverse = (0,0)
       */
      const reverse=trackPyramidal(
        currentPyramid,
        previousPyramid,
        x+result.dx,
        y+result.dy,
        cfg
      )

      if(reverse){
        const fbError=Math.hypot(
          result.dx+reverse.dx,
          result.dy+reverse.dy
        )

        forwardBackwardErrorPixels[index]=
          fbError

        /*
         * Initial quality measure only.
         * This is NOT yet the final uncertainty model.
         */
        confidence[index]=
          Math.max(0,1-fbError)
      }
    }
  }

  return {
    width,
    height,
    eastPixels,
    northPixels,
    support,
    forwardBackwardErrorPixels,
    uncertaintyPixels,
    confidence,
    method:'pyramidal-lucas-kanade-v1'
  }
}

module.exports={
  estimateMotionField,
  downsampleMotionField:downsample
}
