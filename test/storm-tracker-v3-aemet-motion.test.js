'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  COMPO_CLASSES,
  motionFieldFromAemetCompoEvidence
}=require('../lib/aemet-compo-evidence')

test('AEMET COMPO evidence maps correctly to motion-field semantics',()=>{
  const evidence={
    width:5,
    height:1,

    /*
     * 0   = true no-data
     * 1   = valid reflectivity below 12 dBZ
     * 2   = 12-18 dBZ
     * 5   = 30-36 dBZ
     * 255 = unrecognized palette value
     */
    classIndex:Uint8Array.from([
      0,1,2,5,255
    ]),

    values:Float32Array.from([
      NaN,
      NaN,
      12,
      30,
      NaN
    ]),

    classes:COMPO_CLASSES
  }

  const motion=
    motionFieldFromAemetCompoEvidence(
      evidence
    )

  assert.equal(motion.width,5)
  assert.equal(motion.height,1)
  assert.ok(
    motion.values instanceof Float32Array
  )

  /*
   * Motion-analysis semantics:
   *
   * class 0   -> unavailable
   * class 1   -> valid quiet/sub-threshold background
   * class 2+  -> conservative lower-bound dBZ
   * unknown   -> unavailable
   */
  assert.ok(
    Number.isNaN(motion.values[0]),
    'class 0 must remain unavailable'
  )

  assert.equal(
    motion.values[1],
    0,
    'class 1 must become valid finite background'
  )

  assert.equal(motion.values[2],12)
  assert.equal(motion.values[3],30)

  assert.ok(
    Number.isNaN(motion.values[4]),
    'unknown palette values must remain unavailable'
  )

  /*
   * Never mutate the scientific evidence field.
   */
  assert.ok(Number.isNaN(evidence.values[1]))
})
