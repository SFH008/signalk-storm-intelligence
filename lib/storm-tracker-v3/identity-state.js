'use strict'


function createIdentityState(){
  return {
    nextTrackNumber:1,

    tracks:new Map(),

    /*
     * Maps only observations in the immediately
     * current frame to persistent track identities.
     */
    activeByObservation:new Map(),

    unresolvedPrevious:[],
    unresolvedCurrent:[]
  }
}


function uniqueSorted(values){
  return [
    ...new Set(values)
  ].sort()
}


function createTrack(
  state,
  observationId,
  observedAt
){
  const trackId=
    `track-${state.nextTrackNumber++}`

  state.tracks.set(
    trackId,
    {
      trackId,

      firstSeen:observedAt,
      lastSeen:observedAt,

      observations:[
        observationId
      ],

      status:'active',

      endedAt:null
    }
  )

  return trackId
}


function endTrack(
  state,
  trackId,
  observedAt,
  status='ended'
){
  const track=
    state.tracks.get(trackId)

  if(!track){
    return
  }

  track.status=status
  track.endedAt=observedAt
}


function advanceIdentityState(
  state,
  transition
){
  if(!state){
    throw new TypeError(
      'identity state is required'
    )
  }

  if(!transition){
    throw new TypeError(
      'transition is required'
    )
  }

  const observedAt=
    transition.observedAt

  if(
    typeof observedAt!=='string' ||
    !observedAt
  ){
    throw new TypeError(
      'observedAt is required'
    )
  }


  /*
   * Identity from the previous frame is evidence
   * available only after lineage has been resolved.
   */
  const previousActive=
    new Map(
      state.activeByObservation
    )

  const nextActive=
    new Map()

  const unresolvedPrevious=[]
  const unresolvedCurrent=[]


  const relationships=
    Array.isArray(
      transition.relationships
    )
      ? transition.relationships
      : []

  const births=
    Array.isArray(
      transition.births
    )
      ? transition.births
      : []

  const disappearances=
    Array.isArray(
      transition.disappearances
    )
      ? transition.disappearances
      : []


  /*
   * Process resolved topology.
   *
   * Only validated one-to-one continuation may
   * inherit persistent identity in V3.6.
   */
  for(const relationship of relationships){
    const previous=
      Array.isArray(
        relationship.previous
      )
        ? relationship.previous
        : []

    const current=
      Array.isArray(
        relationship.current
      )
        ? relationship.current
        : []


    if(
      relationship.type==='continuation' &&
      previous.length===1 &&
      current.length===1
    ){
      const previousId=
        previous[0]

      const currentId=
        current[0]

      const trackId=
        previousActive.get(
          previousId
        )

      /*
       * Never manufacture continuity if the previous
       * observation did not already possess identity.
       */
      if(!trackId){
        unresolvedPrevious.push(
          previousId
        )

        unresolvedCurrent.push(
          currentId
        )

        continue
      }


      const track=
        state.tracks.get(
          trackId
        )

      if(!track){
        unresolvedPrevious.push(
          previousId
        )

        unresolvedCurrent.push(
          currentId
        )

        continue
      }


      track.lastSeen=
        observedAt

      track.observations.push(
        currentId
      )

      track.status='active'
      track.endedAt=null

      nextActive.set(
        currentId,
        trackId
      )

      continue
    }


    /*
     * Split / merge / complex are intentionally
     * unresolved in V3.6.
     *
     * Do not choose an identity winner.
     */
    for(const previousId of previous){
      unresolvedPrevious.push(
        previousId
      )

      const trackId=
        previousActive.get(
          previousId
        )

      if(trackId){
        endTrack(
          state,
          trackId,
          observedAt
        )
      }
    }

    for(const currentId of current){
      unresolvedCurrent.push(
        currentId
      )
    }
  }


  /*
   * Births create identity only because lineage has
   * already established that they are unmatched
   * current observations.
   */
  for(const observationId of births){
    if(nextActive.has(observationId)){
      continue
    }

    const trackId=
      createTrack(
        state,
        observationId,
        observedAt
      )

    nextActive.set(
      observationId,
      trackId
    )
  }


  /*
   * Deaths terminate the previous persistent identity.
   */
  for(const observationId of disappearances){
    const trackId=
      previousActive.get(
        observationId
      )

    if(!trackId){
      continue
    }

    endTrack(
      state,
      trackId,
      observedAt
    )
  }


  /*
   * A previous identity that received no lineage result
   * must not remain active.
   *
   * This is intentionally not classified as death:
   * absence of usable relationship evidence is unresolved.
   */
  const accountedPrevious=
    new Set()

  for(const relationship of relationships){
    const previous=
      Array.isArray(
        relationship.previous
      )
        ? relationship.previous
        : []

    for(const previousId of previous){
      accountedPrevious.add(
        previousId
      )
    }
  }

  for(const previousId of disappearances){
    accountedPrevious.add(
      previousId
    )
  }

  for(
    const [
      previousId,
      trackId
    ]
    of previousActive
  ){
    if(
      accountedPrevious.has(
        previousId
      )
    ){
      continue
    }

    unresolvedPrevious.push(
      previousId
    )

    endTrack(
      state,
      trackId,
      observedAt,
      'unresolved'
    )
  }


  state.activeByObservation=
    nextActive

  state.unresolvedPrevious=
    uniqueSorted(
      unresolvedPrevious
    )

  state.unresolvedCurrent=
    uniqueSorted(
      unresolvedCurrent
    )

  return state
}


module.exports={
  createIdentityState,
  advanceIdentityState
}
