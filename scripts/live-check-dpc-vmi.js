'use strict'

// Explicit network check, never part of npm test. No vessel telemetry is sent.
const adapter = require('../providers/radar-dpc')
const { detectStormCandidates } = require('../lib/storm-detector')
const { buildHazardRegions } = require('../lib/storm-tracker-v3/hazard-regions')
const { motionFrameFromNormalizedRadarEvidence } = require('../lib/storm-tracker-v3/radar-motion-frame')
const { StormRuntimeV3 } = require('../lib/storm-runtime-v3')

async function main() {
  const provider = adapter.create({ common: { requestTimeoutMs: 20000 }, settings: adapter.defaults })
  const latest = await provider.latest('VMI')
  const runtime = new StormRuntimeV3()
  const results = []
  // Provider contract documents a five-minute VMI cadence. Exact unavailable
  // predecessor requests fail; no frame is silently substituted.
  for (const epochMs of [latest.epochMs - 300000, latest.epochMs]) {
    const raw = await provider.downloadRaw('VMI', epochMs)
    const evidence = await provider.normalizeRadarEvidence('VMI', raw.buffer, { epochMs })
    const candidates = detectStormCandidates(evidence)
    const { regions } = buildHazardRegions(candidates, { field: evidence, observedAt: evidence.observedAt })
    const result = await runtime.processFrame({ observedAt: evidence.observedAt, field: evidence,
      regions, motionFrame: motionFrameFromNormalizedRadarEvidence(evidence) })
    results.push({ observedAt: evidence.observedAt, rawBytes: raw.buffer.length,
      checksum: evidence.provenance.sourceChecksum, bounds: evidence.bounds,
      availability: evidence.availability, candidateCount: candidates.length,
      regionCount: regions.length, hazardCount: result.hazards.length })
  }
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), provider: provider.id,
    product: 'VMI', latestAgeSeconds: (Date.now() - latest.epochMs) / 1000, results }, null, 2))
}

main().catch(error => { console.error(`DPC VMI live check failed: ${error.message}`); process.exitCode = 1 })
