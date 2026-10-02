'use strict'

const METHOD='storm-severity-v1'

const WEIGHTS={
  radarIntensity:0.30,
  stormSize:0.10,
  morphology:0.20,
  evolution:0.20,
  lightning:0.20
}

function clamp01(value){
  return Math.max(0,Math.min(1,value))
}

function interpolate(value,points){
  if(!Number.isFinite(value)){
    return null
  }

  if(value<=points[0][0]){
    return points[0][1]
  }

  for(let i=1;i<points.length;i++){
    const [x1,y1]=points[i-1]
    const [x2,y2]=points[i]

    if(value<=x2){
      const f=(value-x1)/(x2-x1)
      return y1+f*(y2-y1)
    }
  }

  return points[points.length-1][1]
}

function radarIntensityScore(observation){
  const dbz=
    Number(
      observation
        ?.properties
        ?.evidence
        ?.reflectivity
        ?.maxDbz
    )

  if(!Number.isFinite(dbz)){
    return null
  }

  return interpolate(dbz,[
    [24,0.00],
    [30,0.20],
    [36,0.40],
    [42,0.60],
    [48,0.80],
    [54,0.90],
    [60,1.00]
  ])
}

function stormSizeScore(observation){
  const properties=
    observation?.properties||{}

  const area=
    Number(
      properties.combinedAreaKm2 ??
      properties.detection?.areaKm2
    )

  if(!Number.isFinite(area)){
    return null
  }

  return interpolate(area,[
    [25,0.00],
    [50,0.20],
    [100,0.40],
    [250,0.65],
    [500,0.85],
    [1000,1.00]
  ])
}

function geometryBounds(geometry){
  if(
    !geometry ||
    !['Polygon','MultiPolygon'].includes(
      geometry.type
    )
  ){
    return null
  }

  let minLon=Infinity
  let minLat=Infinity
  let maxLon=-Infinity
  let maxLat=-Infinity

  function visit(point){
    const lon=Number(point?.[0])
    const lat=Number(point?.[1])

    if(
      !Number.isFinite(lon) ||
      !Number.isFinite(lat)
    ){
      return
    }

    minLon=Math.min(minLon,lon)
    maxLon=Math.max(maxLon,lon)
    minLat=Math.min(minLat,lat)
    maxLat=Math.max(maxLat,lat)
  }

  if(geometry.type==='Polygon'){
    for(const ring of geometry.coordinates||[]){
      for(const point of ring){
        visit(point)
      }
    }
  }else{
    for(const polygon of geometry.coordinates||[]){
      for(const ring of polygon){
        for(const point of ring){
          visit(point)
        }
      }
    }
  }

  if(
    !Number.isFinite(minLon) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLon) ||
    !Number.isFinite(maxLat)
  ){
    return null
  }

  return {
    minLon,
    minLat,
    maxLon,
    maxLat
  }
}

function elongationScore(observation){
  const bounds=
    geometryBounds(observation?.geometry)

  if(!bounds){
    return null
  }

  const meanLat=
    (bounds.minLat+bounds.maxLat)/2

  const heightKm=
    Math.abs(
      bounds.maxLat-bounds.minLat
    )*111.32

  const widthKm=
    Math.abs(
      bounds.maxLon-bounds.minLon
    )*
    111.32*
    Math.cos(meanLat*Math.PI/180)

  if(!(widthKm>0) || !(heightKm>0)){
    return null
  }

  const aspect=
    Math.max(widthKm,heightKm)/
    Math.min(widthKm,heightKm)

  return interpolate(aspect,[
    [1.5,0.00],
    [2,0.25],
    [3,0.50],
    [5,0.75],
    [8,1.00]
  ])
}

function memberOrganizationScore(observation){
  const count=
    Number(
      observation
        ?.properties
        ?.memberCount
    )

  if(!Number.isFinite(count) || count<1){
    return null
  }

  return interpolate(count,[
    [1,0.20],
    [2,0.35],
    [3,0.50],
    [4,0.65],
    [5,0.80],
    [6,1.00]
  ])
}

function morphologyScore(observation){
  const organization=
    memberOrganizationScore(observation)

  const elongation=
    elongationScore(observation)

  if(
    organization===null &&
    elongation===null
  ){
    return null
  }

  if(organization===null){
    return elongation
  }

  if(elongation===null){
    return organization
  }

  return (
    0.75*organization +
    0.25*elongation
  )
}

function evolutionScore(evolution){
  if(!evolution || typeof evolution!=='object'){
    return null
  }

  const intensity=
    evolution.intensityTrend

  const area=
    evolution.areaTrend

  let intensityScore=null
  let areaScore=null

  if(
    intensity &&
    Number.isFinite(
      Number(intensity.rateDbzPerMin)
    )
  ){
    intensityScore=
      interpolate(
        Number(intensity.rateDbzPerMin),
        [
          [-1.0,0.00],
          [-0.5,0.25],
          [ 0.0,0.50],
          [ 0.5,0.75],
          [ 1.0,1.00]
        ]
      )
  }

  if(
    area &&
    Number.isFinite(
      Number(area.rateKm2PerMin)
    ) &&
    Number.isFinite(
      Number(area.fromKm2)
    ) &&
    Number(area.fromKm2)>0
  ){
    const fractionalRate=
      Number(area.rateKm2PerMin)/
      Number(area.fromKm2)

    areaScore=
      interpolate(
        fractionalRate,
        [
          [-0.05,0.00],
          [-0.025,0.25],
          [ 0.00,0.50],
          [ 0.025,0.75],
          [ 0.05,1.00]
        ]
      )
  }

  if(
    intensityScore===null &&
    areaScore===null
  ){
    return null
  }

  if(intensityScore===null){
    return areaScore
  }

  if(areaScore===null){
    return intensityScore
  }

  return (
    0.70*intensityScore +
    0.30*areaScore
  )
}

function lightningScore(lightning){
  if(
    !lightning ||
    typeof lightning!=='object' ||
    lightning.available!==true
  ){
    return null
  }

  const count10=
    Number(lightning.count10min)

  const rate=
    Number(lightning.ratePerMinute)

  const associated=
    Number(lightning.countAssociated)

  const validCount10=
    Number.isFinite(count10)
      ? Math.max(0,count10)
      : 0

  const validRate=
    Number.isFinite(rate)
      ? Math.max(0,rate)
      : 0

  const validAssociated=
    Number.isFinite(associated)
      ? Math.max(0,associated)
      : 0

  /*
   * Valid coverage with no lightning is positive evidence
   * for zero lightning contribution.
   */
  if(
    validCount10===0 &&
    validRate===0 &&
    validAssociated===0 &&
    lightning.jump?.detected!==true
  ){
    return 0
  }

  const count10Score=
    clamp01(validCount10/50)

  const rateScore=
    clamp01(validRate/8)

  const jumpScore=
    lightning.jump?.detected===true
      ? 1
      : 0

  const trendScore=
    lightning.trend==='increasing'
      ? 1
      : lightning.trend==='steady'
        ? 0.5
        : lightning.trend==='decreasing'
          ? 0
          : 0

  const associationScore=
    clamp01(validAssociated/50)

  return clamp01(
    0.35*count10Score +
    0.25*rateScore +
    0.20*jumpScore +
    0.10*trendScore +
    0.10*associationScore
  )
}


function component(score){
  return score===null
    ? {
        score:null,
        available:false
      }
    : {
        score:clamp01(score),
        available:true
      }
}

function levelForScore(score){
  if(score<0.20)return 1
  if(score<0.40)return 2
  if(score<0.60)return 3
  if(score<0.80)return 4
  return 5
}

function calculateStormSeverityV1(
  observation,
  evolution=null,
  lightning=null
){
  const components={
    radarIntensity:
      component(
        radarIntensityScore(observation)
      ),

    stormSize:
      component(
        stormSizeScore(observation)
      ),

    morphology:
      component(
        morphologyScore(observation)
      ),

    evolution:
      component(
        evolutionScore(evolution)
      ),

    lightning:
      component(
        lightningScore(lightning)
      ),

    wind:{
      score:null,
      available:false
    }
  }

  let weightedScore=0
  let availableWeight=0

  for(const [
    name,
    weight
  ] of Object.entries(WEIGHTS)){
    const c=components[name]

    if(c.available){
      weightedScore+=
        c.score*weight

      availableWeight+=weight
    }
  }

  const score=
    availableWeight>0
      ? clamp01(
          weightedScore/
          availableWeight
        )
      : 0

  /*
   * Confidence describes how much of the CURRENT
   * Severity v1 evidence model is available.
   *
   * Wind is reserved for a future model revision and
   * therefore does not reduce current confidence.
   */
  let confidenceSupport=0

  for(const [
    name,
    weight
  ] of Object.entries(WEIGHTS)){
    const c=components[name]

    if(!c.available){
      continue
    }

    if(name==='evolution'){
      const support=
        Number(evolution?.confidence)

      confidenceSupport+=
        weight*
        (
          Number.isFinite(support)
            ? clamp01(support)
            : 0
        )
    }else{
      confidenceSupport+=weight
    }
  }

  const confidence=
    clamp01(confidenceSupport)

  return {
    score,
    level:levelForScore(score),
    confidence,
    method:METHOD,
    components
  }
}

module.exports={
  METHOD,
  WEIGHTS,
  radarIntensityScore,
  stormSizeScore,
  morphologyScore,
  evolutionScore,
  lightningScore,
  calculateStormSeverityV1
}
