'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const {
  fuseEvidenceContributions
}=require('../lib/inference-fusion-v2')

function contribution(domain,{
  available=true,
  support={},
  provenance=null
}={}){
  return {
    domain,
    available,
    support,
    provenance
  }
}

test('preserves all evidence domains explicitly',()=>{
  const result=fuseEvidenceContributions([
    contribution('radar',{
      support:{
        convectiveCell:'support'
      }
    }),
    contribution('lightning',{
      support:{
        thunderstorm:'support'
      }
    }),
    contribution('weather',{
      available:false
    })
  ])

  assert.ok(result.domains.radar)
  assert.ok(result.domains.lightning)
  assert.ok(result.domains.weather)

  assert.equal(
    result.domains.weather.available,
    false
  )
})

test('missing or unavailable modality is neutral',()=>{
  const result=fuseEvidenceContributions([
    contribution('radar',{
      support:{
        convectiveCell:'support'
      }
    }),
    contribution('lightning',{
      available:false
    })
  ])

  assert.deepEqual(
    result.support.convectiveCell.supportingDomains,
    ['radar']
  )

  assert.ok(
    result.support.convectiveCell
      .unavailableDomains
      .includes('lightning')
  )

  assert.deepEqual(
    result.support.convectiveCell.conflictingDomains,
    []
  )
})

test('conflicting evidence remains explicit',()=>{
  const result=fuseEvidenceContributions([
    contribution('radar',{
      support:{
        convectiveCell:'support'
      }
    }),
    contribution('environment',{
      support:{
        convectiveCell:'conflict'
      }
    })
  ])

  assert.deepEqual(
    result.support.convectiveCell.supportingDomains,
    ['radar']
  )

  assert.deepEqual(
    result.support.convectiveCell.conflictingDomains,
    ['environment']
  )
})

test('fusion does not invent final classification',()=>{
  const result=fuseEvidenceContributions([
    contribution('radar',{
      support:{
        convectiveCell:'support'
      }
    }),
    contribution('lightning',{
      support:{
        convectiveCell:'support'
      }
    })
  ])

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
      'probability'
    ),
    false
  )

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result,
      'severity'
    ),
    false
  )
})

test('provider identity does not affect fusion result',()=>{
  const a=fuseEvidenceContributions([
    contribution('lightning',{
      support:{
        thunderstorm:'support'
      },
      provenance:{
        provider:'provider-a'
      }
    })
  ])

  const b=fuseEvidenceContributions([
    contribution('lightning',{
      support:{
        thunderstorm:'support'
      },
      provenance:{
        provider:'provider-b'
      }
    })
  ])

  assert.deepEqual(
    a.support,
    b.support
  )
})

test('corroborating modality cannot invent storm acceptance',()=>{
  const result=fuseEvidenceContributions([
    contribution('lightning',{
      support:{
        thunderstorm:'support'
      }
    })
  ])

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result,
      'accepted'
    ),
    false
  )
})

test('vessel-relative fields are rejected',()=>{
  assert.throws(
    ()=>fuseEvidenceContributions([
      {
        domain:'weather',
        available:true,
        support:{},
        threat:{
          state:'alarm'
        }
      }
    ]),
    /vessel-relative/
  )
})

test('unsupported support state is rejected',()=>{
  assert.throws(
    ()=>fuseEvidenceContributions([
      contribution('radar',{
        support:{
          convectiveCell:'strongly-probable'
        }
      })
    ]),
    /support state/
  )
})
