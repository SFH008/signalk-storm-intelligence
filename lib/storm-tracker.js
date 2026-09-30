'use strict'


function bearingDegrees(a,b) {
  if(!a||!b)return null

  const rad=x=>x*Math.PI/180
  const deg=x=>x*180/Math.PI

  const lat1=rad(Number(a[1]))
  const lat2=rad(Number(b[1]))
  const dLon=rad(Number(b[0])-Number(a[0]))

  const y=Math.sin(dLon)*Math.cos(lat2)
  const x=
    Math.cos(lat1)*Math.sin(lat2)-
    Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon)

  let value=deg(Math.atan2(y,x))
  value=(value+360)%360

  return Number.isFinite(value)
    ? value
    : null
}

function angleDifferenceDegrees(a,b) {
  if(!Number.isFinite(a)||!Number.isFinite(b))
    return null

  let d=Math.abs(a-b)%360
  if(d>180)d=360-d
  return d
}

function signedAngleDifferenceDegrees(from,to) {
  if(!Number.isFinite(from)||!Number.isFinite(to))
    return null

  return (to-from+540)%360-180
}

function associationPairOrder(a,b) {
  return (
    a.cost-b.cost ||
    b.iou-a.iou ||
    a.distanceMeters-b.distanceMeters ||
    a.trackId.localeCompare(b.trackId) ||
    a.currentIndex-b.currentIndex
  )
}


function solveGlobalAssignment(inputPairs=[]) {
  /*
   * Provider-neutral minimum-cost bipartite assignment.
   *
   * Contract:
   *   1. maximize number of eligible track/current matches
   *   2. minimize total association cost
   *   3. deterministic regardless of input pair ordering
   *
   * Missing track/current pairs are not eligible associations.
   */

  const pairs=(inputPairs||[])
    .filter(pair=>
      pair &&
      pair.trackId!=null &&
      Number.isInteger(pair.currentIndex) &&
      Number.isFinite(pair.cost)
    )

  if(!pairs.length)return new Map()

  const trackIds=[
    ...new Set(pairs.map(pair=>String(pair.trackId)))
  ].sort((a,b)=>a.localeCompare(b))

  const currentIndexes=[
    ...new Set(pairs.map(pair=>pair.currentIndex))
  ].sort((a,b)=>a-b)

  /*
   * Canonicalize duplicate edges. Keep the same ordering semantics
   * already used by the tracker.
   */
  const edgeByKey=new Map()

  for(const pair of [...pairs].sort(associationPairOrder)){
    const key=`${pair.trackId}\u0000${pair.currentIndex}`
    if(!edgeByKey.has(key))
      edgeByKey.set(key,pair)
  }

  const maxPairCost=Math.max(
    0,
    ...pairs.map(pair=>Math.abs(pair.cost))
  )

  /*
   * One additional real match must always be preferable to any
   * possible reduction in the sum of pair costs.
   */
  const unmatchedCost=
    (maxPairCost+1)*(trackIds.length+1)

  const invalidCost=
    unmatchedCost*(trackIds.length+1)

  /*
   * Add one dummy column per track. Therefore columns >= rows and
   * every track can always remain unmatched.
   */
  const realColumnCount=currentIndexes.length
  const columnCount=realColumnCount+trackIds.length
  const rowCount=trackIds.length

  const cost=Array.from(
    {length:rowCount},
    (_,row)=>{
      const trackId=trackIds[row]

      return Array.from(
        {length:columnCount},
        (_,col)=>{
          if(col>=realColumnCount)
            return unmatchedCost

          const currentIndex=currentIndexes[col]
          const key=`${trackId}\u0000${currentIndex}`
          const pair=edgeByKey.get(key)

          return pair
            ? pair.cost
            : invalidCost
        }
      )
    }
  )

  /*
   * Hungarian algorithm for rows <= columns.
   * 1-based arrays follow the conventional formulation.
   */
  const u=new Array(rowCount+1).fill(0)
  const v=new Array(columnCount+1).fill(0)
  const pcol=new Array(columnCount+1).fill(0)
  const way=new Array(columnCount+1).fill(0)

  for(let i=1;i<=rowCount;i++){
    pcol[0]=i

    let j0=0

    const minv=
      new Array(columnCount+1).fill(Infinity)

    const used=
      new Array(columnCount+1).fill(false)

    do{
      used[j0]=true

      const i0=pcol[j0]

      let delta=Infinity
      let j1=0

      for(let j=1;j<=columnCount;j++){
        if(used[j])continue

        const cur=
          cost[i0-1][j-1]-
          u[i0]-
          v[j]

        if(
          cur<minv[j] ||
          (
            cur===minv[j] &&
            j0<way[j]
          )
        ){
          minv[j]=cur
          way[j]=j0
        }

        if(
          minv[j]<delta ||
          (
            minv[j]===delta &&
            (j1===0 || j<j1)
          )
        ){
          delta=minv[j]
          j1=j
        }
      }

      for(let j=0;j<=columnCount;j++){
        if(used[j]){
          u[pcol[j]]+=delta
          v[j]-=delta
        }else{
          minv[j]-=delta
        }
      }

      j0=j1

    }while(pcol[j0]!==0)

    do{
      const j1=way[j0]
      pcol[j0]=pcol[j1]
      j0=j1
    }while(j0!==0)
  }

  const result=new Map()

  for(let j=1;j<=realColumnCount;j++){
    const row=pcol[j]
    if(row===0)continue

    const trackId=trackIds[row-1]
    const currentIndex=currentIndexes[j-1]
    const key=`${trackId}\u0000${currentIndex}`
    const pair=edgeByKey.get(key)

    if(pair)
      result.set(currentIndex,pair)
  }

  return result
}

class StormTracker {
  constructor(config={},helpers={}) {
    this.config={
      matchDistanceM:50000,
      historyFrames:8,
      maxMissedFrames:1,
      maxAssociationSpeedMps:Infinity,
      minPredictionSamples:2,
      maxEstablishedTurnDeg:Infinity,
      minDirectionalSpeedMps:3,
      directionConsensusWindow:4,
      minConsensusTurnDeg:20,
      maxConsensusReversals:Infinity,
      ...config
    }

    const required=[
      'centroidGeometry',
      'polygonIoU',
      'haversine',
      'robustTrackVelocity',
      'localPoint',
      'translateGeometryLocal'
    ]

    for(const name of required){
      if(typeof helpers[name]!=='function'){
        throw new TypeError(`StormTracker helper missing: ${name}`)
      }
    }

    this.helpers=helpers
    this.tracks=new Map()
    this.trackState=new Map()
    this.closedTracks=[]
    this.nextTrack=1
  }

  predictedTrackCentroid(track,history,epochMs) {
    const {
      robustTrackVelocity,
      localPoint
    }=this.helpers

    const last=track?.centroid
    if(!last)return null

    const velocity=robustTrackVelocity(history)
    const dt=(Number(epochMs)-Number(track.lastSeenMs))/1000

    if(
      velocity.samples>=this.config.minPredictionSamples &&
      Number.isFinite(dt) &&
      dt>0 &&
      Number.isFinite(velocity.east) &&
      Number.isFinite(velocity.north)
    ){
      return localPoint(
        last,
        velocity.east*dt,
        velocity.north*dt
      )
    }

    return last
  }

  predictedTrackGeometry(track,history,epochMs) {
    const {
      robustTrackVelocity,
      translateGeometryLocal
    }=this.helpers

    const geometry=track?.geometry
    if(!geometry)return null

    const velocity=robustTrackVelocity(history)
    const dt=(Number(epochMs)-Number(track.lastSeenMs))/1000

    if(
      velocity.samples>=this.config.minPredictionSamples &&
      Number.isFinite(dt) &&
      dt>0 &&
      Number.isFinite(velocity.east) &&
      Number.isFinite(velocity.north)
    ){
      return translateGeometryLocal(
        geometry,
        velocity.east,
        velocity.north,
        dt
      )
    }

    return geometry
  }

  directionConsensusReversals(
    history,
    candidateCentroid,
    epochMs
  ) {
    const {haversine}=this.helpers

    const points=[
      ...(history||[]),
      {
        epochMs,
        centroid:candidateCentroid
      }
    ]

    /*
     * Number of recent motion segments considered.
     * Four segments produce up to three recent turns.
     */
    const window=Math.max(
      2,
      Number(this.config.directionConsensusWindow)||4
    )

    const firstSegment=Math.max(
      1,
      points.length-window
    )

    let previousCourse=null
    let previousMeaningfulTurnSign=0
    let reversals=0

    for(let i=firstSegment;i<points.length;i++){
      const previous=points[i-1]
      const current=points[i]

      const dtSec=
        (Number(current?.epochMs)-
         Number(previous?.epochMs))/1000

      const distanceMeters=
        previous?.centroid && current?.centroid
          ? haversine(
              previous.centroid,
              current.centroid
            )
          : null

      const speedMps=
        Number.isFinite(dtSec) &&
        dtSec>0 &&
        Number.isFinite(distanceMeters)
          ? distanceMeters/dtSec
          : null

      /*
       * Low-speed motion breaks directional continuity.
       * Never bridge across it.
       */
      if(
        !Number.isFinite(speedMps) ||
        speedMps<this.config.minDirectionalSpeedMps
      ){
        previousCourse=null
        previousMeaningfulTurnSign=0
        continue
      }

      const course=
        bearingDegrees(
          previous.centroid,
          current.centroid
        )

      if(
        Number.isFinite(previousCourse) &&
        Number.isFinite(course)
      ){
        const turn=
          signedAngleDifferenceDegrees(
            previousCourse,
            course
          )

        if(
          Number.isFinite(turn) &&
          Math.abs(turn)>=this.config.minConsensusTurnDeg
        ){
          const sign=Math.sign(turn)

          if(
            previousMeaningfulTurnSign!==0 &&
            sign!==previousMeaningfulTurnSign
          ){
            reversals++
          }

          previousMeaningfulTurnSign=sign
        }
      }

      previousCourse=course
    }

    return reversals
  }

  snapshotState() {
    const clone=value=>
      value==null
        ? value
        : JSON.parse(JSON.stringify(value))

    const activeTracks=[...this.trackState.entries()]
      .map(([trackId,state])=>({
        trackId,

        history:(this.tracks.get(trackId)||[]).map(item=>({
          epochMs:item.epochMs,

          observedAt:
            item.observedAt ??
            null,

          geometry:
            clone(item.geometry ?? null),

          centroid:
            Array.isArray(item.centroid)
              ? [...item.centroid]
              : null,

          areaKm2:
            item.areaKm2 ??
            null,

          reflectivity:
            clone(item.reflectivity ?? null)
        })),

        lifecycle:{
          status:'active',
          firstSeenMs:state.firstSeenMs,
          lastSeenMs:state.lastSeenMs,
          observations:state.observations,
          missedFrames:state.missedFrames,
          parentTrackId:
            state.parentTrackId??
            null
        }
      }))
      .sort((a,b)=>a.trackId.localeCompare(b.trackId))

    return {
      version:2,
      nextTrack:this.nextTrack,
      activeTracks,

      closedTracks:this.closedTracks.map(item=>({
        trackId:item.trackId,
        lifecycle:{...item.lifecycle}
      }))
    }
  }

  restoreState(snapshot) {
    if(
      !snapshot ||
      typeof snapshot!=='object'
    ){
      throw new TypeError(
        'StormTracker snapshot must be an object'
      )
    }

    const version=Number(snapshot.version)

    if(version!==1 && version!==2){
      throw new RangeError(
        `Unsupported StormTracker snapshot version: ${snapshot.version}`
      )
    }

    const activeTracks=
      Array.isArray(snapshot.activeTracks)
        ? snapshot.activeTracks
        : []

    const closedTracks=
      Array.isArray(snapshot.closedTracks)
        ? snapshot.closedTracks
        : []

    const tracks=new Map()
    const trackState=new Map()

    const clone=value=>
      value==null
        ? value
        : JSON.parse(JSON.stringify(value))

    for(const item of activeTracks){
      if(
        !item ||
        typeof item.trackId!=='string'
      )continue

      const rawHistory=
        Array.isArray(item.history)
          ? item.history
          : []

      const history=rawHistory
        .map(entry=>({
          epochMs:entry?.epochMs,

          observedAt:
            version>=2
              ? entry?.observedAt ?? null
              : null,

          geometry:
            version>=2
              ? clone(entry?.geometry ?? null)
              : null,

          centroid:
            Array.isArray(entry?.centroid)
              ? [...entry.centroid]
              : null,

          areaKm2:
            version>=2
              ? entry?.areaKm2 ?? null
              : null,

          reflectivity:
            version>=2
              ? clone(entry?.reflectivity ?? null)
              : null
        }))
        .filter(entry=>
          Number.isFinite(Number(entry.epochMs)) &&
          Array.isArray(entry.centroid)
        )

      const last=history.at(-1)
      const lifecycle=item.lifecycle||{}

      tracks.set(
        item.trackId,
        history
      )

      trackState.set(
        item.trackId,
        {
          geometry:
            clone(last?.geometry ?? null),

          centroid:
            Array.isArray(last?.centroid)
              ? [...last.centroid]
              : null,

          sourceId:null,

          firstSeenMs:
            lifecycle.firstSeenMs ?? null,

          lastSeenMs:
            lifecycle.lastSeenMs ??
            last?.epochMs ??
            null,

          observations:
            Number.isFinite(Number(lifecycle.observations))
              ? Number(lifecycle.observations)
              : history.length,

          missedFrames:
            Number.isFinite(Number(lifecycle.missedFrames))
              ? Number(lifecycle.missedFrames)
              : 0,

          parentTrackId:
            lifecycle.parentTrackId ??
            null
        }
      )
    }

    this.tracks=tracks
    this.trackState=trackState

    this.closedTracks=closedTracks
      .filter(item=>
        item &&
        typeof item.trackId==='string'
      )
      .map(item=>({
        trackId:item.trackId,
        lifecycle:{
          ...(item.lifecycle||{})
        }
      }))

    /*
     * Never allow an already-issued numeric storm id to be reused,
     * even if persisted nextTrack is stale or malformed.
     */
    let highestIssued=0

    for(const item of [
      ...activeTracks,
      ...closedTracks
    ]){
      const match=
        /^storm-(\d+)$/.exec(
          String(item?.trackId||'')
        )

      if(match){
        highestIssued=Math.max(
          highestIssued,
          Number(match[1])
        )
      }
    }

    const requestedNext=
      Number(snapshot.nextTrack)

    this.nextTrack=Math.max(
      1,
      highestIssued+1,
      Number.isInteger(requestedNext) &&
      requestedNext>0
        ? requestedNext
        : 1
    )
  }

  update(features,epochMs) {
    const {
      centroidGeometry,
      polygonIoU,
      haversine
    }=this.helpers

    const current=(features||[])
      .map((f,i)=>({
        sourceId:f.id||`cell-${i}`,
        geometry:f.geometry,
        properties:f.properties||{},
        centroid:centroidGeometry(f.geometry)
      }))
      .filter(c=>c.centroid)

    const active=[...this.trackState.entries()].map(
      ([trackId,state])=>({
        trackId,
        ...state,
        history:this.tracks.get(trackId)||[]
      })
    )

    const pairs=[]

    for(const track of active){
      const predicted=this.predictedTrackCentroid(
        track,
        track.history,
        epochMs
      )

      const predictedGeometry=this.predictedTrackGeometry(
        track,
        track.history,
        epochMs
      )

      for(
        let currentIndex=0;
        currentIndex<current.length;
        currentIndex++
      ){
        const cell=current[currentIndex]
        const iou=polygonIoU(
          predictedGeometry,
          cell.geometry
        )

        const distanceMeters=predicted
          ? haversine(predicted,cell.centroid)
          : Infinity

        const dtSec=
          (Number(epochMs)-Number(track.lastSeenMs))/1000

        const displacementMeters=
          haversine(track.centroid,cell.centroid)

        const impliedSpeedMps=
          Number.isFinite(dtSec) && dtSec>0
            ? displacementMeters/dtSec
            : null

        if(
          Number.isFinite(this.config.maxAssociationSpeedMps) &&
          Number.isFinite(impliedSpeedMps) &&
          impliedSpeedMps>this.config.maxAssociationSpeedMps
        )continue

        if(
          Number.isFinite(this.config.maxEstablishedTurnDeg) &&
          track.history.length>=2
        ){
          const previous=
            track.history.at(-2)

          const latest=
            track.history.at(-1)

          const previousDtSec=
            (Number(latest?.epochMs)-
             Number(previous?.epochMs))/1000

          const previousDistanceMeters=
            previous?.centroid && latest?.centroid
              ? haversine(
                  previous.centroid,
                  latest.centroid
                )
              : null

          const previousSpeedMps=
            Number.isFinite(previousDtSec) &&
            previousDtSec>0 &&
            Number.isFinite(previousDistanceMeters)
              ? previousDistanceMeters/previousDtSec
              : null

          if(
            Number.isFinite(previousSpeedMps) &&
            Number.isFinite(impliedSpeedMps) &&
            previousSpeedMps>=this.config.minDirectionalSpeedMps &&
            impliedSpeedMps>=this.config.minDirectionalSpeedMps
          ){
            const previousCourse=
              bearingDegrees(
                previous.centroid,
                latest.centroid
              )

            const candidateCourse=
              bearingDegrees(
                latest.centroid,
                cell.centroid
              )

            const turnDeg=
              angleDifferenceDegrees(
                previousCourse,
                candidateCourse
              )

            if(
              Number.isFinite(turnDeg) &&
              turnDeg>this.config.maxEstablishedTurnDeg
            )continue
          }
        }

        if(
          Number.isFinite(this.config.maxConsensusReversals) &&
          track.history.length>=3
        ){
          const consensusReversals=
            this.directionConsensusReversals(
              track.history,
              cell.centroid,
              epochMs
            )

          if(
            consensusReversals>
            this.config.maxConsensusReversals
          )continue
        }

        if(!(
          iou>0 ||
          distanceMeters<=this.config.matchDistanceM
        ))continue

        const distanceScore=Math.max(
          0,
          Math.min(
            1,
            distanceMeters/
              Math.max(1,this.config.matchDistanceM)
          )
        )

        pairs.push({
          trackId:track.trackId,
          currentIndex,
          iou,
          distanceMeters,
          cost:0.6*(1-iou)+0.4*distanceScore
        })
      }
    }

    const assignmentByCurrent=
      solveGlobalAssignment(pairs)

    const assignedTracks=
      new Set(
        [...assignmentByCurrent.values()]
          .map(pair=>pair.trackId)
      )

    const mergedTracks=new Set()

    for(const [currentIndex,survivor] of assignmentByCurrent){
      const competitors=pairs
        .filter(pair=>
          pair.currentIndex===currentIndex &&
          pair.trackId!==survivor.trackId &&
          !assignedTracks.has(pair.trackId) &&
          pair.iou>0
        )
        .sort(associationPairOrder)

      for(const competitor of competitors){
        const state=this.trackState.get(
          competitor.trackId
        )

        if(
          !state ||
          mergedTracks.has(competitor.trackId)
        )continue

        this.closedTracks.push({
          trackId:competitor.trackId,
          lifecycle:{
            status:'merged',
            firstSeenMs:state.firstSeenMs,
            lastSeenMs:state.lastSeenMs,
            observations:state.observations,
            missedFrames:state.missedFrames,
            parentTrackId:
              state.parentTrackId??null,
            mergedInto:survivor.trackId,
            closedAtMs:epochMs
          }
        })

        this.trackState.delete(competitor.trackId)
        this.tracks.delete(competitor.trackId)
        mergedTracks.add(competitor.trackId)
      }
    }

    const seenTracks=new Set()

    const results=current.map(
      (cell,currentIndex)=>{
        const assigned=assignmentByCurrent.get(
          currentIndex
        )

        let trackId=assigned?.trackId||null
        let parentTrackId=null

        if(!trackId){
          const splitParent=pairs
            .filter(pair=>
              pair.currentIndex===currentIndex &&
              assignedTracks.has(pair.trackId) &&
              pair.iou>0
            )
            .sort(associationPairOrder)[0]

          parentTrackId=
            splitParent?.trackId||null

          trackId=`storm-${this.nextTrack++}`
        }

        seenTracks.add(trackId)

        const old=this.tracks.get(trackId)||[]
        const previousObservation=old.at(-1)

        const historyEntry={
          epochMs,

          observedAt:
            cell.properties?.observedAt ??
            (
              Number.isFinite(Number(epochMs))
                ? new Date(Number(epochMs)).toISOString()
                : null
            ),

          geometry:cell.geometry,

          centroid:cell.centroid,

          areaKm2:
            cell.properties?.detection?.areaKm2 ??
            cell.properties?.areaKm2 ??
            null,

          reflectivity:
            cell.properties?.evidence?.reflectivity ??
            null
        }

        const history=(
          previousObservation?.epochMs===epochMs
            ? [
                ...old.slice(0,-1),
                historyEntry
              ]
            : [
                ...old,
                historyEntry
              ]
        ).slice(
          -Math.max(
            2,
            this.config.historyFrames
          )
        )

        this.tracks.set(trackId,history)

        const existing=this.trackState.get(trackId)

        this.trackState.set(trackId,{
          geometry:cell.geometry,
          centroid:cell.centroid,
          sourceId:cell.sourceId,
          firstSeenMs:
            existing?.firstSeenMs??epochMs,
          lastSeenMs:epochMs,
          observations:
            (existing?.observations||0)+1,
          missedFrames:0,
          parentTrackId:
            existing?.parentTrackId??
            parentTrackId??
            null
        })

        const firstSeenMs=
          existing?.firstSeenMs??
          epochMs

        const observationCount=
          (existing?.observations||0)+1

        return {
          ...cell,

          trackId,

          firstSeenMs,
          lastSeenMs:epochMs,
          observationCount,
          missedFrames:0,

          parentTrackId:
            existing?.parentTrackId??
            parentTrackId??
            null,

          mergedIntoTrackId:null,

          history
        }
      }
    )

    for(
      const [trackId,state]
      of [...this.trackState.entries()]
    ){
      if(
        seenTracks.has(trackId) ||
        mergedTracks.has(trackId)
      )continue

      const missedFrames=
        (state.missedFrames||0)+1

      if(
        missedFrames>
        this.config.maxMissedFrames
      ){
        this.closedTracks.push({
          trackId,
          lifecycle:{
            status:'expired',
            firstSeenMs:state.firstSeenMs,
            lastSeenMs:state.lastSeenMs,
            observations:state.observations,
            missedFrames,
            parentTrackId:
              state.parentTrackId??null,
            mergedInto:null,
            closedAtMs:epochMs
          }
        })

        this.trackState.delete(trackId)
        this.tracks.delete(trackId)
      }else{
        this.trackState.set(trackId,{
          ...state,
          missedFrames
        })
      }
    }

    return results
  }
}

module.exports={
  StormTracker,
  associationPairOrder,
  solveGlobalAssignment
}
