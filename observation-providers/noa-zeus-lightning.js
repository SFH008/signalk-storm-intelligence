'use strict'

function parseZeusText(text) {
  const out = []

  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue

    const parts = line.split(',')
    if (parts.length !== 4) continue

    const id = String(parts[0]).trim()
    const epochSeconds = Number(parts[1])
    const longitude = Number(parts[2])
    const latitude = Number(parts[3])

    if (!id) continue
    if (!Number.isFinite(epochSeconds)) continue
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) continue
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) continue

    const time = new Date(epochSeconds * 1000)
    if (Number.isNaN(time.getTime())) continue

    out.push({
      id,
      type: 'lightning',
      time: time.toISOString(),
      position: {
        latitude,
        longitude
      },
      provider: 'noa-zeus-lightning'
    })
  }

  return out
}

module.exports = {
  id: 'noa-zeus-lightning',
  name: 'NOA ZEUS Lightning',
  recommended: { enabled: false },

  defaults: {
    baseUrl: 'https://stratus.meteo.noa.gr',
    area: 'Europe'
  },

  settingsSchema: {
    properties: {
      baseUrl: {
        type: 'string',
        title: 'NOA ZEUS base URL'
      },
      area: {
        type: 'string',
        title: 'Feed area',
        enum: ['Europe', 'Greece']
      }
    }
  },

  create({ common, settings }) {
    return {
      id: module.exports.id,
      name: module.exports.name,
      attribution: 'National Observatory of Athens / ZEUS',
      types: ['lightning'],
      capabilities: {
        points: true,
        cloudToGround: true
      },

      async observations(q = {}) {
        const base = String(settings.baseUrl || '').replace(/\/+$/, '')
        if (!base) throw new Error('NOA ZEUS base URL is not configured')

        const area = settings.area === 'Greece' ? 'Greece' : 'Europe'
        const url = `${base}/lightning_live_all/getLightnings`

        const ctl = new AbortController()
        const tm = setTimeout(
          () => ctl.abort(),
          common.requestTimeoutMs || 10000
        )

        let response
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'content-type':
                'application/x-www-form-urlencoded; charset=UTF-8',
              'x-requested-with': 'XMLHttpRequest',
              origin: base,
              referer:
                `${base}/lightning_live_all?area=${encodeURIComponent(area)}`
            },
            body: new URLSearchParams({ area }).toString(),
            signal: ctl.signal
          })
        } finally {
          clearTimeout(tm)
        }

        if (!response.ok) {
          throw new Error(`NOA ZEUS HTTP ${response.status}`)
        }

        const rows = parseZeusText(await response.text())

        const sinceMs = q.since
          ? new Date(q.since).getTime()
          : -Infinity

        const untilMs = q.until
          ? new Date(q.until).getTime()
          : Infinity

        const bounds = Array.isArray(q.bounds) && q.bounds.length === 4
          ? q.bounds.map(Number)
          : null

        return rows.filter(row => {
          const t = new Date(row.time).getTime()

          if (Number.isFinite(sinceMs) && t < sinceMs) return false
          if (Number.isFinite(untilMs) && t > untilMs) return false

          if (bounds) {
            const {
              longitude,
              latitude
            } = row.position

            if (
              longitude < bounds[0] ||
              longitude > bounds[2] ||
              latitude < bounds[1] ||
              latitude > bounds[3]
            ) return false
          }

          return true
        })
      }
    }
  }
}

module.exports._test = {
  parseZeusText
}
