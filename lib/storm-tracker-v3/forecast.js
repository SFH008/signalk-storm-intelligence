'use strict'

const {
  advectGeographicGeometry
}=require('./geometry-advection')


const DEFAULT_HORIZONS_MINUTES=
  Object.freeze([
    5,
    10,
    20,
    30
  ])


function finitePositive(value){
  return (
    Number.isFinite(value) &&
    value>0
  )
}


function scaledArray(
  values,
  factor
){
  if(!values){
    return values
  }

  return Float64Array.from(
    values,
    value=>
      Number.isFinite(value)
        ? value*factor
        : value
  )
}


function scaledMotionField(
  motion,
  factor
){
  if(
    !motion ||
    !Number.isInteger(motion.width) ||
    !Number.isInteger(motion.height)
  ){
    throw new TypeError(
      'motion field is required'
    )
  }

  return {
    ...motion,

    eastPixels:
      scaledArray(
        motion.eastPixels,
        factor
      ),

    northPixels:
      scaledArray(
        motion.northPixels,
        factor
      ),

    uncertaintyPixels:
      scaledArray(
        motion.uncertaintyPixels,
        factor
      )
  }
}


function projectHazardGeometry({
  geometry,
  field,
  motion,
  baseIntervalMinutes,
  horizonsMinutes=
    DEFAULT_HORIZONS_MINUTES,
  advectionOptions={}
}={}){
  if(
    !finitePositive(
      baseIntervalMinutes
    )
  ){
    throw new TypeError(
      'positive baseIntervalMinutes is required'
    )
  }

  if(
    !Array.isArray(horizonsMinutes) ||
    !horizonsMinutes.length ||
    horizonsMinutes.some(
      value=>
        !finitePositive(value)
    )
  ){
    throw new TypeError(
      'positive forecast horizons are required'
    )
  }

  return horizonsMinutes.map(
    horizonMinutes=>{
      const factor=
        horizonMinutes/
        baseIntervalMinutes

      const scaledMotion=
        scaledMotionField(
          motion,
          factor
        )

      const prediction=
        advectGeographicGeometry(
          geometry,
          field,
          scaledMotion,
          advectionOptions
        )

      return {
        horizonMinutes,
        factor,

        supported:
          prediction.supported,

        geometry:
          prediction.geometry,

        uncertaintyPixels:
          prediction.uncertaintyPixels,

        support:
          prediction.support ?? null
      }
    }
  )
}


module.exports={
  DEFAULT_HORIZONS_MINUTES,
  projectHazardGeometry
}
