'use strict'

function validateKnownBoolean(value,name){
  if(value===null || value===undefined){
    return false
  }

  if(typeof value!=='boolean'){
    throw new TypeError(
      `${name} must be boolean or null`
    )
  }

  return true
}

function safeDivide(numerator,denominator){
  return denominator>0
    ? numerator/denominator
    : null
}

function evaluateBinaryClassification(rows=[]){
  let tp=0
  let tn=0
  let fp=0
  let fn=0
  let excluded=0

  for(const row of rows){
    const truthKnown=
      validateKnownBoolean(
        row?.truth,
        'truth'
      )

    const predictionKnown=
      validateKnownBoolean(
        row?.predicted,
        'predicted'
      )

    if(!truthKnown || !predictionKnown){
      excluded++
      continue
    }

    if(row.truth===true && row.predicted===true){
      tp++
    }else if(
      row.truth===true &&
      row.predicted===false
    ){
      fn++
    }else if(
      row.truth===false &&
      row.predicted===true
    ){
      fp++
    }else{
      tn++
    }
  }

  const evaluated=tp+tn+fp+fn

  return {
    evaluated,
    excluded,

    tp,
    tn,
    fp,
    fn,

    precision:
      safeDivide(tp,tp+fp),

    recall:
      safeDivide(tp,tp+fn),

    falsePositiveRate:
      safeDivide(fp,fp+tn),

    falseNegativeRate:
      safeDivide(fn,fn+tp)
  }
}


function validateProbability(value){
  if(value===null || value===undefined){
    return false
  }

  if(
    !Number.isFinite(value) ||
    value<0 ||
    value>1
  ){
    throw new TypeError(
      'probability must be within [0,1] or null'
    )
  }

  return true
}

function brierScore(rows=[]){
  let sum=0
  let evaluated=0
  let excluded=0

  for(const row of rows){
    const truthKnown=
      validateKnownBoolean(
        row?.truth,
        'truth'
      )

    const probabilityKnown=
      validateProbability(
        row?.probability
      )

    if(!truthKnown || !probabilityKnown){
      excluded++
      continue
    }

    const y=row.truth ? 1 : 0
    const p=row.probability

    sum+=(p-y)**2
    evaluated++
  }

  return {
    evaluated,
    excluded,
    score:
      evaluated>0
        ? sum/evaluated
        : null
  }
}

function calibrationBins(rows=[],binCount=10){
  if(
    !Number.isInteger(binCount) ||
    binCount<1
  ){
    throw new TypeError(
      'binCount must be a positive integer'
    )
  }

  const bins=Array.from(
    {length:binCount},
    (_,index)=>({
      index,
      lower:index/binCount,
      upper:(index+1)/binCount,
      count:0,
      meanProbability:null,
      observedRate:null,
      _probabilitySum:0,
      _truthSum:0
    })
  )

  for(const row of rows){
    const truthKnown=
      validateKnownBoolean(
        row?.truth,
        'truth'
      )

    const probabilityKnown=
      validateProbability(
        row?.probability
      )

    if(!truthKnown || !probabilityKnown){
      continue
    }

    const p=row.probability

    const index=Math.min(
      binCount-1,
      Math.floor(p*binCount)
    )

    const bin=bins[index]

    bin.count++
    bin._probabilitySum+=p
    bin._truthSum+=row.truth ? 1 : 0
  }

  for(const bin of bins){
    if(bin.count>0){
      bin.meanProbability=
        bin._probabilitySum/bin.count

      bin.observedRate=
        bin._truthSum/bin.count
    }

    delete bin._probabilitySum
    delete bin._truthSum
  }

  return bins
}

module.exports={
  evaluateBinaryClassification,
  safeDivide,
  brierScore,
  calibrationBins
}
