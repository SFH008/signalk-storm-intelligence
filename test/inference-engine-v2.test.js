'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')

const { InferenceEngineV2 }=require('../lib/inference-engine-v2')

function observation(){
  return {
    type:'Feature',
    geometry:{
      type:'Polygon',
      coordinates:[[
        [-8.0,40.0],[-7.9,40.0],[-7.9,40.1],
        [-8.0,40.1],[-8.0,40.0]
      ]]
    },
    properties:{
      observationId:'obs-1',
      observedAt:'2026-09-27T12:00:00.000Z',
      centroid:[-7.95,40.05],
      areaKm2:25,
      evidence:{
        reflectivity:{
          available:true,
          units:'dBZ',
          maxDbz:42,
          representation:'measurement'
        }
      },
      provenance:{domain:'radar'}
    }
  }
}

function algorithm(id,type,result){
  return {
    id,
    type,
    version:'1',
    stages:['observation'],
    async infer(context){
      assert.equal(context.stage,'observation')
      assert.ok(context.observation)
      return result
    }
  }
}

test('observation inference returns provider-neutral v2 contract',async()=>{
  const engine=new InferenceEngineV2({
    algorithms:[
      algorithm('deterministic-baseline','deterministic',{
        accepted:true,
        classification:{
          convectiveCell:{value:true,confidence:.7}
        }
      })
    ]
  })

  const result=await engine.inferObservation({
    observation:observation(),
    evidence:observation().properties.evidence,
    now:Date.parse('2026-09-27T12:00:00.000Z')
  })

  assert.equal(result.schema,'storm-inference/2')
  assert.equal(result.stage,'observation')
  assert.equal(result.accepted,true)

  assert.equal(
    result.classification.convectiveCell.value,
    true
  )

  assert.ok(Array.isArray(result.contributions))
  assert.equal(result.contributions.length,1)

  assert.equal(
    result.contributions[0].algorithm.id,
    'deterministic-baseline'
  )

  assert.equal(
    result.contributions[0].algorithm.type,
    'deterministic'
  )

  assert.ok(result.provenance)
  assert.equal(result.provenance.engine,'inference-engine-v2')

  for(const forbidden of [
    'stormId',
    'track',
    'motion',
    'forecast',
    'cpa',
    'threat',
    'vessel'
  ]){
    assert.equal(
      Object.prototype.hasOwnProperty.call(result,forbidden),
      false,
      `${forbidden} must not belong to InferenceEngine v2 output`
    )
  }
})

test('different inference technologies use the same algorithm contract',async()=>{
  const engines=[
    ['statistical-model','statistical'],
    ['neural-model','neural-network'],
    ['multimodal-model','multimodal'],
    ['llm-refiner','llm']
  ]

  for(const [id,type] of engines){
    const engine=new InferenceEngineV2({
      algorithms:[
        algorithm(id,type,{
          accepted:null,
          classification:{
            thunderstorm:{value:null,confidence:null}
          }
        })
      ]
    })

    const result=await engine.inferObservation({
      observation:observation(),
      evidence:observation().properties.evidence,
      now:Date.parse('2026-09-27T12:00:00.000Z')
    })

    assert.equal(result.contributions.length,1)
    assert.equal(result.contributions[0].algorithm.id,id)
    assert.equal(result.contributions[0].algorithm.type,type)
    assert.equal(result.contributions[0].algorithm.version,'1')
  }
})

test('missing evidence remains unknown and is not converted to zero or false',async()=>{
  const engine=new InferenceEngineV2({
    algorithms:[
      algorithm('missing-evidence-check','deterministic',{
        accepted:null,
        classification:{
          thunderstorm:{
            value:null,
            confidence:null
          }
        },
        quality:{
          score:null,
          confidence:null,
          reasons:['insufficient-evidence']
        }
      })
    ]
  })

  const obs=observation()
  obs.properties.evidence={}

  const result=await engine.inferObservation({
    observation:obs,
    evidence:{},
    now:Date.parse('2026-09-27T12:00:00.000Z')
  })

  assert.equal(result.accepted,null)
  assert.equal(
    result.classification.thunderstorm.value,
    null
  )
  assert.equal(
    result.classification.thunderstorm.confidence,
    null
  )
  assert.equal(result.quality.score,null)
})

test('algorithm model provenance survives the engine boundary',async()=>{
  const model={
    id:'future-model',
    type:'neural-network',
    version:'4.2',
    checksum:'sha256:example',
    featureSchema:'storm-features/3'
  }

  const engine=new InferenceEngineV2({
    algorithms:[{
      id:'future-neural-model',
      type:'neural-network',
      version:'4.2',
      stages:['observation'],
      model,
      async infer(){
        return {
          accepted:null,
          classification:{},
          model
        }
      }
    }]
  })

  const result=await engine.inferObservation({
    observation:observation(),
    evidence:observation().properties.evidence,
    now:Date.parse('2026-09-27T12:00:00.000Z')
  })

  assert.deepEqual(
    result.contributions[0].model,
    model
  )
})


test('engine exposes fused multisensor structure when contributions are supplied',async()=>{
  const engine=new InferenceEngineV2({
    algorithms:[
      algorithm('baseline','deterministic',{
        accepted:true,
        classification:{}
      })
    ]
  })

  const result=await engine.inferObservation({
    observation:observation(),
    evidence:observation().properties.evidence,
    now:Date.parse('2026-09-27T12:00:00.000Z'),

    multisensorContributions:[
      {
        domain:'lightning',
        available:true,
        support:{
          thunderstorm:'support'
        },
        provenance:{
          source:'normalized-lightning'
        }
      },
      {
        domain:'weather',
        available:false,
        support:{},
        provenance:{
          source:'weather-api'
        }
      }
    ]
  })

  assert.ok(result.fusion)

  assert.deepEqual(
    result.fusion.support.thunderstorm.supportingDomains,
    ['lightning']
  )

  assert.ok(
    result.fusion.support.thunderstorm
      .unavailableDomains
      .includes('weather')
  )
})

test('engine works unchanged when no multisensor contributions are supplied',async()=>{
  const engine=new InferenceEngineV2({
    algorithms:[
      algorithm('baseline','deterministic',{
        accepted:true,
        classification:{}
      })
    ]
  })

  const result=await engine.inferObservation({
    observation:observation(),
    evidence:observation().properties.evidence,
    now:Date.parse('2026-09-27T12:00:00.000Z')
  })

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result,
      'fusion'
    ),
    false
  )
})

test('unavailable lightning remains unavailable rather than negative evidence',async()=>{
  const engine=new InferenceEngineV2({
    algorithms:[]
  })

  const result=await engine.inferObservation({
    observation:observation(),
    evidence:observation().properties.evidence,
    now:Date.parse('2026-09-27T12:00:00.000Z'),

    multisensorContributions:[
      {
        domain:'lightning',
        available:false,
        support:{},
        provenance:{
          provider:'configured-but-unavailable'
        }
      }
    ]
  })

  assert.equal(
    result.fusion.domains.lightning.available,
    false
  )

  assert.ok(
    result.fusion.support.thunderstorm
      .unavailableDomains
      .includes('lightning')
  )

  assert.deepEqual(
    result.fusion.support.thunderstorm
      .conflictingDomains,
    []
  )
})

test('provider provenance does not change fused scientific support',async()=>{
  async function run(provider){
    const engine=new InferenceEngineV2({
      algorithms:[]
    })

    return engine.inferObservation({
      observation:observation(),
      evidence:observation().properties.evidence,
      now:Date.parse('2026-09-27T12:00:00.000Z'),

      multisensorContributions:[
        {
          domain:'lightning',
          available:true,
          support:{
            thunderstorm:'support'
          },
          provenance:{provider}
        }
      ]
    })
  }

  const a=await run('provider-a')
  const b=await run('provider-b')

  assert.deepEqual(
    a.fusion.support,
    b.fusion.support
  )
})

test('fusion integration does not create probability severity or threat',async()=>{
  const engine=new InferenceEngineV2({
    algorithms:[]
  })

  const result=await engine.inferObservation({
    observation:observation(),
    evidence:observation().properties.evidence,
    now:Date.parse('2026-09-27T12:00:00.000Z'),

    multisensorContributions:[
      {
        domain:'lightning',
        available:true,
        support:{
          thunderstorm:'support'
        }
      }
    ]
  })

  for(const forbidden of [
    'probability',
    'severity',
    'threat'
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


test('engine attaches uncertainty when explicitly supplied',async()=>{
  const engine=new InferenceEngineV2({
    algorithms:[]
  })

  const result=await engine.inferObservation({
    observation:observation(),
    uncertaintyInput:{
      expectedDomains:[
        'radar',
        'lightning'
      ],
      domainAvailability:{
        radar:true,
        lightning:false
      },
      modelUncertainty:0.2,
      calibrationUncertainty:null
    }
  })

  assert.ok(result.uncertainty)

  assert.equal(
    result.uncertainty.evidenceCompleteness,
    0.5
  )

  assert.equal(
    result.uncertainty.modelUncertainty,
    0.2
  )

  assert.equal(
    result.uncertainty.calibrationUncertainty,
    null
  )
})

test('engine output remains unchanged when uncertainty is not supplied',async()=>{
  const engine=new InferenceEngineV2({
    algorithms:[]
  })

  const result=await engine.inferObservation({
    observation:observation()
  })

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result,
      'uncertainty'
    ),
    false
  )
})

test('engine uncertainty preserves unknown modality availability',async()=>{
  const engine=new InferenceEngineV2({
    algorithms:[]
  })

  const result=await engine.inferObservation({
    observation:observation(),
    uncertaintyInput:{
      expectedDomains:[
        'radar',
        'lightning'
      ],
      domainAvailability:{
        radar:true,
        lightning:null
      }
    }
  })

  assert.equal(
    result.uncertainty.evidenceCompleteness,
    0.5
  )

  assert.ok(
    result.uncertainty.reasons.includes(
      'lightning availability unknown'
    )
  )
})

test('engine uncertainty integration creates no threat or severity',async()=>{
  const engine=new InferenceEngineV2({
    algorithms:[]
  })

  const result=await engine.inferObservation({
    observation:observation(),
    uncertaintyInput:{
      expectedDomains:['radar'],
      domainAvailability:{
        radar:true
      }
    }
  })

  for(const forbidden of [
    'severity',
    'threat',
    'cpa',
    'tcpa'
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
