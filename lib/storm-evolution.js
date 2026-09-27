'use strict'

/*
 * Deterministic meteorological storm evolution.
 *
 * Boundary:
 *   - owns meteorological observation history
 *   - keyed by persistent storm identity
 *   - does not perform association/tracking
 *   - does not estimate motion
 *   - does not calculate vessel-relative threat
 *   - contains no provider-specific branches
 *
 * Missing or scientifically incomparable evidence remains missing.
 */

const METHOD='deterministic-evolution-v1'

function finite(value){
  const n=Number(value)
  return Number.isFinite(n)
    ? n
    : null
}

function epochFromObservedAt(value){
  const epochMs=Date.parse(value)

  if(!Number.isFinite(epochMs)){
    throw new TypeError(
      'Evolution observation requires valid observedAt'
    )
  }

  return epochMs
}

function cloneGeometry(geometry){
  if(!geometry)return null

  return JSON.parse(
    JSON.stringify(geometry)
  )
}

function observationSnapshot(feature){
  if(
    !feature ||
    typeof feature!=='object'
  ){
    throw new TypeError(
      'Evolution observation is required'
    )
  }

  const properties=
    feature.properties||{}

  const detection=
    properties.detection||{}

  const qualification=
    detection.qualification||{}

  const reflectivity=
    properties.evidence?.reflectivity||{}

  const observedAt=
    properties.observedAt

  const epochMs=
    epochFromObservedAt(observedAt)

  return {
    epochMs,
    observedAt:
      new Date(epochMs).toISOString(),

    geometry:
      cloneGeometry(feature.geometry),

    areaKm2:
      finite(detection.areaKm2),

    detection:{
      method:
        detection.method==null
          ? null
          : String(detection.method),

      quantity:
        qualification.quantity==null
          ? null
          : String(qualification.quantity),

      operator:
        qualification.operator==null
          ? null
          : String(qualification.operator),

      thresholdDbz:
        finite(qualification.thresholdDbz)
    },

    intensity:{
      available:
        reflectivity.available===true,

      quantity:'reflectivity',

      units:
        reflectivity.units==null
          ? null
          : String(reflectivity.units),

      maxDbz:
        finite(reflectivity.maxDbz),

      representation:
        reflectivity.representation==null
          ? null
          : String(reflectivity.representation)
    }
  }
}

function sameDetectionSemantics(a,b){
  return (
    a?.detection?.method!=null &&
    b?.detection?.method!=null &&

    a.detection.method===
      b.detection.method &&

    a.detection.quantity===
      b.detection.quantity &&

    a.detection.operator===
      b.detection.operator &&

    Number.isFinite(
      a.detection.thresholdDbz
    ) &&

    Number.isFinite(
      b.detection.thresholdDbz
    ) &&

    a.detection.thresholdDbz===
      b.detection.thresholdDbz
  )
}

function comparableArea(a,b){
  return (
    sameDetectionSemantics(a,b) &&
    Number.isFinite(a?.areaKm2) &&
    Number.isFinite(b?.areaKm2)
  )
}

function comparableIntensity(a,b){
  const x=a?.intensity
  const y=b?.intensity

  return (
    sameDetectionSemantics(a,b) &&

    x?.available===true &&
    y?.available===true &&

    x.quantity!=null &&
    y.quantity!=null &&
    x.quantity===y.quantity &&

    x.units!=null &&
    y.units!=null &&
    x.units===y.units &&

    x.representation!=null &&
    y.representation!=null &&
    x.representation===
      y.representation &&

    Number.isFinite(x.maxDbz) &&
    Number.isFinite(y.maxDbz)
  )
}

function signedDirection(
  value,
  positive,
  negative
){
  const epsilon=1e-12

  if(value>epsilon)return positive
  if(value< -epsilon)return negative

  return 'steady'
}

function areaTrendBetween(a,b){
  if(!comparableArea(a,b)){
    return null
  }

  const durationMin=
    (b.epochMs-a.epochMs)/60000

  if(!(durationMin>0)){
    return null
  }

  const changeKm2=
    b.areaKm2-a.areaKm2

  const rateKm2PerMin=
    changeKm2/durationMin

  return {
    direction:
      signedDirection(
        rateKm2PerMin,
        'growing',
        'shrinking'
      ),

    fromKm2:a.areaKm2,
    toKm2:b.areaKm2,
    changeKm2,
    rateKm2PerMin,
    durationMin
  }
}

function intensityTrendBetween(a,b){
  if(!comparableIntensity(a,b)){
    return null
  }

  const durationMin=
    (b.epochMs-a.epochMs)/60000

  if(!(durationMin>0)){
    return null
  }

  const changeDbz=
    b.intensity.maxDbz -
    a.intensity.maxDbz

  const rateDbzPerMin=
    changeDbz/durationMin

  return {
    quantity:
      a.intensity.quantity,

    units:
      a.intensity.units,

    representation:
      a.intensity.representation,

    direction:
      signedDirection(
        rateDbzPerMin,
        'intensifying',
        'weakening'
      ),

    fromDbz:
      a.intensity.maxDbz,

    toDbz:
      b.intensity.maxDbz,

    changeDbz,
    rateDbzPerMin,
    durationMin
  }
}

function evolutionState(
  intensityTrend,
  areaTrend
){
  const states=[]

  if(
    intensityTrend &&
    intensityTrend.direction!=='steady'
  ){
    states.push(
      intensityTrend.direction
    )
  }

  if(
    areaTrend &&
    areaTrend.direction!=='steady'
  ){
    states.push(
      areaTrend.direction
    )
  }

  if(states.length===0){
    if(
      intensityTrend ||
      areaTrend
    ){
      return 'steady'
    }

    return 'unknown'
  }

  const unique=[
    ...new Set(states)
  ]

  return unique.length===1
    ? unique[0]
    : 'mixed'
}

function evolutionConfidence({
  observations,
  intensityTrend,
  areaTrend
}){
  if(observations<2){
    return 0
  }

  /*
   * Confidence here represents deterministic support,
   * not probability and not vessel risk.
   *
   * Half of the support comes from temporal history,
   * half from how many evolution dimensions are
   * scientifically comparable.
   */
  const historySupport=
    Math.min(
      1,
      (observations-1)/3
    )

  const comparableDimensions=
    Number(Boolean(intensityTrend)) +
    Number(Boolean(areaTrend))

  const evidenceSupport=
    comparableDimensions/2

  return Math.max(
    0,
    Math.min(
      1,
      0.5*historySupport +
      0.5*evidenceSupport
    )
  )
}

class StormEvolution {
  constructor(options={}){
    this.config={
      historyFrames:
        Math.max(
          2,
          Number.isFinite(
            Number(options.historyFrames)
          )
            ? Math.floor(
                Number(options.historyFrames)
              )
            : 8
        )
    }

    this.histories=new Map()
  }

  update(stormId,feature){
    if(
      stormId==null ||
      String(stormId).length===0
    ){
      throw new TypeError(
        'Evolution stormId is required'
      )
    }

    const id=String(stormId)

    const current=
      observationSnapshot(feature)

    const old=
      this.histories.get(id)||[]

    const sameIndex=
      old.findIndex(
        item=>
          item.epochMs===
          current.epochMs
      )

    let history

    if(sameIndex>=0){
      history=[
        ...old.slice(0,sameIndex),
        current,
        ...old.slice(sameIndex+1)
      ]
    } else {
      history=[
        ...old,
        current
      ]
    }

    history.sort(
      (a,b)=>a.epochMs-b.epochMs
    )

    history=history.slice(
      -this.config.historyFrames
    )

    this.histories.set(
      id,
      history
    )

    if(history.length<2){
      return null
    }

    const previous=
      history[history.length-2]

    const latest=
      history[history.length-1]

    if(
      previous.epochMs===
      latest.epochMs
    ){
      return null
    }

    /*
     * A replacement of the only existing timestamp
     * leaves one unique temporal observation and
     * therefore cannot constitute evolution.
     */
    if(
      old.length===1 &&
      old[0].epochMs===
        current.epochMs
    ){
      return null
    }

    const areaTrend=
      areaTrendBetween(
        previous,
        latest
      )

    const intensityTrend=
      intensityTrendBetween(
        previous,
        latest
      )

    const geometryTrend=null

    return {
      intensityTrend,
      areaTrend,
      geometryTrend,

      state:
        evolutionState(
          intensityTrend,
          areaTrend
        ),

      confidence:
        evolutionConfidence({
          observations:
            history.length,
          intensityTrend,
          areaTrend
        }),

      method:METHOD
    }
  }

  snapshot(stormId){
    const history=
      this.histories.get(
        String(stormId)
      )||[]

    return history.map(item=>({
      epochMs:item.epochMs,
      observedAt:item.observedAt,
      areaKm2:item.areaKm2,

      geometry:
        cloneGeometry(
          item.geometry
        ),

      detection:{
        ...item.detection
      },

      intensity:{
        ...item.intensity
      }
    }))
  }

  clear(stormId){
    this.histories.delete(
      String(stormId)
    )
  }
}

module.exports={
  StormEvolution,
  observationSnapshot,
  comparableArea,
  comparableIntensity,
  areaTrendBetween,
  intensityTrendBetween,
  evolutionState
}
