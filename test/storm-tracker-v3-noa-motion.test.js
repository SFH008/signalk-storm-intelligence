'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')
const sharp=require('sharp')

const {
  normalizeNoaRainRate
}=require('../lib/noa-rain-rate-evidence')

const {
  motionFrameFromNormalizedRadarEvidence
}=require('../lib/storm-tracker-v3/radar-motion-frame')

test('NOA normalized evidence produces generic motion semantics',async()=>{
  const png=await sharp(
    Buffer.from([
      0,0,0,255,       // class 1: known zero rain
      1,2,3,255,       // unknown
      255,255,255,0,   // unavailable
      0,0,64,255       // finite rain
    ]),
    {
      raw:{
        width:4,
        height:1,
        channels:4
      }
    }
  ).png().toBuffer()

  const evidence=await normalizeNoaRainRate(png,{
    bounds:[22.4706,36.9888,25.2987,39.0912],
    observedAt:'2026-09-23T18:35:45.000Z'
  })

  const motion=
    motionFrameFromNormalizedRadarEvidence(evidence)

  assert.equal(motion.values[0],0)
  assert.ok(Number.isNaN(motion.values[1]))
  assert.ok(Number.isNaN(motion.values[2]))
  assert.equal(motion.values[3],evidence.values[3])
})

