'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const makePlugin = require('../index')

test('chart discovery omits frame resources while preserving direct compatibility lookups', async () => {
  const providers = []
  const plugin = makePlugin({
    registerResourceProvider: provider => providers.push(provider),
    getDataDirPath: () => path.join(os.tmpdir(), 'storm-chart-discovery'),
    setPluginStatus() {}, debug() {}, error() {}, handleMessage() {},
    getSelfPath: () => null
  })
  plugin.start({ backgroundEnabled: false, playbackSlots: 4, hazardOverlaySlots: 3 })
  try {
    const charts = providers.find(provider => provider.type === 'charts').methods
    const listed = await charts.listResources()
    assert.ok(Object.keys(listed).length > 0)
    assert.ok(Object.values(listed).every(chart => !chart.stormIntelligence?.playbackSlot && !chart.stormIntelligence?.hazardSlot))
    const current = Object.values(listed).find(chart => chart.stormIntelligence?.playbackSlot === 0 && chart.time)
    assert.ok(current)
    assert.match(current.time.url, /\?time=\{time\}$/)
    assert.equal(current.time.current, true)
    const legacyId = makePlugin._test.playbackChartId(current.provider, current.product, 1)
    const legacy = await charts.getResource(legacyId)
    assert.equal(legacy.stormIntelligence.playbackSlot, 1)
    assert.match(legacy.url, /\?slot=1$/)
    assert.equal((await charts.getResource('storm-intelligence-hazards-slot-1')).stormIntelligence.hazardSlot, 1)
    await assert.rejects(charts.setResource(), /read-only/)
    await assert.rejects(charts.deleteResource(), /read-only/)
  } finally { plugin.stop() }
})

test('one hazard chart follows rotated snapshots and exact expired times return unavailable', async () => {
  const routes = new Map()
  const plugin = makePlugin({
    get: (route, handler) => routes.set(route, handler),
    registerResourceProvider() {},
    getDataDirPath: () => path.join(os.tmpdir(), 'storm-chart-snapshots'),
    setPluginStatus() {}, debug() {}, error() {}, handleMessage() {},
    getSelfPath: () => null
  })
  plugin.start({ backgroundEnabled: false, hazardOverlaySlots: 2 })
  const request = async time => {
    const response = { code: 200, status(code) { this.code = code; return this }, end() {}, set() {}, send(buffer) { this.buffer = buffer } }
    await routes.get('/stormintelligence/signalk-storm-intelligence/hazards/:slot/:z/:x/:y.png')({ params: { slot: 'current', z: '6', x: '34', y: '24' }, query: time ? { time } : {} }, response)
    return response
  }
  try {
    const times = ['2026-10-10T10:00:00.000Z', '2026-10-10T10:05:00.000Z', '2026-10-10T10:10:00.000Z']
    for (const time of times) {
      plugin._test.publishHazardSnapshot(time)
      const status = plugin._test.hazardOverlayStatus()
      assert.equal(status.resourceId, 'storm-intelligence-hazards')
      assert.equal(status.time, time)
    }
    assert.equal((await request(times[0])).code, 404)
    assert.equal((await request(times[1])).code, 200)
    assert.ok((await request()).buffer.length > 0)
  } finally { plugin.stop() }
})

test('playback retargets the same opaque chart ID and fails explicitly without temporal support', async () => {
  const html = await fs.readFile(path.join(__dirname, '..', 'public', 'radar-panel.html'), 'utf8')
  for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1])
  const code = html.slice(html.indexOf('function frames('), html.indexOf('async function setVisible('))
  const calls = []
  const context = vm.createContext({
    snapshot: { overlays: [{ key: 'demo:RAIN', playback: { frames: [
      { slot: 0, name: 'Rain', time: '2026-10-10T10:10:00.000Z' },
      { slot: 1, name: 'Rain', time: '2026-10-10T10:05:00.000Z' }
    ] } }] },
    hostCharts: [{ id: 'opaque-host-id', name: 'Rain', visible: true, time: { value: null } }],
    uiState: {},
    bus: { has: () => true, call: async (method, params) => calls.push({ method, params: JSON.parse(JSON.stringify(params)) }) },
    saveState: async () => {}, refreshCharts: async () => {}
  })
  vm.runInContext(code, context)
  assert.equal(context.selectedSlot(context.snapshot.overlays[0]), 0)
  context.hostCharts[0].time.value = '2026-10-10T10:05:00.000Z'
  assert.equal(context.selectedSlot(context.snapshot.overlays[0]), 1)
  context.hostCharts[0].time.value = '2026-10-10T09:00:00.000Z'
  assert.equal(context.selectedSlot(context.snapshot.overlays[0]), -1)
  context.hostCharts[0].time.value = null
  await context.setSlot('demo:RAIN', 1)
  assert.deepEqual(calls[0], { method: 'chart.setTime', params: { ids: ['opaque-host-id'], time: '2026-10-10T10:05:00.000Z' } })
  calls.length = 0
  await context.setSlot('demo:RAIN', 0)
  assert.equal(calls[0].params.time, null)
  calls.length = 0
  context.bus.has = capability => capability !== 'charts.time'
  await assert.rejects(context.setSlot('demo:RAIN', 1), /Update Freeboard-SK/)
  assert.equal(calls.length, 0)
  await assert.rejects(context.setSlot('demo:RAIN', 99), /unavailable/)
})
