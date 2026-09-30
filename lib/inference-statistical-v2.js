'use strict'

const {
  applyPlattCalibration
}=require('./inference-calibration-v2')

function sigmoid(x){
  return 1/(1+Math.exp(-x))
}

function requireFeatures(featureSchema,features){
  for(const name of featureSchema){
    const value=features?.[name]

    if(
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ){
      throw new Error(`missing feature: ${name}`)
    }
  }
}

function createLogisticInferenceModel({
  id,
  version,
  checksum=null,
  featureSchema=[],
  coefficients={},
  calibration=null
}={}){
  if(!id)throw new Error('model id required')
  if(!version)throw new Error('model version required')
  if(!Array.isArray(featureSchema) || !featureSchema.length){
    throw new Error('featureSchema required')
  }

  return {
    id,
    type:'statistical',
    version,
    stages:['observation'],

    async infer(context={}){
      const features=context.features || {}

      requireFeatures(featureSchema,features)

      let z=Number(coefficients.intercept ?? 0)

      for(const name of featureSchema){
        const coefficient=Number(coefficients[name] ?? 0)
        z+=coefficient*Number(features[name])
      }

      const modelScore=sigmoid(z)

      const probability=
        calibration?.validated === true
          ? applyPlattCalibration(
              modelScore,
              calibration
            )
          : null

      const calibrated=
        probability!==null

      return {
        modelScore,
        probability,
        calibrated,
        classification:{},
        model:{
          id,
          type:'statistical',
          version,
          checksum,
          featureSchema:[...featureSchema],
          calibration:calibration
            ? {...calibration}
            : null
        },
        provenance:{
          method:'logistic-regression'
        }
      }
    }
  }
}

module.exports={
  sigmoid,
  requireFeatures,
  createLogisticInferenceModel
}
