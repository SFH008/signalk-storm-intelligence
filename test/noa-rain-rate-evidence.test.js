'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')
const sharp=require('sharp')

const {
  classForRgb,
  rainRateForClass,
  normalizeNoaRainRate
}=require('../lib/noa-rain-rate-evidence')

test('NOA official RGB values map to documented classes',()=>{
  assert.equal(classForRgb([0,0,0]),1)
  assert.equal(classForRgb([0,0,64]),2)
  assert.equal(classForRgb([0,192,128]),11)
  assert.equal(classForRgb([255,0,0]),25)
  assert.equal(classForRgb([255,0,255]),32)

  assert.equal(classForRgb([1,2,3]),null)
})

test('NOA class values reproduce official rainfall formula',()=>{
  assert.equal(rainRateForClass(1),0)

  assert.ok(
    Math.abs(rainRateForClass(32)-200)<1e-10
  )

  assert.ok(
    Math.abs(rainRateForClass(2)-0.249927)<0.001
  )

  assert.ok(
    Number.isNaN(rainRateForClass(0))
  )
})

test('NOA native RGB PNG normalizes to reflectivity estimate',async()=>{
  const png=await sharp({
    create:{
      width:3,
      height:1,
      channels:4,
      background:{r:0,g:0,b:0,alpha:0}
    }
  })
    .composite([
      {
        input:Buffer.from([
          0,0,64,255,
          255,0,255,255,
          0,0,0,255
        ]),
        raw:{
          width:3,
          height:1,
          channels:4
        },
        left:0,
        top:0
      }
    ])
    .png()
    .toBuffer()

  const field=await normalizeNoaRainRate(
    png,
    {
      bounds:[22.4706,36.9888,25.2987,39.0912],
      observedAt:'2026-09-23T18:35:45.000Z'
    }
  )

  assert.equal(field.schema,'storm-normalized-evidence/1')
  assert.equal(field.domain,'radar')
  assert.equal(field.quantity,'reflectivity')
  assert.equal(field.units,'dBZ')
  assert.equal(
    field.provenance.representation,
    'derived-reflectivity-estimate'
  )

  assert.equal(field.width,3)
  assert.equal(field.height,1)

  assert.equal(field.values,field.reflectivityDbz)

  assert.deepEqual(
    field.valueSemantics,
    {
      representation:'estimate',
      derivation:'converted',
      sourceQuantity:'rainfallRate',
      sourceUnits:'mm/h',
      intervalSemantics:null,
      conversion:{
        method:'marshall-palmer-z-r',
        relation:'Z=200*R^1.6'
      }
    }
  )

  assert.ok(Number.isFinite(field.reflectivityDbz[0]))
  assert.ok(Number.isFinite(field.reflectivityDbz[1]))
  assert.ok(Number.isNaN(field.reflectivityDbz[2]))

  assert.equal(field.availability.physicalPixels,2)
  assert.equal(field.availability.unavailablePixels,1)
})
