'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  sampleMotionField
}=require('../lib/storm-tracker-v3/motion-interpolation')

function sparseField({
  width=64,
  height=64,
  step=16,
  dx=5,
  dy=-2,
  uncertainty=1
}={}){
  const size=width*height

  const eastPixels=new Float32Array(size)
  const northPixels=new Float32Array(size)
  const support=new Uint8Array(size)
  const uncertaintyPixels=new Float32Array(size)

  eastPixels.fill(NaN)
  northPixels.fill(NaN)
  uncertaintyPixels.fill(NaN)

  for(let y=6;y<height;y+=step){
    for(let x=6;x<width;x+=step){
      const i=y*width+x

      support[i]=1
      eastPixels[i]=dx
      northPixels[i]=dy
      uncertaintyPixels[i]=uncertainty
    }
  }

  return {
    width,
    height,
    eastPixels,
    northPixels,
    support,
    uncertaintyPixels
  }
}

test('interpolation recovers uniform motion between sparse LK samples',()=>{
  const motion=sparseField()

  const sampled=sampleMotionField(
    motion,
    25,
    25,
    {
      radius:20,
      minSamples:3
    }
  )

  assert.equal(sampled.supported,true)

  assert.ok(
    Math.abs(sampled.dx-5)<1e-6
  )

  assert.ok(
    Math.abs(sampled.dy+2)<1e-6
  )

  assert.ok(
    Number.isFinite(sampled.uncertaintyPixels)
  )
})

test('interpolation remains unsupported without enough nearby evidence',()=>{
  const motion=sparseField()

  /*
   * Remove all support.
   */
  motion.support.fill(0)

  const sampled=sampleMotionField(
    motion,
    25,
    25,
    {
      radius:20,
      minSamples:3
    }
  )

  assert.deepEqual(
    sampled,
    {
      supported:false,
      dx:null,
      dy:null,
      uncertaintyPixels:null,
      samples:0
    }
  )
})

test('interpolation is robust to one extreme local outlier',()=>{
  const motion=sparseField()

  /*
   * Corrupt one nearby supported vector.
   */
  const x=22
  const y=22
  const i=y*motion.width+x

  assert.equal(motion.support[i],1)

  motion.eastPixels[i]=80
  motion.northPixels[i]=80

  const sampled=sampleMotionField(
    motion,
    25,
    25,
    {
      radius:24,
      minSamples:3
    }
  )

  assert.equal(sampled.supported,true)

  assert.ok(
    Math.abs(sampled.dx-5)<2,
    `unexpected dx ${sampled.dx}`
  )

  assert.ok(
    Math.abs(sampled.dy+2)<2,
    `unexpected dy ${sampled.dy}`
  )
})

test('interpolation uncertainty rises when nearby vectors disagree',()=>{
  const clean=sparseField()
  const noisy=sparseField()

  const i=22*noisy.width+22

  noisy.eastPixels[i]=15
  noisy.northPixels[i]=8

  const a=sampleMotionField(
    clean,
    25,
    25,
    {
      radius:24,
      minSamples:3
    }
  )

  const b=sampleMotionField(
    noisy,
    25,
    25,
    {
      radius:24,
      minSamples:3
    }
  )

  assert.equal(a.supported,true)
  assert.equal(b.supported,true)

  assert.ok(
    b.uncertaintyPixels >
    a.uncertaintyPixels
  )
})
