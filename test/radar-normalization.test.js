'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  rainRateToDbz
}=require('../lib/radar-normalization')

function close(actual,expected,tolerance=0.05) {
  assert.ok(
    Math.abs(actual-expected)<=tolerance,
    `${actual} not within ${tolerance} of ${expected}`
  )
}

test('Marshall-Palmer rain rate converts to dBZ',()=>{
  close(rainRateToDbz(0.5),18.19)
  close(rainRateToDbz(1),23.01)
  close(rainRateToDbz(2),27.83)
  close(rainRateToDbz(10),39.01)
  close(rainRateToDbz(100),55.01)
})

test('non-positive or missing rain rate remains unavailable',()=>{
  assert.ok(Number.isNaN(rainRateToDbz(0)))
  assert.ok(Number.isNaN(rainRateToDbz(-1)))
  assert.ok(Number.isNaN(rainRateToDbz(NaN)))
})

test('alternative Z-R coefficients remain explicit',()=>{
  const value=rainRateToDbz(10,{a:300,b:1.4})
  close(value,38.77)
})
