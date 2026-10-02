'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')
const zlib=require('node:zlib')

const {
  normalizeIpmaPcr
}=require('../lib/ipma-pcr-evidence')

const {
  motionFrameFromNormalizedRadarEvidence
}=require('../lib/storm-tracker-v3/radar-motion-frame')


function crc32(buffer) {
  let crc=0xffffffff

  for(const byte of buffer) {
    crc^=byte

    for(let bit=0;bit<8;bit++) {
      crc=
        (crc>>>1) ^
        ((crc&1) ? 0xedb88320 : 0)
    }
  }

  return (crc^0xffffffff)>>>0
}

function pngChunk(type,data) {
  const name=Buffer.from(type)
  const length=Buffer.alloc(4)
  const checksum=Buffer.alloc(4)

  length.writeUInt32BE(data.length)

  checksum.writeUInt32BE(
    crc32(
      Buffer.concat([
        name,
        data
      ])
    )
  )

  return Buffer.concat([
    length,
    name,
    data,
    checksum
  ])
}

function tinyIndexedIpmaPng() {
  const ihdr=Buffer.alloc(13)

  ihdr.writeUInt32BE(3,0)
  ihdr.writeUInt32BE(1,4)
  ihdr[8]=8
  ihdr[9]=3

  const palette=Buffer.from([
    255,255,255,
    0,0,0,
    0,64,253
  ])

  const transparency=Buffer.from([
    0,
    255,
    255
  ])

  const raw=Buffer.from([
    0,
    0,1,2
  ])

  return Buffer.concat([
    Buffer.from([
      137,80,78,71,13,10,26,10
    ]),
    pngChunk('IHDR',ihdr),
    pngChunk('PLTE',palette),
    pngChunk('tRNS',transparency),
    pngChunk(
      'IDAT',
      zlib.deflateSync(raw)
    ),
    pngChunk(
      'IEND',
      Buffer.alloc(0)
    )
  ])
}

test('IPMA normalized evidence produces the validated generic motion semantics',()=>{
  const evidence=
    normalizeIpmaPcr(
      tinyIndexedIpmaPng(),
      {
        bounds:[
          -10,
          35,
          -9,
          36
        ],
        observedAt:
          '2026-09-20T22:45:00Z'
      }
    )

  const motion=
    motionFrameFromNormalizedRadarEvidence(
      evidence
    )

  assert.equal(motion.width,3)
  assert.equal(motion.height,1)

  assert.equal(
    motion.values[0],
    0
  )

  assert.ok(
    Number.isNaN(
      motion.values[1]
    )
  )

  assert.ok(
    Number.isFinite(
      motion.values[2]
    )
  )

  assert.equal(
    motion.values[2],
    evidence.values[2]
  )

  /*
   * Motion adaptation must not mutate normalized scientific evidence.
   */
  assert.ok(
    Number.isNaN(
      evidence.values[0]
    )
  )

  assert.ok(
    Number.isNaN(
      evidence.values[1]
    )
  )
})
