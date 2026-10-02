'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const sharp=require('sharp')

const {
  COMPO_CLASSES,
  normalizeAemetCompo
}=require('../lib/aemet-compo-evidence')

const {
  motionFrameFromNormalizedRadarEvidence
}=require('../lib/storm-tracker-v3/radar-motion-frame')

test('AEMET COMPO evidence maps correctly to generic motion-frame semantics',()=>{
  const evidence={
    schema:'storm-normalized-evidence/1',
    domain:'radar',
    quantity:'reflectivity',
    units:'dBZ',
    width:5,
    height:1,

    values:Float32Array.from([
      NaN,
      NaN,
      12,
      30,
      NaN
    ]),

    motionBackgroundMask:Uint8Array.from([
      0,1,0,0,0
    ])
  }

  const motion=
    motionFrameFromNormalizedRadarEvidence(
      evidence
    )

  assert.equal(motion.width,5)
  assert.equal(motion.height,1)
  assert.ok(
    motion.values instanceof Float32Array
  )

  assert.ok(Number.isNaN(motion.values[0]))
  assert.equal(motion.values[1],0)
  assert.equal(motion.values[2],12)
  assert.equal(motion.values[3],30)
  assert.ok(Number.isNaN(motion.values[4]))

  /*
   * Never mutate the scientific evidence field.
   */
  assert.ok(Number.isNaN(evidence.values[1]))
})


test('AEMET normalizer exposes provider-neutral motion background mask',async()=>{
  const pixels=[
    ...COMPO_CLASSES[0].rgb,   // true no-data
    ...COMPO_CLASSES[1].rgb,   // valid quiet background
    ...COMPO_CLASSES[2].rgb,   // 12 dBZ
    ...COMPO_CLASSES[5].rgb,   // 30 dBZ
    1,2,3                     // unknown palette value
  ]

  const buffer=
    await sharp(
      Buffer.from(pixels),
      {
        raw:{
          width:5,
          height:1,
          channels:3
        }
      }
    )
      .png()
      .toBuffer()

  const evidence=
    await normalizeAemetCompo(
      buffer,
      {
        bounds:[-10,35,-5,40],
        observedAt:Date.parse(
          '2026-09-30T10:00:00Z'
        )
      }
    )

  assert.ok(
    evidence.motionBackgroundMask instanceof Uint8Array
  )

  assert.deepEqual(
    Array.from(evidence.motionBackgroundMask),
    [0,1,0,0,0]
  )

  /*
   * Scientific evidence remains unchanged:
   * class 1 is below the quantified reflectivity range,
   * not fabricated as 0 dBZ.
   */
  assert.ok(Number.isNaN(evidence.values[0]))
  assert.ok(Number.isNaN(evidence.values[1]))
  assert.equal(evidence.values[2],12)
  assert.equal(evidence.values[3],30)
  assert.ok(Number.isNaN(evidence.values[4]))
})
