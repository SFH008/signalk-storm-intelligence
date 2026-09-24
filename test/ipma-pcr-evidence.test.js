'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  legendYForRgb,
  rainRateLowerBoundForLegendY
}=require('../lib/ipma-pcr-evidence')

const {
  rainRateToDbz
}=require('../lib/radar-normalization')

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
