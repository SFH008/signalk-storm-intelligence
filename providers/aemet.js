'use strict'

const { AemetProvider, PRODUCTS } = require('../lib/aemet-provider')

const defaults = Object.freeze({
  downloadBase: 'https://www.aemet.es/es/api-eltiempo/radar/download/',
  radar: 'CLG',
  archiveCacheMs: 60000
})

module.exports = {
  id: 'aemet',
  name: 'Agencia Estatal de Meteorología (AEMET)',
  products: PRODUCTS,
  defaults,

  recommended: {
    enabled: false,
    display: [],
    prefetch: [],
    acquire: []
  },

  settingsSchema: {
    properties: {
      downloadBase: {
        title: 'Radar archive endpoint',
        type: 'string',
        default: defaults.downloadBase
      },
      radar: {
        title: 'Regional radar code',
        type: 'string',
        default: defaults.radar
      },
      archiveCacheMs: {
        title: 'Archive cache (milliseconds)',
        type: 'integer',
        minimum: 10000,
        default: defaults.archiveCacheMs
      }
    }
  },

  create({ common, settings }) {
    return new AemetProvider({
      requestTimeoutMs: common.requestTimeoutMs,
      downloadBase: settings.downloadBase,
      radar: settings.radar,
      archiveCacheMs: settings.archiveCacheMs
    })
  }
}
