'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')
const zlib=require('node:zlib')

const {
  legendYForRgb,
  rainRateLowerBoundForLegendY,
  normalizeIpmaPcr
}=require('../lib/ipma-pcr-evidence')

const {
  rainRateToDbz
}=require('../lib/radar-normalization')


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
  /*
   * Three pixels:
   *
   *   0 transparent      -> known motion background
   *   1 opaque black     -> unavailable
   *   2 official IPMA
   *     [0,64,253]       -> physical rainfall
   */
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

test('IPMA official legend maps low and high rainfall colours',()=>{
  assert.equal(
    legendYForRgb([0,64,253]).y,
    245
  )

  assert.equal(
    legendYForRgb([255,0,255]).y,
    5
  )
})

test('IPMA legend positions resolve conservative rain-rate bounds',()=>{
  assert.equal(rainRateLowerBoundForLegendY(245),0.05)
  assert.equal(rainRateLowerBoundForLegendY(230),0.05)
  assert.equal(rainRateLowerBoundForLegendY(220),0.1)
  assert.equal(rainRateLowerBoundForLegendY(190),1)
  assert.equal(rainRateLowerBoundForLegendY(175),2)
  assert.equal(rainRateLowerBoundForLegendY(160),4)
  assert.equal(rainRateLowerBoundForLegendY(145),6)
  assert.equal(rainRateLowerBoundForLegendY(130),8)
  assert.equal(rainRateLowerBoundForLegendY(115),10)
  assert.equal(rainRateLowerBoundForLegendY(100),20)
  assert.equal(rainRateLowerBoundForLegendY(10),200)
})

test('IPMA rain-rate bounds convert through common Z-R normalization',()=>{
  const dbz=rainRateToDbz(1)
  assert.ok(Math.abs(dbz-23.01)<0.05)

  const strong=rainRateToDbz(10)
  assert.ok(Math.abs(strong-39.01)<0.05)
})

test('IPMA normalizer declares provider-neutral lower-bound semantics',()=>{
  const fs=require('node:fs')
  const path=require('node:path')

  const source=fs.readFileSync(
    path.join(__dirname,'../lib/ipma-pcr-evidence.js'),
    'utf8'
  )

  assert.ok(
    source.includes("schema:'storm-normalized-evidence/1'")
  )

  assert.ok(
    source.includes("domain:'radar'")
  )

  assert.ok(
    source.includes('values:reflectivityLowerBoundDbz')
  )

  assert.ok(
    source.includes("representation:'lower-bound'")
  )

  assert.ok(
    source.includes("derivation:'converted'")
  )

  assert.ok(
    source.includes("sourceQuantity:'rainfallRate'")
  )

  assert.ok(
    source.includes("sourceUnits:'mm/h'")
  )

  assert.ok(
    source.includes("relation:'Z=200*R^1.6'")
  )
})

test('IPMA PCR native Mercator rows are resampled to linear geographic latitude',()=>{
  const {
    sourceRowForGeographicLatitude
  }=require('../lib/ipma-pcr-evidence')

  const bounds=[
    -12.454795,
    34.011513,
    -4.345465,
    43.792862
  ]

  const height=2331

  const midLatitude=
    (bounds[1]+bounds[3])/2

  const row=
    sourceRowForGeographicLatitude(
      midLatitude,
      bounds,
      height
    )

  /*
   * A simple linear-latitude interpretation would place the geographic
   * midpoint at row 1165.5. Native PCR rows follow Mercator Y instead,
   * so the corresponding native row is farther south in the raster.
   */
  assert.ok(
    Math.abs(row-1205.75)<1
  )

  assert.ok(
    row>height/2
  )
})


test('IPMA normalizer emits motion background mask without changing scientific evidence',()=>{
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

  assert.ok(
    evidence.motionBackgroundMask instanceof Uint8Array
  )

  assert.deepEqual(
    Array.from(
      evidence.motionBackgroundMask
    ),
    [
      1,
      0,
      0
    ]
  )

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

  assert.ok(
    Number.isFinite(
      evidence.values[2]
    )
  )

  assert.ok(
    Math.abs(
      evidence.values[2] -
      rainRateToDbz(0.05)
    ) < 1e-4
  )
})
