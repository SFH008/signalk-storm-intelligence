'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')

const root=path.resolve(__dirname,'..')

const v3Root=
  path.join(root,'lib','storm-tracker-v3')

const workplan=
  path.join(root,'docs','storm-tracker-v3-workplan.md')

function filesBelow(directory){
  if(!fs.existsSync(directory))return []

  return fs.readdirSync(
    directory,
    {withFileTypes:true}
  ).flatMap(entry=>{
    const file=path.join(directory,entry.name)

    return entry.isDirectory()
      ? filesBelow(file)
      : [file]
  })
}

test('Storm Tracker v3 work plan exists',()=>{
  assert.ok(
    fs.existsSync(workplan),
    'missing docs/storm-tracker-v3-workplan.md'
  )
})

test('Storm Tracker v3 is isolated from previous tracking implementations',()=>{
  const files=filesBelow(v3Root)
    .filter(file=>/\.(js|cjs|mjs)$/.test(file))

  for(const file of files){
    const source=fs.readFileSync(file,'utf8')

    assert.doesNotMatch(
      source,
      /require\s*\([^)]*storm-tracker(?:\.js)?[^)]*\)/,
      `${path.relative(root,file)} imports previous tracker`
    )

    assert.doesNotMatch(
      source,
      /require\s*\([^)]*storm-engine(?:\.js)?[^)]*\)/,
      `${path.relative(root,file)} imports previous storm engine`
    )
  }
})

test('Storm Tracker v3 contains no provider-specific tracking logic',()=>{
  const files=filesBelow(v3Root)
    .filter(file=>/\.(js|cjs|mjs)$/.test(file))

  const providers=
    /\b(aemet|ipma|noa|hnms|dwd|dpc|rainviewer|eumetsat|meteo[- ]?france)\b/i

  for(const file of files){
    const source=fs.readFileSync(file,'utf8')

    assert.doesNotMatch(
      source,
      providers,
      `${path.relative(root,file)} contains provider-specific logic`
    )
  }
})

test('Storm Tracker v3 does not contain legacy assignment machinery',()=>{
  const files=filesBelow(v3Root)
    .filter(file=>/\.(js|cjs|mjs)$/.test(file))

  for(const file of files){
    const source=fs.readFileSync(file,'utf8')

    assert.doesNotMatch(
      source,
      /\bsolveGlobalAssignment\b/,
      `${path.relative(root,file)} contains legacy assignment machinery`
    )

    assert.doesNotMatch(
      source,
      /\bmatchDistanceM\b/,
      `${path.relative(root,file)} contains distance-fallback tracking`
    )
  }
})
