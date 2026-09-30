'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  estimateMotionField
}=require('../lib/storm-tracker-v3/motion-field')

function field(width,height){
  return {
    width,
    height,
    values:new Float32Array(width*height).fill(0)
  }
}

function setRect(f,x0,y0,x1,y1,value){
  for(let y=y0;y<y1;y++){
    for(let x=x0;x<x1;x++){
      f.values[y*f.width+x]=value
    }
  }
}

function translate(source,dx,dy){
  const target=field(
    source.width,
    source.height
  )

  for(let y=0;y<source.height;y++){
    for(let x=0;x<source.width;x++){
      const value=
        source.values[y*source.width+x]

      if(!Number.isFinite(value))continue

      const tx=x+dx
      const ty=y+dy

      if(
        tx<0 ||
        tx>=source.width ||
        ty<0 ||
        ty>=source.height
      )continue

      target.values[
        ty*target.width+tx
      ]=value
    }
  }

  return target
}

function median(values){
  const sorted=values
    .filter(Number.isFinite)
    .sort((a,b)=>a-b)

  if(!sorted.length)return null

  const middle=Math.floor(sorted.length/2)

  return sorted.length%2
    ? sorted[middle]
    : (sorted[middle-1]+sorted[middle])/2
}

test('motion field recovers known five-pixel east translation',()=>{
  const previous=field(96,96)

  /*
   * Deliberately asymmetric radar-like structure.
   * Avoid a featureless rectangle that would make
   * aperture ambiguity unnecessarily easy.
   */
  setRect(previous,25,25,50,32,30)
  setRect(previous,30,32,44,48,42)
  setRect(previous,38,48,55,57,36)
  setRect(previous,50,37,60,46,48)

  const current=translate(
    previous,
    5,
    0
  )

  const motion=estimateMotionField(
    previous,
    current
  )

  assert.equal(motion.width,96)
  assert.equal(motion.height,96)

  const east=[]
  const north=[]

  for(let i=0;i<motion.eastPixels.length;i++){
    if(
      motion.support?.[i] > 0 &&
      Number.isFinite(motion.eastPixels[i]) &&
      Number.isFinite(motion.northPixels[i])
    ){
      east.push(motion.eastPixels[i])
      north.push(motion.northPixels[i])
    }
  }

  assert.ok(
    east.length>0,
    'motion estimator produced no supported vectors'
  )

  const medianEast=median(east)
  const medianNorth=median(north)

  assert.ok(
    Math.abs(medianEast-5)<=1,
    `expected east displacement ≈ 5 px, got ${medianEast}`
  )

  assert.ok(
    Math.abs(medianNorth)<=1,
    `expected north displacement ≈ 0 px, got ${medianNorth}`
  )
})

function supportedMedian(motion,key){
  const values=[]

  for(let i=0;i<motion[key].length;i++){
    if(
      motion.support?.[i] > 0 &&
      Number.isFinite(motion[key][i])
    ){
      values.push(motion[key][i])
    }
  }

  assert.ok(
    values.length>0,
    `no supported ${key} vectors`
  )

  return median(values)
}

function syntheticBase(){
  const f=field(96,96)

  setRect(f,25,25,50,32,30)
  setRect(f,30,32,44,48,42)
  setRect(f,38,48,55,57,36)
  setRect(f,50,37,60,46,48)

  return f
}

function assertTranslation(dx,dy,tolerance=1){
  const previous=syntheticBase()
  const current=translate(previous,dx,dy)

  const motion=estimateMotionField(
    previous,
    current
  )

  const east=supportedMedian(
    motion,
    'eastPixels'
  )

  const north=supportedMedian(
    motion,
    'northPixels'
  )

  assert.ok(
    Math.abs(east-dx)<=tolerance,
    `expected east ${dx}±${tolerance}, got ${east}`
  )

  assert.ok(
    Math.abs(north-dy)<=tolerance,
    `expected north ${dy}±${tolerance}, got ${north}`
  )
}

test('motion field recovers stationary radar field',()=>{
  assertTranslation(0,0,0.25)
})

test('motion field recovers five-pixel west translation',()=>{
  assertTranslation(-5,0)
})

test('motion field recovers five-pixel north translation',()=>{
  assertTranslation(0,-5)
})

test('motion field recovers five-pixel south translation',()=>{
  assertTranslation(0,5)
})

test('motion field recovers diagonal translation',()=>{
  assertTranslation(4,-3)
})

function scaleIntensity(source,factor){
  const target=field(
    source.width,
    source.height
  )

  for(let i=0;i<source.values.length;i++){
    const v=source.values[i]

    target.values[i]=
      Number.isFinite(v)
        ? v*factor
        : NaN
  }

  return target
}

test('motion field tolerates moderate intensity scaling',()=>{
  const previous=syntheticBase()

  const shifted=translate(
    previous,
    5,
    0
  )

  const current=scaleIntensity(
    shifted,
    1.15
  )

  const motion=estimateMotionField(
    previous,
    current
  )

  const east=supportedMedian(
    motion,
    'eastPixels'
  )

  const north=supportedMedian(
    motion,
    'northPixels'
  )

  assert.ok(
    Math.abs(east-5)<=1,
    `expected east 5±1 under intensity scaling, got ${east}`
  )

  assert.ok(
    Math.abs(north)<=1,
    `expected north 0±1 under intensity scaling, got ${north}`
  )
})

function addDeterministicNoise(source,amplitude){
  const target=field(
    source.width,
    source.height
  )

  for(let i=0;i<source.values.length;i++){
    const v=source.values[i]

    if(!Number.isFinite(v)){
      target.values[i]=NaN
      continue
    }

    /*
     * Deterministic pseudo-noise in [-amplitude,+amplitude].
     * No randomness in validation tests.
     */
    const n=
      (((i*1103515245+12345)>>>16)&0x7fff)/
      0x7fff

    target.values[i]=
      Math.max(
        0,
        v+(n*2-1)*amplitude
      )
  }

  return target
}

test('motion field tolerates moderate deterministic noise',()=>{
  const previous=syntheticBase()

  const shifted=translate(
    previous,
    5,
    0
  )

  const current=addDeterministicNoise(
    shifted,
    3
  )

  const motion=estimateMotionField(
    previous,
    current
  )

  const east=supportedMedian(
    motion,
    'eastPixels'
  )

  const north=supportedMedian(
    motion,
    'northPixels'
  )

  assert.ok(
    Math.abs(east-5)<=1,
    `expected east 5±1 under noise, got ${east}`
  )

  assert.ok(
    Math.abs(north)<=1,
    `expected north 0±1 under noise, got ${north}`
  )
})

function maskRect(source,x0,y0,x1,y1){
  const target=field(
    source.width,
    source.height
  )

  target.values.set(source.values)

  for(let y=y0;y<y1;y++){
    for(let x=x0;x<x1;x++){
      target.values[y*target.width+x]=NaN
    }
  }

  return target
}

test('motion field leaves missing-data region unsupported',()=>{
  const previous=syntheticBase()

  const shifted=translate(
    previous,
    5,
    0
  )

  const current=maskRect(
    shifted,
    34,
    28,
    50,
    46
  )

  const motion=estimateMotionField(
    previous,
    current
  )

  let supportedIntoMissingData=0
  let supportedValid=0

  for(let y=0;y<motion.height;y++){
    for(let x=0;x<motion.width;x++){
      const index=y*motion.width+x

      if(!(motion.support?.[index]>0))continue

      /*
       * Motion vectors are anchored in the previous frame.
       * For this synthetic case the known endpoint is
       * previous position + (5,0).
       */
      const targetX=x+5
      const targetY=y

      if(
        targetX>=34 && targetX<50 &&
        targetY>=28 && targetY<46
      ){
        supportedIntoMissingData++
      }else{
        supportedValid++
      }
    }
  }

  assert.equal(
    supportedIntoMissingData,
    0,
    `expected no supported vectors whose endpoint is missing, got ${supportedIntoMissingData}`
  )

  assert.ok(
    supportedValid>0,
    'expected supported vectors with valid endpoints'
  )
})

test('motion field reports low forward-backward error for clean translation',()=>{
  const previous=syntheticBase()
  const current=translate(previous,5,0)

  const motion=estimateMotionField(
    previous,
    current
  )

  assert.ok(
    motion.forwardBackwardErrorPixels instanceof Float32Array,
    'missing forwardBackwardErrorPixels'
  )

  assert.ok(
    motion.confidence instanceof Float32Array,
    'missing confidence'
  )

  const errors=[]
  const confidences=[]

  for(let i=0;i<motion.support.length;i++){
    if(!(motion.support[i]>0))continue

    if(Number.isFinite(
      motion.forwardBackwardErrorPixels[i]
    )){
      errors.push(
        motion.forwardBackwardErrorPixels[i]
      )
    }

    if(Number.isFinite(motion.confidence[i])){
      confidences.push(motion.confidence[i])
    }
  }

  assert.ok(
    errors.length>0,
    'no forward-backward quality measurements'
  )

  assert.ok(
    confidences.length>0,
    'no confidence measurements'
  )

  const medianError=median(errors)
  const medianConfidence=median(confidences)

  assert.ok(
    medianError<=0.1,
    `expected clean median forward-backward error <=0.1 px, got ${medianError}`
  )

  assert.ok(
    medianConfidence>=0.9,
    `expected clean median confidence >=0.9, got ${medianConfidence}`
  )
})

function motionQuality(previous,current){
  const motion=estimateMotionField(
    previous,
    current
  )

  const uncertainty=[]
  let supported=0

  for(let i=0;i<motion.support.length;i++){
    if(!(motion.support[i]>0))continue

    supported++

    if(Number.isFinite(motion.uncertaintyPixels?.[i])){
      uncertainty.push(
        motion.uncertaintyPixels[i]
      )
    }
  }

  return {
    supported,
    medianUncertainty:
      uncertainty.length
        ? median(uncertainty)
        : null
  }
}

test('motion field exposes explicit uncertainty',()=>{
  const previous=syntheticBase()
  const current=translate(previous,5,0)

  const motion=estimateMotionField(
    previous,
    current
  )

  assert.ok(
    motion.uncertaintyPixels instanceof Float32Array,
    'missing uncertaintyPixels'
  )
})

test('clean translation has very low motion uncertainty',()=>{
  const previous=syntheticBase()
  const current=translate(previous,5,0)

  const q=motionQuality(previous,current)

  assert.ok(
    Number.isFinite(q.medianUncertainty),
    'missing clean uncertainty measurements'
  )

  assert.ok(
    q.medianUncertainty<=0.1,
    `expected clean median uncertainty <=0.1 px, got ${q.medianUncertainty}`
  )
})

test('deformation increases motion uncertainty',()=>{
  const previous=syntheticBase()

  const shifted=translate(
    previous,
    5,
    0
  )

  const deformed=field(
    shifted.width,
    shifted.height
  )

  deformed.values.set(shifted.values)

  setRect(deformed,48,34,64,48,45)
  setRect(deformed,30,32,42,46,38)

  const clean=motionQuality(
    previous,
    shifted
  )

  const degraded=motionQuality(
    previous,
    deformed
  )

  assert.ok(
    degraded.medianUncertainty >
      clean.medianUncertainty,
    `expected deformation uncertainty ${degraded.medianUncertainty} to exceed clean ${clean.medianUncertainty}`
  )
})

test('missing evidence reduces support rather than fabricating uncertainty',()=>{
  const previous=syntheticBase()

  const shifted=translate(
    previous,
    5,
    0
  )

  const missing=maskRect(
    shifted,
    34,
    28,
    50,
    46
  )

  const clean=motionQuality(
    previous,
    shifted
  )

  const degraded=motionQuality(
    previous,
    missing
  )

  assert.ok(
    degraded.supported < clean.supported,
    `expected missing evidence to reduce support: clean=${clean.supported}, missing=${degraded.supported}`
  )
})
