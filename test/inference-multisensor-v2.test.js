'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  normalizeMultisensorContribution
}=require('../lib/inference-multisensor-v2')

test('normalizes an available lightning contribution',()=>{
  const result=normalizeMultisensorContribution({
    domain:'lightning',
    available:true,
    features:{
      strikeCount10Min:6,
      ratePerMin:0.6
    },
    provenance:{
      source:'normalized-lightning'
    }
  })

  assert.equal(result.domain,'lightning')
  assert.equal(result.available,true)
  assert.equal(result.features.strikeCount10Min,6)
  assert.equal(result.features.ratePerMin,0.6)
  assert.ok(result.provenance)
})

test('missing evidence remains explicitly unavailable',()=>{
  const result=normalizeMultisensorContribution({
    domain:'lightning',
    available:false,
    features:null,
    provenance:{
      source:'normalized-lightning'
    }
  })

  assert.equal(result.available,false)
  assert.equal(result.features,null)
})

test('unknown availability remains unknown',()=>{
  const result=normalizeMultisensorContribution({
    domain:'weather',
    available:null,
    features:null,
    provenance:null
  })

  assert.equal(result.available,null)
  assert.equal(result.features,null)
})

test('provider identity is provenance only',()=>{
  const a=normalizeMultisensorContribution({
    domain:'lightning',
    available:true,
    features:{strikeCount10Min:3},
    provenance:{provider:'provider-a'}
  })

  const b=normalizeMultisensorContribution({
    domain:'lightning',
    available:true,
    features:{strikeCount10Min:3},
    provenance:{provider:'provider-b'}
  })

  assert.deepEqual(a.features,b.features)
  assert.equal(a.available,b.available)
})

test('vessel-relative threat fields are rejected',()=>{
  assert.throws(
    ()=>normalizeMultisensorContribution({
      domain:'weather',
      available:true,
      features:{
        cpaMeters:1000
      }
    }),
    /vessel-relative/
  )

  assert.throws(
    ()=>normalizeMultisensorContribution({
      domain:'environment',
      available:true,
      features:{
        threatState:'alarm'
      }
    }),
    /vessel-relative/
  )
})

test('unsupported domain is rejected',()=>{
  assert.throws(
    ()=>normalizeMultisensorContribution({
      domain:'provider-specific-radar-x',
      available:true,
      features:{x:1}
    }),
    /domain/
  )
})

test('multisensor contribution does not invent classification',()=>{
  const result=normalizeMultisensorContribution({
    domain:'lightning',
    available:true,
    features:{
      strikeCount10Min:20
    }
  })

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result,
      'classification'
    ),
    false
  )

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result,
      'accepted'
    ),
    false
  )
})

test('multisensor contribution does not contain confidence boost',()=>{
  assert.throws(
    ()=>normalizeMultisensorContribution({
      domain:'lightning',
      available:true,
      features:{strikeCount10Min:5},
      confidenceBoost:0.2
    }),
    /confidence/
  )
})


test('unavailable lightning is valid optional evidence',()=>{
  const result=normalizeMultisensorContribution({
    domain:'lightning',
    available:false,
    features:null,
    provenance:{
      provider:'configured-but-unavailable'
    }
  })

  assert.equal(result.domain,'lightning')
  assert.equal(result.available,false)
  assert.equal(result.features,null)

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result,
      'classification'
    ),
    false
  )
})

test('lightning provider failure is not negative lightning evidence',()=>{
  const result=normalizeMultisensorContribution({
    domain:'lightning',
    available:null,
    features:null,
    provenance:{
      provider:'failed-provider',
      status:'unavailable'
    }
  })

  assert.equal(result.available,null)
  assert.equal(result.features,null)

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result,
      'strikeCount10Min'
    ),
    false
  )
})
