'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  estimateTrecMotionField
}=require('../lib/storm-tracker-v3/trec-motion')

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

function base(){
  const f=field(96,96)

  setRect(f,25,25,50,32,30)
  setRect(f,30,32,44,48,42)
  setRect(f,38,48,55,57,36)
  setRect(f,50,37,60,46,48)

  return f
}

function translate(source,dx,dy){
  const target=field(
    source.width,
    source.height
  )

  for(let y=0;y<source.height;y++){
    for(let x=0;x<source.width;x++){
      const tx=x+dx
      const ty=y+dy

      if(
        tx<0 || tx>=source.width ||
        ty<0 || ty>=source.height
      )continue

      target.values[
        ty*target.width+tx
      ]=source.values[
        y*source.width+x
      ]
    }
  }

  return target
}

function median(values){
  const a=values
    .filter(Number.isFinite)
    .sort((x,y)=>x-y)

  assert.ok(a.length>0,'no finite values')

  const m=Math.floor(a.length/2)

  return a.length%2
    ? a[m]
    : (a[m-1]+a[m])/2
}

test('TREC independently recovers known five-pixel east translation',()=>{
  const previous=base()
  const current=translate(
    previous,
    5,
    0
  )

  const motion=estimateTrecMotionField(
    previous,
    current,
    {
      patchRadius:4,
      searchRadius:8,
      featureStep:4
    }
  )

  assert.equal(motion.width,96)
  assert.equal(motion.height,96)

  assert.ok(
    motion.eastPixels instanceof Float32Array
  )

  assert.ok(
    motion.northPixels instanceof Float32Array
  )

  assert.ok(
    motion.support instanceof Uint8Array
  )

  assert.ok(
    motion.correlation instanceof Float32Array
  )

  assert.ok(
    motion.margin instanceof Float32Array
  )

  const east=[]
  const north=[]
  const correlation=[]

  for(let i=0;i<motion.support.length;i++){
    if(!(motion.support[i]>0))continue

    if(
      Number.isFinite(motion.eastPixels[i]) &&
      Number.isFinite(motion.northPixels[i])
    ){
      east.push(motion.eastPixels[i])
      north.push(motion.northPixels[i])
    }

    if(Number.isFinite(motion.correlation[i])){
      correlation.push(
        motion.correlation[i]
      )
    }
  }

  assert.ok(
    east.length>0,
    'TREC produced no supported vectors'
  )

  assert.ok(
    Math.abs(median(east)-5)<=1,
    `expected median east 5±1, got ${median(east)}`
  )

  assert.ok(
    Math.abs(median(north))<=1,
    `expected median image-Y 0±1, got ${median(north)}`
  )

  assert.ok(
    median(correlation)>=0.9,
    `expected strong clean correlation, got ${median(correlation)}`
  )
})

test('motion-field downsampling preserves scaled translation',()=>{
  const {
    downsampleMotionField
  }=require('../lib/storm-tracker-v3/motion-field')

  const previous=base()
  const current=translate(
    previous,
    8,
    0
  )

  /*
   * Two 2x reductions:
   * native +8 px -> coarse +2 px
   */
  const previous4=
    downsampleMotionField(
      downsampleMotionField(previous)
    )

  const current4=
    downsampleMotionField(
      downsampleMotionField(current)
    )

  const motion=estimateTrecMotionField(
    previous4,
    current4,
    {
      patchRadius:3,
      searchRadius:4,
      featureStep:2
    }
  )

  const east=[]
  const north=[]

  for(let i=0;i<motion.support.length;i++){
    if(!(motion.support[i]>0))continue

    east.push(motion.eastPixels[i])
    north.push(motion.northPixels[i])
  }

  assert.ok(
    east.length>0,
    'downsampled TREC produced no supported vectors'
  )

  assert.ok(
    Math.abs(median(east)-2)<=1,
    `expected coarse east 2±1, got ${median(east)}`
  )

  assert.ok(
    Math.abs(median(north))<=1,
    `expected coarse image-Y 0±1, got ${median(north)}`
  )
})

test('TREC sampling grid can retain a fixed origin across patch sizes',()=>{
  const previous=base()
  const current=translate(previous,5,0)

  for(const patchRadius of [4,8,12]){
    const motion=estimateTrecMotionField(
      previous,
      current,
      {
        patchRadius,
        searchRadius:8,
        featureStep:16,
        gridOriginX:6,
        gridOriginY:6
      }
    )

    let first=null

    for(let y=0;y<motion.height&&!first;y++){
      for(let x=0;x<motion.width;x++){
        const i=y*motion.width+x

        if(motion.support[i]>0){
          first={x,y}
          break
        }
      }
    }

    assert.ok(
      first,
      `no TREC support for patchRadius ${patchRadius}`
    )

    assert.equal(
      (first.x-6)%16,
      0,
      `x grid shifted for patchRadius ${patchRadius}`
    )

    assert.equal(
      (first.y-6)%16,
      0,
      `y grid shifted for patchRadius ${patchRadius}`
    )
  }
})
