'use strict'
const { DEFAULTS: VMI_DEFAULTS } = require('../lib/dpc-vmi-evidence')
const { DpcProvider, PRODUCTS } = require('../lib/dpc-provider')

const defaults = Object.freeze({
  wmsBase: 'https://radar-geowebcache.protezionecivile.it/service/wms',
  apiBase: 'https://radar-api.protezionecivile.it',
  webpTileBase: 'https://s3-prod-dpc-radar-webp-cache.s3.eu-south-1.amazonaws.com',
  hrdBinaryBase: 'https://s3-prod-dpc-radar-webp-cache.s3.eu-south-1.amazonaws.com',
  ...VMI_DEFAULTS,
  origin: 'https://radar.protezionecivile.it'
})

module.exports = {
  id: 'radar-dpc',
  name: 'Italian Civil Protection Radar-DPC',
  products: PRODUCTS,
  defaults,
  legacyDefault: true,
  recommended: { enabled: true, display: ['VMI', 'SRI'], prefetch: ['VMI', 'SRI'], acquire: ['HRD'], stormSource: 'HRD' },
  settingsSchema: { properties: {
    vmiGridWidth: { title: 'VMI normalized grid width (pixels)', type: 'integer', minimum: 32, maximum: 1600, default: defaults.vmiGridWidth },
    vmiGridHeight: { title: 'VMI normalized grid height (pixels)', type: 'integer', minimum: 32, maximum: 1600, default: defaults.vmiGridHeight },
    vmiMaxInputPixels: { title: 'VMI maximum native raster pixels', type: 'integer', minimum: 1, maximum: 16000000, default: defaults.vmiMaxInputPixels },
    vmiMaxRawBytes: { title: 'VMI maximum download size (bytes)', type: 'integer', minimum: 1024, maximum: 134217728, default: defaults.vmiMaxRawBytes },
    wmsBase: { title: 'WMS endpoint', type: 'string', default: defaults.wmsBase },
    apiBase: { title: 'Product API endpoint', type: 'string', default: defaults.apiBase },
    webpTileBase: { title: 'Radar-DPC v2 WebP tile endpoint', type: 'string', default: defaults.webpTileBase },
    hrdBinaryBase: { title: 'HRD binary product endpoint', type: 'string', default: defaults.hrdBinaryBase },
    origin: { title: 'HTTP Origin/Referer base', type: 'string', default: defaults.origin }
  } },
  create({ common, settings, rawSettings }) {
    // Legacy flat settings are consumed here, never by the generic core.
    return new DpcProvider({
      ...settings,
      requestTimeoutMs: common.requestTimeoutMs,
      dpcWmsBase: rawSettings?.dpcWmsBase || settings.wmsBase,
      dpcApiBase: rawSettings?.dpcApiBase || settings.apiBase,
      dpcWebpTileBase: settings.webpTileBase,
      dpcHrdBinaryBase: settings.hrdBinaryBase,
      dpcOrigin: rawSettings?.dpcOrigin || settings.origin
    })
  }
}
