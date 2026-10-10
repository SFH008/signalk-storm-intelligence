'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { authoritativeV3InferenceComponents } = require('../index')._test

function dashboard() {
  const context = vm.createContext({
    document: {getElementById:()=>({addEventListener(){}}),addEventListener(){}},
    fetch:()=>new Promise(()=>{}),setInterval:()=>1,clearInterval(){}
  })
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','public','dashboard.js'),'utf8'),context)
  return component=>context.componentDetails(component)
}

test('dashboard renders authoritative V3 processing metadata as observation time without fabricating run diagnostics',()=>{
  const render = dashboard()
  const components = authoritativeV3InferenceComponents({
    inferenceEngine:{algorithms:[{id:'deterministic-observation-v2'}]},
    stormEngine:{previousObservedAt:'2026-10-10T09:35:00Z'}
  })
  assert.equal(components[0].state,'healthy')
  assert.equal(render(components[0]),'Last processed observation · 2026-10-10T09:35:00.000Z')
})

test('dashboard shows waiting only without usable processing metadata, and respects disabled state',()=>{
  const render = dashboard()
  for (const processedAt of [null,undefined,'invalid']) {
    assert.equal(render({id:'inference:test',processedAt}),'Waiting for first inference cycle')
  }
  assert.equal(render({id:'inference:test',state:'disabled',processedAt:'2026-10-10T09:35:00Z'}),'Inference disabled')
})

test('dashboard preserves legacy success and failure diagnostics, escaping provider-derived errors',()=>{
  const render = dashboard()
  assert.equal(render({id:'inference:test',lastRun:{ok:true,durationMs:5,count:2}}),'last run OK · 5 ms · 2 cells')
  assert.equal(render({id:'inference:test',processedAt:'2026-10-10T09:35:00Z',lastRun:{ok:false,error:'<failure>'}}),
    'last run failed · — ms · 0 cells · &lt;failure&gt;')
})
