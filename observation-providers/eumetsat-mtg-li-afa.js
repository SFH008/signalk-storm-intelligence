'use strict'

const {
  EumetsatProvider
} = require('../lib/eumetsat-provider')

module.exports = {
  id: 'eumetsat-mtg-li-afa',
  name: 'EUMETSAT MTG LI Accumulated Flash Area',
  recommended: { enabled: false },

  defaults: {
    wmsBase: 'https://view.eumetsat.int/geoserver/wms',
    capabilitiesCacheSeconds: 60
  },

  settingsSchema: {
    properties: {
      wmsBase: {
        type: 'string',
        title: 'EUMETView WMS endpoint'
      },
      capabilitiesCacheSeconds: {
        type: 'integer',
        title: 'Capabilities cache (seconds)',
        minimum: 15,
        maximum: 3600
      }
    }
  },

  create({ common, settings }) {
    const provider = new EumetsatProvider({
      requestTimeoutMs: common.requestTimeoutMs,
      wmsBase: settings.wmsBase,
      capabilitiesCacheSeconds: settings.capabilitiesCacheSeconds
    })

    return {
      id: module.exports.id,
      name: module.exports.name,
      attribution: 'Satellite lightning imagery: EUMETSAT',
      types: ['lightning'],

      capabilities: {
        density: true,
        map: true,
        temporal: true,
        points: false,
        quantitativeSamples: false
      },

      async densityTile(q = {}) {
        return provider.tile(
          'MTG_LI_AFA',
          {
            bbox3857: q.bbox3857
          },
          q.time || null
        )
      },

      densityDescriptor() {
        return {
          kind: 'accumulated-flash-area',
          phenomenon: 'lightning',
          title: 'MTG LI Accumulated Flash Area',
          period: 'PT5M',
          units: null,
          quantitative: false,
          note:
            'EUMETSAT MTG Lightning Imager AFA is exposed as a gridded lightning activity map. It is not converted into synthetic point strikes.'
        }
      }
    }
  }
}
