'use strict'

function sigmoid(x){
  if(x>=0){
    const z=Math.exp(-x)
    return 1/(1+z)
  }

  const z=Math.exp(x)
  return z/(1+z)
}

function applyPlattCalibration(
  score,
  calibration
){
  if(!Number.isFinite(score)){
    throw new TypeError(
      'score must be finite'
    )
  }

  if(!calibration || typeof calibration!=='object'){
    return null
  }

  if(calibration.validated!==true){
    return null
  }

  if(calibration.method!=='platt'){
    throw new TypeError(
      `unsupported calibration method: ${calibration.method}`
    )
  }

  const parameters=calibration.parameters

  if(
    !parameters ||
    !Number.isFinite(parameters.slope) ||
    !Number.isFinite(parameters.intercept)
  ){
    throw new TypeError(
      'validated Platt calibration requires fitted parameters'
    )
  }

  return sigmoid(
    parameters.slope*score +
    parameters.intercept
  )
}

module.exports={
  applyPlattCalibration
}
