'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  motionFieldFromIpmaPcrEvidence
}=require('../lib/ipma-pcr-evidence')

test('IPMA PCR evidence maps correctly to motion-field semantics',()=>{
  const evidence={
    width:4,
    height:1,

    classIndex:Uint8Array.from([
      0,    // transparent background
      1,    // opaque black / unavailable
      11,   // valid weak precipitation
      33    // valid precipitation
    ]),

    values:Float32Array.from([
      NaN,
      NaN,
      2.19382,
      18.19382
    ]),

    paletteMappings:[
      {
        index:0,
        available:false,
        alpha:0
      },
      {
        index:1,
        available:false,
        alpha:255,
        rgb:[0,0,0]
      },
      {
        index:11,
        available:true
      },
      {
        index:33,
        available:true
      }
    ]
  }

  const motion=
    motionFieldFromIpmaPcrEvidence(
      evidence
    )

  assert.equal(motion.width,4)
  assert.equal(motion.height,1)

  assert.ok(
    motion.values instanceof Float32Array
  )

  /*
   * Transparent PCR background is valid no-echo
   * for motion estimation.
   */
  assert.equal(
    motion.values[0],
    0
  )

  /*
   * Opaque black remains unavailable.
   */
  assert.ok(
    Number.isNaN(motion.values[1])
  )

  /*
   * Physical precipitation retains normalized
   * conservative reflectivity.
   */
  assert.ok(
    Math.abs(motion.values[2]-2.19382)<1e-4
  )

  assert.ok(
    Math.abs(motion.values[3]-18.19382)<1e-4
  )

  /*
   * Scientific evidence must not be mutated.
   */
  assert.ok(
    Number.isNaN(evidence.values[0])
  )
})
