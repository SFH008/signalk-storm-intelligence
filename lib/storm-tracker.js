'use strict'

function associationPairOrder(a,b) {
  return (
    a.cost-b.cost ||
    b.iou-a.iou ||
    a.distanceMeters-b.distanceMeters ||
    a.trackId.localeCompare(b.trackId) ||
    a.currentIndex-b.currentIndex
  )
}

class StormTracker {
  constructor(config={},helpers={}) {
    this.config={
      matchDistanceM:50000,
      historyFrames:8,
      maxMissedFrames:1,
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
      velocity.samples>=2 &&
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
      velocity.samples>=2 &&
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

  snapshotState() {
    const activeTracks=[...this.trackState.entries()]
      .map(([trackId,state])=>({
        trackId,
        history:(this.tracks.get(trackId)||[]).map(item=>({
          epochMs:item.epochMs,
          centroid:[...item.centroid]
        })),
        lifecycle:{
          status:'active',
          firstSeenMs:state.firstSeenMs,
          lastSeenMs:state.lastSeenMs,
          observations:state.observations,
          missedFrames:state.missedFrames,
          parentTrackId:state.parentTrackId??null
        }
      }))
      .sort((a,b)=>a.trackId.localeCompare(b.trackId))

    return {
      version:1,
      nextTrack:this.nextTrack,
      activeTracks,
      closedTracks:this.closedTracks.map(item=>({
        trackId:item.trackId,
        lifecycle:{...item.lifecycle}
      }))
    }
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

    pairs.sort(associationPairOrder)

    const assignmentByCurrent=new Map()
    const assignedTracks=new Set()

    for(const pair of pairs){
      if(assignmentByCurrent.has(pair.currentIndex))continue
      if(assignedTracks.has(pair.trackId))continue

      assignmentByCurrent.set(pair.currentIndex,pair)
      assignedTracks.add(pair.trackId)
    }

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

        const history=(
          previousObservation?.epochMs===epochMs
            ? [
                ...old.slice(0,-1),
                {
                  epochMs,
                  centroid:cell.centroid
                }
              ]
            : [
                ...old,
                {
                  epochMs,
                  centroid:cell.centroid
                }
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

        return {
          ...cell,
          trackId,
          parentTrackId:
            parentTrackId??
            existing?.parentTrackId??
            null,
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
  associationPairOrder
}
