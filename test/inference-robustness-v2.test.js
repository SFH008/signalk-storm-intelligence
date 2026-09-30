'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  compareMissingModality,
  compareProviderInvariant,
  perturbationSensitivity
}=require('../lib/inference-robustness-v2')

test('missing-modality comparison reports degradation',()=>{
  const result=compareMissingModality({
    baseline:{
      metric:0.80,
      evaluated:100
    },
    ablated:{
      metric:0.68,
      evaluated:100
    },
    modality:'temporal'
  })

  assert.equal(result.modality,'temporal')
  assert.equal(result.baselineMetric,0.80)
  assert.equal(result.ablatedMetric,0.68)

  assert.ok(
    Math.abs(result.degradation-0.12)<1e-12
  )

  assert.ok(
    Math.abs(result.relativeDegradation-0.15)<1e-12
  )
})

test('missing-modality comparison preserves unknown metrics',()=>{
  const result=compareMissingModality({
    baseline:{
      metric:null,
      evaluated:0
    },
    ablated:{
      metric:null,
      evaluated:0
    },
    modality:'lightning'
  })

  assert.equal(result.degradation,null)
  assert.equal(result.relativeDegradation,null)
})

test('provider invariance passes for identical scientific outputs',()=>{
  const result=compareProviderInvariant({
    a:{
      provider:'provider-a',
      output:{
        modelScore:0.73,
        probability:null,
        classification:{
          convectiveCell:{
            value:true,
            confidence:0.8
          }
        }
      }
    },
    b:{
      provider:'provider-b',
      output:{
        modelScore:0.73,
        probability:null,
        classification:{
          convectiveCell:{
            value:true,
            confidence:0.8
          }
        }
      }
    }
  })

  assert.equal(result.invariant,true)
  assert.deepEqual(result.differences,[])
})

test('provider provenance itself is ignored by invariance check',()=>{
  const result=compareProviderInvariant({
    a:{
      provider:'aemet',
      output:{
        modelScore:0.4
      }
    },
    b:{
      provider:'future-provider',
      output:{
        modelScore:0.4
      }
    }
  })

  assert.equal(result.invariant,true)
})

test('provider invariance reports scientific output differences',()=>{
  const result=compareProviderInvariant({
    a:{
      provider:'provider-a',
      output:{
        modelScore:0.4,
        probability:null
      }
    },
    b:{
      provider:'provider-b',
      output:{
        modelScore:0.5,
        probability:null
      }
    }
  })

  assert.equal(result.invariant,false)
  assert.ok(
    result.differences.includes('modelScore')
  )
})

test('perturbation sensitivity reports absolute and relative change',()=>{
  const result=perturbationSensitivity({
    baseline:0.60,
    perturbed:0.63,
    feature:'maxReflectivityDbz',
    perturbation:1
  })

  assert.equal(result.feature,'maxReflectivityDbz')
  assert.equal(result.perturbation,1)

  assert.ok(
    Math.abs(result.absoluteChange-0.03)<1e-12
  )

  assert.ok(
    Math.abs(result.relativeChange-0.05)<1e-12
  )
})

test('perturbation sensitivity preserves unknown baseline',()=>{
  const result=perturbationSensitivity({
    baseline:null,
    perturbed:0.5,
    feature:'areaKm2',
    perturbation:1
  })

  assert.equal(result.absoluteChange,null)
  assert.equal(result.relativeChange,null)
})

test('zero baseline has absolute but no relative sensitivity',()=>{
  const result=perturbationSensitivity({
    baseline:0,
    perturbed:0.1,
    feature:'x',
    perturbation:0.1
  })

  assert.equal(result.absoluteChange,0.1)
  assert.equal(result.relativeChange,null)
})
