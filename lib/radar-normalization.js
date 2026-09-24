'use strict'

const DEFAULT_ZR_A = 200
const DEFAULT_ZR_B = 1.6

function rainRateToDbz(rainRateMmPerHour,options={}) {
  const rate=Number(rainRateMmPerHour)

  if(!Number.isFinite(rate) || rate<=0) {
    return NaN
  }

  const a=Number(options.a ?? DEFAULT_ZR_A)
  const b=Number(options.b ?? DEFAULT_ZR_B)

  if(!Number.isFinite(a) || a<=0) {
    throw new TypeError('Z-R coefficient a must be positive')
  }

  if(!Number.isFinite(b) || b<=0) {
    throw new TypeError('Z-R exponent b must be positive')
  }

  const z=a*Math.pow(rate,b)

  return 10*Math.log10(z)
}

module.exports={
  DEFAULT_ZR_A,
  DEFAULT_ZR_B,
  rainRateToDbz
}
