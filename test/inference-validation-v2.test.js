'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  buildValidationReport
}=require('../lib/inference-validation-v2')

test('validation report preserves event-level split identity',()=>{
  const report=buildValidationReport({
    model:{
      id:'reference-model',
      version:'1'
    },
    split:'test',
    eventIds:['event-a','event-b'],
    metrics:{
      precision:0.8,
      recall:0.75
    }
  })

  assert.equal(report.split,'test')
  assert.deepEqual(
    report.eventIds,
    ['event-a','event-b']
  )
})

test('validation report preserves model provenance',()=>{
  const report=buildValidationReport({
    model:{
      id:'reference-model',
      version:'2',
      checksum:'sha256:test'
    },
    split:'test',
    eventIds:['event-a'],
    metrics:{}
  })

  assert.equal(
    report.model.id,
    'reference-model'
  )

  assert.equal(
    report.model.checksum,
    'sha256:test'
  )
})

test('validation report distinguishes discrimination and calibration',()=>{
  const report=buildValidationReport({
    model:{
      id:'reference-model',
      version:'1'
    },
    split:'test',
    eventIds:['event-a'],
    metrics:{
      classification:{
        precision:0.8,
        recall:0.7
      },
      calibration:{
        brierScore:0.12
      }
    }
  })

  assert.equal(
    report.metrics.classification.precision,
    0.8
  )

  assert.equal(
    report.metrics.calibration.brierScore,
    0.12
  )
})

test('validation report preserves missing-modality robustness results',()=>{
  const report=buildValidationReport({
    model:{
      id:'reference-model',
      version:'1'
    },
    split:'test',
    eventIds:['event-a'],
    metrics:{},
    robustness:{
      missingLightning:{
        baseline:0.8,
        ablated:0.72,
        degradation:0.08
      }
    }
  })

  assert.equal(
    report.robustness.missingLightning.degradation,
    0.08
  )
})

test('validation report does not invent operational acceptance',()=>{
  const report=buildValidationReport({
    model:{
      id:'reference-model',
      version:'1'
    },
    split:'test',
    eventIds:['event-a'],
    metrics:{}
  })

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      report,
      'accepted'
    ),
    false
  )

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      report,
      'operational'
    ),
    false
  )
})

test('validation report contains no vessel-relative threat fields',()=>{
  const report=buildValidationReport({
    model:{
      id:'reference-model',
      version:'1'
    },
    split:'test',
    eventIds:['event-a'],
    metrics:{}
  })

  for(const forbidden of [
    'severity',
    'threat',
    'cpa',
    'tcpa'
  ]){
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        report,
        forbidden
      ),
      false
    )
  }
})

test('validation report rejects duplicate event ids',()=>{
  assert.throws(
    ()=>buildValidationReport({
      model:{
        id:'reference-model',
        version:'1'
      },
      split:'test',
      eventIds:[
        'event-a',
        'event-a'
      ],
      metrics:{}
    }),
    /duplicate event/
  )
})

test('validation report requires explicit split',()=>{
  assert.throws(
    ()=>buildValidationReport({
      model:{
        id:'reference-model',
        version:'1'
      },
      eventIds:['event-a'],
      metrics:{}
    }),
    /split/
  )
})
