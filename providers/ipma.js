'use strict'

const { IpmaProvider, PRODUCTS } = require('../lib/ipma-provider')

const defaults = Object.freeze({
  timelineUrl:
    'https://www.ipma.pt/resources.www/transf/radar/imgs-radar.json',
  imageBase:
    'https://www.ipma.pt/resources.www/transf/radar/por/'
})

module.exports = {
  id: 'ipma',
  name: 'Instituto Português do Mar e da Atmosfera (IPMA)',
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
      timelineUrl: {
        title: 'Radar timeline endpoint',
        type: 'string',
        default: defaults.timelineUrl
      },
      imageBase: {
        title: 'Radar image endpoint',
        type: 'string',
        default: defaults.imageBase
      }
    }
  },

  create({ common, settings }) {
    return new IpmaProvider({
      requestTimeoutMs: common.requestTimeoutMs,
      timelineUrl: settings.timelineUrl,
      imageBase: settings.imageBase
    })
  }
}
