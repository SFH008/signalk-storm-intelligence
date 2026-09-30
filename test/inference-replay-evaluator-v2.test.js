'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  evaluateReplaySamples
}=require('../lib/inference-replay-evaluator-v2')

function sample({
  eventId='event-a',
  sampleId='sample-a',
  label=true,
  x=1
}={}){
  return {
    schema:'storm-inference-training-sample/1',
    eventId,
    sampleId,
    observedAt:'2026-09-27T12:00:00.000Z',
    features:{
      observation:{
        schema:'storm-inference-observation-features/1',
        values:{x}
      },
      temporal:{
        schema:'storm-inference-temporal-features/1',
        values:{trend:null}
      }
    },
    labels:{
      convectiveCell:{
        value:label,
        source:label===null ? null : 'human-reviewed',
        confidence:label===null ? null : 1
      },
      thunderstorm:{
        value:null,
        source:null,
        confidence:null
      },
      heavyRain:{
        value:null,
        source:null,
        confidence:null
      },
      squallPotential:{
        value:null,
        source:null,
        confidence:null
      }
    },
    provenance:{
      evidenceBundle:'bundle-1',
      evidenceRevision:'evidence-1',
      codeRevision:'code-1',
      reviewRevision:'review-1'
    }
  }
}

function model({
  score=0.8,
  probability=null
}={}){
  return {
    id:'test-model',
    type:'statistical',
    version:'1',
    async infer({features}){
      return {
        modelScore:score,
        probability,
        calibrated:probability!==null,
        seenFeatures:features
      }
    }
  }
}

test('evaluates replay samples into validation report',async()=>{
  const report=await evaluateReplaySamples({
    model:model({score:0.8}),
    samples:[
      sample({
        eventId:'event-a',
        sampleId:'sample-a',
        label:true
      }),
      sample({
        eventId:'event-b',
        sampleId:'sample-b',
        label:false
      })
    ],
    labelName:'convectiveCell',
    split:'test',
    threshold:0.5
  })

  assert.equal(report.split,'test')
  assert.deepEqual(
    report.eventIds,
    ['event-a','event-b']
  )

  assert.equal(
    report.metrics.classification.evaluated,
    2
  )
})

test('unknown labels are excluded rather than converted to false',async()=>{
  const report=await evaluateReplaySamples({
    model:model({score:0.8}),
    samples:[
      sample({label:true}),
      sample({
        eventId:'event-b',
        sampleId:'sample-b',
        label:null
      })
    ],
    labelName:'convectiveCell',
    split:'test',
    threshold:0.5
  })

  assert.equal(
    report.metrics.classification.evaluated,
    1
  )

  assert.equal(
    report.metrics.classification.excluded,
    1
  )
})

test('calibration metrics use calibrated probability only',async()=>{
  const report=await evaluateReplaySamples({
    model:model({
      score:0.9,
      probability:null
    }),
    samples:[sample({label:true})],
    labelName:'convectiveCell',
    split:'test',
    threshold:0.5
  })

  assert.equal(
    report.metrics.calibration.brierScore.score,
    null
  )

  assert.equal(
    report.metrics.calibration.brierScore.excluded,
    1
  )
})

test('calibrated probability is used for calibration metrics',async()=>{
  const report=await evaluateReplaySamples({
    model:model({
      score:0.9,
      probability:0.8
    }),
    samples:[sample({label:true})],
    labelName:'convectiveCell',
    split:'test',
    threshold:0.5
  })

  assert.ok(
    Math.abs(
      report.metrics.calibration.brierScore.score -
      0.04
    ) < 1e-12
  )
})

test('threshold must be supplied explicitly',async()=>{
  await assert.rejects(
    ()=>evaluateReplaySamples({
      model:model(),
      samples:[sample()],
      labelName:'convectiveCell',
      split:'test'
    }),
    /threshold/
  )
})

test('threshold must be bounded',async()=>{
  await assert.rejects(
    ()=>evaluateReplaySamples({
      model:model(),
      samples:[sample()],
      labelName:'convectiveCell',
      split:'test',
      threshold:1.1
    }),
    /threshold/
  )
})

test('model receives flattened observation and temporal features',async()=>{
  let received=null

  const inspectingModel={
    id:'inspection-model',
    type:'statistical',
    version:'1',
    async infer({features}){
      received=features
      return {
        modelScore:0.8,
        probability:null
      }
    }
  }

  await evaluateReplaySamples({
    model:inspectingModel,
    samples:[sample({x:7})],
    labelName:'convectiveCell',
    split:'test',
    threshold:0.5
  })

  assert.equal(received.x,7)
  assert.equal(received.trend,null)
})

test('duplicate event ids appear once in validation report',async()=>{
  const report=await evaluateReplaySamples({
    model:model(),
    samples:[
      sample({
        eventId:'event-a',
        sampleId:'sample-a'
      }),
      sample({
        eventId:'event-a',
        sampleId:'sample-b'
      })
    ],
    labelName:'convectiveCell',
    split:'test',
    threshold:0.5
  })

  assert.deepEqual(
    report.eventIds,
    ['event-a']
  )
})
