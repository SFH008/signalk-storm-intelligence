'use strict'

const {
  EumetsatProvider,
  EUMETSAT_PRODUCTS
} = require('../lib/eumetsat-provider')

const defaults = Object.freeze({
  wmsBase: 'https://view.eumetsat.int/geoserver/wms',
  capabilitiesCacheSeconds: 60
})

module.exports = {
  id: 'eumetsat',
  name: 'EUMETSAT Meteosat / MTG',
  family: 'satellite',
  products: EUMETSAT_PRODUCTS,
  defaults,

  recommended: {
    enabled: false,
    display: [],
    prefetch: [],
    acquire: []
  },

  settingsSchema: {
    properties: {
      wmsBase: {
        title: 'EUMETView WMS endpoint',
        type: 'string',
        default: defaults.wmsBase
      },
      capabilitiesCacheSeconds: {
        title: 'Capabilities cache (seconds)',
        type: 'integer',
        minimum: 15,
        maximum: 3600,
        default: defaults.capabilitiesCacheSeconds
      }
    }
  },

  create({ common, settings }) {
    return new EumetsatProvider({
      requestTimeoutMs: common.requestTimeoutMs,
      wmsBase: settings.wmsBase,
      capabilitiesCacheSeconds: settings.capabilitiesCacheSeconds
    })
  }
}
