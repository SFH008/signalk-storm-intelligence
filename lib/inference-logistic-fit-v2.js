'use strict'

function sigmoid(x){
  if(x>=0){
    const z=Math.exp(-x)
    return 1/(1+z)
  }

  const z=Math.exp(x)
  return z/(1+z)
}

function validateFeatureSchema(featureSchema){
  if(!Array.isArray(featureSchema) || !featureSchema.length){
    throw new TypeError('featureSchema required')
  }

  const seen=new Set()

  for(const name of featureSchema){
    if(typeof name!=='string' || !name){
      throw new TypeError('invalid feature name')
    }

    if(seen.has(name)){
      throw new TypeError(
        `duplicate feature: ${name}`
      )
    }

    seen.add(name)
  }
}

function validateRows(featureSchema,rows){
  if(!Array.isArray(rows) || !rows.length){
    throw new TypeError('training rows required')
  }

  return rows.map((row,index)=>{
    if(typeof row?.target!=='boolean'){
      throw new TypeError(
        `target must be boolean at row ${index}`
      )
    }

    const x=[]

    for(const name of featureSchema){
      const value=row?.features?.[name]

      if(
        value===null ||
        value===undefined ||
        value==='' ||
        !Number.isFinite(Number(value))
      ){
        throw new TypeError(
          `missing feature: ${name}`
        )
      }

      x.push(Number(value))
    }

    return {
      x,
      y:row.target ? 1 : 0
    }
  })
}

function logisticLoss(rows,intercept,weights){
  let loss=0

  for(const row of rows){
    let z=intercept

    for(let j=0;j<weights.length;j++){
      z+=weights[j]*row.x[j]
    }

    const p=sigmoid(z)

    /*
     * Numerically bounded only for log evaluation.
     * The model probability itself is not clamped.
     */
    const q=Math.max(
      Number.EPSILON,
      Math.min(1-Number.EPSILON,p)
    )

    loss-=(
      row.y*Math.log(q) +
      (1-row.y)*Math.log(1-q)
    )
  }

  return loss/rows.length
}

function fitLogisticRegression({
  featureSchema,
  rows,
  learningRate=0.05,
  maxIterations=1000,
  tolerance=1e-8
}={}){
  validateFeatureSchema(featureSchema)

  if(!(Number.isFinite(learningRate) && learningRate>0)){
    throw new TypeError(
      'learningRate must be positive'
    )
  }

  if(
    !Number.isInteger(maxIterations) ||
    maxIterations<1
  ){
    throw new TypeError(
      'maxIterations must be a positive integer'
    )
  }

  if(!(Number.isFinite(tolerance) && tolerance>=0)){
    throw new TypeError(
      'tolerance must be non-negative'
    )
  }

  const trainingRows=
    validateRows(featureSchema,rows)

  let intercept=0
  const weights=
    featureSchema.map(()=>0)

  let previousLoss=
    logisticLoss(
      trainingRows,
      intercept,
      weights
    )

  let iterations=0
  let converged=false

  for(let iteration=1;iteration<=maxIterations;iteration++){
    let interceptGradient=0
    const gradients=
      featureSchema.map(()=>0)

    for(const row of trainingRows){
      let z=intercept

      for(let j=0;j<weights.length;j++){
        z+=weights[j]*row.x[j]
      }

      const error=sigmoid(z)-row.y

      interceptGradient+=error

      for(let j=0;j<weights.length;j++){
        gradients[j]+=
          error*row.x[j]
      }
    }

    const n=trainingRows.length

    intercept-=
      learningRate*(interceptGradient/n)

    for(let j=0;j<weights.length;j++){
      weights[j]-=
        learningRate*(gradients[j]/n)
    }

    const loss=
      logisticLoss(
        trainingRows,
        intercept,
        weights
      )

    iterations=iteration

    if(
      Math.abs(previousLoss-loss)
      <= tolerance
    ){
      converged=true
      previousLoss=loss
      break
    }

    previousLoss=loss
  }

  const coefficients={
    intercept
  }

  for(let i=0;i<featureSchema.length;i++){
    coefficients[featureSchema[i]]=
      weights[i]
  }

  return {
    featureSchema:[...featureSchema],
    coefficients,
    calibration:null,

    training:{
      method:'batch-gradient-descent',
      calibrated:false,
      deterministic:true,
      samples:trainingRows.length,
      learningRate,
      maxIterations,
      tolerance,
      iterations,
      converged,
      finalLoss:previousLoss
    }
  }
}

module.exports={
  fitLogisticRegression
}
