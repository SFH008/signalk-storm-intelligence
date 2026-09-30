'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  buildInferenceUncertainty
}=require('../lib/inference-uncertainty-v2')

test('evidence completeness uses only expected modalities',()=>{
  const result=buildInferenceUncertainty({
    expectedDomains:[
      'radar',
      'lightning'
    ],
    domainAvailability:{
      radar:true,
      lightning:false,
      weather:false
    }
  })

  assert.equal(
    result.evidenceCompleteness,
    0.5
  )

  assert.ok(
    result.reasons.includes(
      'lightning unavailable'
    )
  )

  assert.equal(
    result.reasons.includes(
      'weather unavailable'
    ),
    false
  )
})

test('unknown modality availability remains missing rather than negative evidence',()=>{
  const result=buildInferenceUncertainty({
    expectedDomains:[
      'radar',
      'lightning'
    ],
    domainAvailability:{
      radar:true,
      lightning:null
    }
  })

  assert.equal(
    result.evidenceCompleteness,
    0.5
  )

  assert.ok(
    result.reasons.includes(
      'lightning availability unknown'
    )
  )

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result,
      'negativeEvidence'
    ),
    false
  )
})

test('deterministic inference may leave model uncertainty unknown',()=>{
  const result=buildInferenceUncertainty({
    expectedDomains:['radar'],
    domainAvailability:{
      radar:true
    },
    modelUncertainty:null,
    calibrationUncertainty:null
  })

  assert.equal(result.evidenceCompleteness,1)
  assert.equal(result.modelUncertainty,null)
  assert.equal(result.calibrationUncertainty,null)
})

test('explicit uncertainty values are preserved',()=>{
  const result=buildInferenceUncertainty({
    expectedDomains:['radar'],
    domainAvailability:{
      radar:true
    },
    modelUncertainty:0.25,
    calibrationUncertainty:0.1
  })

  assert.equal(result.modelUncertainty,0.25)
  assert.equal(result.calibrationUncertainty,0.1)
})

test('uncertainty values must be bounded',()=>{
  assert.throws(
    ()=>buildInferenceUncertainty({
      expectedDomains:['radar'],
      domainAvailability:{radar:true},
      modelUncertainty:1.1
    }),
    /modelUncertainty/
  )

  assert.throws(
    ()=>buildInferenceUncertainty({
      expectedDomains:['radar'],
      domainAvailability:{radar:true},
      calibrationUncertainty:-0.1
    }),
    /calibrationUncertainty/
  )
})

test('provider identity cannot change scientific uncertainty result',()=>{
  const a=buildInferenceUncertainty({
    expectedDomains:[
      'radar',
      'lightning'
    ],
    domainAvailability:{
      radar:true,
      lightning:false
    },
    provenance:{
      provider:'provider-a'
    }
  })

  const b=buildInferenceUncertainty({
    expectedDomains:[
      'radar',
      'lightning'
    ],
    domainAvailability:{
      radar:true,
      lightning:false
    },
    provenance:{
      provider:'provider-b'
    }
  })

  assert.equal(
    a.evidenceCompleteness,
    b.evidenceCompleteness
  )

  assert.deepEqual(
    a.reasons,
    b.reasons
  )
})

test('uncertainty contract contains no severity threat or vessel-relative fields',()=>{
  const result=buildInferenceUncertainty({
    expectedDomains:['radar'],
    domainAvailability:{
      radar:true
    }
  })

  for(const forbidden of [
    'severity',
    'threat',
    'cpa',
    'tcpa',
    'vessel'
  ]){
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        result,
        forbidden
      ),
      false
    )
  }
})

test('empty expected-domain set yields unknown completeness',()=>{
  const result=buildInferenceUncertainty({
    expectedDomains:[],
    domainAvailability:{}
  })

  assert.equal(
    result.evidenceCompleteness,
    null
  )
})
