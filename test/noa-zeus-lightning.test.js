'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  parseZeusText
} = require('../observation-providers/noa-zeus-lightning')._test

test('parses NOA ZEUS point records', () => {
  const rows = parseZeusText([
    '1,1790035201,-12.924900,30.121201',
    '2,1790035202,25.026300,39.530701'
  ].join('\n'))

  assert.equal(rows.length, 2)

  assert.deepEqual(rows[0], {
    id: '1',
    type: 'lightning',
    time: '2026-09-22T00:00:01.000Z',
    position: {
      latitude: 30.121201,
      longitude: -12.9249
    },
    provider: 'noa-zeus-lightning'
  })
})

test('rejects malformed or invalid coordinates', () => {
  const rows = parseZeusText([
    '1,1790035201,999,30',
    '2,1790035201,20,999',
    'bad',
    '3,1790035201,20,40'
  ].join('\n'))

  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, '3')
})

test('does not assume source records are time ordered', () => {
  const rows = parseZeusText([
    '1,1790035205,20,40',
    '2,1790035201,21,41'
  ].join('\n'))

  assert.equal(rows.length, 2)
  assert.equal(rows[0].id, '1')
  assert.equal(rows[1].id, '2')
  assert.ok(
    new Date(rows[0].time).getTime() >
    new Date(rows[1].time).getTime()
  )
})
