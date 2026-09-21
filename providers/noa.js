'use strict'

const { NoaProvider, PRODUCTS } = require('../lib/noa-provider')

const defaults = Object.freeze({
  baseUrl: 'https://nowcast.meteo.noa.gr',
  livePath: '/data/XPol/',
  archiveRoot: '/data/database/',
  directoryEndpoint: '/php/dird.php'
})

module.exports = {
  id: 'noa',
  name: 'National Observatory of Athens (NOA) XPOL',
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
      baseUrl: {
        title: 'NOA endpoint',
        type: 'string',
        default: defaults.baseUrl
      }
    }
  },

  create({ common, settings }) {
    return new NoaProvider({
      requestTimeoutMs: common.requestTimeoutMs,
      baseUrl: settings.baseUrl,
      livePath: defaults.livePath,
      archiveRoot: defaults.archiveRoot,
      directoryEndpoint: defaults.directoryEndpoint
    })
  }
}
