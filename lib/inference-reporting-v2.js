'use strict'

const OBSERVATION_FEATURES=[
  'areaKm2',
  'maxReflectivityDbz',
  'reflectivityAvailable',
  'reflectivityRepresentation',
  'observationAgeSec'
]

const TEMPORAL_FEATURES=[
  'intensityChangeDbz',
  'intensityRateDbzPerMin',
  'areaChangeKm2',
  'areaRateKm2PerMin',
  'evolutionConfidence'
]

const LABEL_NAMES=[
  'convectiveCell',
  'thunderstorm',
  'heavyRain',
  'squallPotential'
]

function summarizeLabel(rows,name){
  const summary={
    known:0,
    unknown:0,
    positive:0,
    negative:0,
    sources:{}
  }

  for(const row of rows){
    const label=row?.labels?.[name]
    const value=label?.value

    if(value===null || value===undefined){
      summary.unknown++
      continue
    }

    summary.known++

    if(value===true){
      summary.positive++
    }else if(value===false){
      summary.negative++
    }

    if(label?.source!=null){
      const source=String(label.source)
      summary.sources[source]=
        (summary.sources[source] || 0)+1
    }
  }

  return summary
}

function summarizeDataset(rows=[]){
  const events=new Set()

  for(const row of rows){
    if(
      typeof row?.eventId==='string' &&
      row.eventId.length
    ){
      events.add(row.eventId)
    }
  }

  const labels={}

  for(const name of LABEL_NAMES){
    labels[name]=summarizeLabel(rows,name)
  }

  return {
    samples:rows.length,
    events:events.size,
    labels
  }
}

function isMissing(value){
  return value===null || value===undefined
}

function summarizeField(rows,group,name){
  let available=0
  let missing=0

  for(const row of rows){
    const value=
      row?.features?.[group]?.values?.[name]

    if(isMissing(value)){
      missing++
    }else{
      available++
    }
  }

  const total=available+missing

  return {
    available,
    missing,
    missingRate:
      total>0
        ? missing/total
        : null
  }
}

function summarizeFeatureGroup(rows,group,names){
  const result={}

  for(const name of names){
    result[name]=summarizeField(
      rows,
      group,
      name
    )
  }

  return result
}

function summarizeFeatureCompleteness(rows=[]){
  return {
    observation:summarizeFeatureGroup(
      rows,
      'observation',
      OBSERVATION_FEATURES
    ),

    temporal:summarizeFeatureGroup(
      rows,
      'temporal',
      TEMPORAL_FEATURES
    )
  }
}

module.exports={
  summarizeDataset,
  summarizeFeatureCompleteness
}
