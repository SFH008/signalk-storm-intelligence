'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { Readable } = require('node:stream')
const makePlugin = require('../index')
const { dpcVmiFixture } = require('./helpers/dpc-vmi-fixture')
const { productCapabilities } = require('../lib/provider-contract')
const adapter = require('../providers/radar-dpc')

function app(directory) {
  return {getDataDirPath:()=>directory, registerResourceProvider(){}, setPluginStatus(){},
    debug(){},error(){},handleMessage(){},getSelfPath(){return null}}
}

function start(directory) {
  const plugin = makePlugin(app(directory))
  plugin.start({backgroundEnabled:false,stormSource:'radar-dpc:VMI',acquisitionTargets:['radar-dpc:VMI'],
    providerSettings:{'radar-dpc':{vmiGridWidth:32,vmiGridHeight:32}}})
  return plugin
}

test('DPC VMI is selectable and normalized capability is adapter-owned', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'storm-dpc-vmi-schema-'))
  const plugin = start(directory)
  try {
    assert.ok(plugin.schema().properties.stormSources.items.enum.includes('radar-dpc:VMI'))
    const provider = adapter.create({common:{requestTimeoutMs:1000},settings:adapter.defaults})
    assert.equal(productCapabilities(provider,provider.products().VMI).normalizedRadar,true)
    assert.equal(productCapabilities(provider,provider.products().HRD).normalizedRadar,false)
    await assert.rejects(plugin._test.processStorm('radar-dpc:VMI',{},Buffer.alloc(0)),/must use Storm Runtime v3/)
    assert.equal(plugin._test.activeStormSource(),'radar-dpc:VMI')
  } finally {plugin.stop();await fs.rm(directory,{recursive:true,force:true})}
})

test('DPC native acquisition archives unchanged TIFF and feeds the shared V3 runtime; corrupt frames fail closed', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'storm-dpc-vmi-acquire-'))
  const plugin = start(directory)
  const oldFetch = global.fetch
  const oldNow = Date.now
  let now = oldNow()
  Date.now = () => now
  let epochMs = Date.parse('2026-10-10T09:10:00Z')
  let raw = await dpcVmiFixture()
  const requests = []
  global.fetch = async (url, options = {}) => {
    const pathname = new URL(url).pathname
    requests.push(pathname)
    if(pathname === '/findLastProductByType') {
      return {ok:true,json:async()=>({lastProducts:[{productType:'VMI',time:epochMs,period:'PT5M'}]})}
    }
    if(pathname === '/downloadProduct') {
      assert.deepEqual(JSON.parse(options.body),{productType:'VMI',productDate:epochMs})
      return {ok:true,json:async()=>({url:'https://native.example/frame.tif',key:'frame.tif'})}
    }
    assert.equal(pathname,'/frame.tif')
    return {ok:true,headers:new Headers({'content-type':'image/tiff'}),body:Readable.from([raw])}
  }
  try {
    assert.equal(await plugin._test.acquireOne('radar-dpc:VMI'),true)
    const runtime = plugin._test.stormRuntimeV3()
    assert.ok(runtime)
    assert.equal(plugin._test.cells().length,1)
    assert.equal(plugin._test.cells()[0].provider,'radar-dpc')
    assert.equal(plugin._test.cells()[0].product,'VMI')
    const archive = await fs.readFile(path.join(directory,'archive','radar-dpc--VMI',`${epochMs}.tif`))
    assert.deepEqual(archive,raw)
    const count = requests.length
    assert.equal(await plugin._test.acquireOne('radar-dpc:VMI'),false)
    assert.equal(requests.length,count)
    now += 61000
    epochMs += 300000
    assert.equal(await plugin._test.acquireOne('radar-dpc:VMI'),true)
    assert.equal(plugin._test.stormRuntimeV3(),runtime)
    assert.equal(plugin._test.cells().length,1)
    // Valid TIFF transport, unsupported CRS: normalization must not fall through
    // to legacy inference or mark the failed frame acquired.
    now += 61000
    epochMs += 300000
    raw = await dpcVmiFixture({metadata:{GTModelTypeGeoKey:2}})
    await assert.rejects(plugin._test.acquireOne('radar-dpc:VMI'),/must use Storm Runtime v3/)
    assert.equal(plugin._test.stormRuntimeV3(),runtime)
    assert.equal(plugin._test.cells().length,1)
  } finally {
    global.fetch=oldFetch
    Date.now=oldNow
    plugin.stop()
    await fs.rm(directory,{recursive:true,force:true})
  }
})
