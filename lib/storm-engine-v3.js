'use strict'

const {
  attachObservationInference,
  isAcceptedStormObservation
}=require('./storm-observation-inference')

const {
  createIdentityState,
  advanceIdentityState
}=require('./storm-tracker-v3/identity-state')

const {
  advectGeographicGeometry
}=require('./storm-tracker-v3/geometry-advection')

const {
  buildRelationshipGraph
}=require('./storm-tracker-v3/relationship-graph')

const {
  classifyLineage
}=require('./storm-tracker-v3/lineage')

const {
  projectHazardGeometry
}=require('./storm-tracker-v3/forecast')

const {
  calculateStormSeverityV1
}=require('./storm-severity-v1')

const {
  attachLightning
}=require('./lightning-engine')

const {
  StormEvolution
}=require('./storm-evolution')


function observationId(
  observation
){
  const id=
    observation?.id ??
    observation
      ?.properties
      ?.observationId ??
    observation
      ?.properties
      ?.sourceId

  if(
    id===null ||
    id===undefined ||
    id===''
  ){
    throw new TypeError(
      'observation id is required'
    )
  }

  return String(id)
}


class StormEngineV3 {
  constructor({
    inferenceEngine,
    advectionOptions={
      sampleMode:'interpolated'
    }
  }={}){
    if(
      !inferenceEngine ||
      typeof inferenceEngine.inferObservation!=='function'
    ){
      throw new TypeError(
        'inferenceEngine with inferObservation() is required'
      )
    }

    this.inferenceEngine=
      inferenceEngine

    this.identity=
      createIdentityState()

    /*
     * LK motion fields are intentionally sparse.
     *
     * Operational geometry advection therefore uses
     * the validated local interpolation layer rather
     * than requiring exact support at every boundary
     * vertex.
     */
    this.advectionOptions={
      ...advectionOptions
    }

    /*
     * Accepted observations from only the immediately
     * preceding frame.
     *
     * Persistent history belongs to identity state;
     * this is temporal association input only.
     */
    this.previousAccepted=[]

    /*
     * Timestamp of the immediately preceding
     * processed frame.
     *
     * Forecast scaling must use the real radar
     * frame interval rather than assuming 5 min.
     */
    this.previousObservedAt=null

    /*
     * Provider-neutral temporal storm evolution.
     *
     * History is keyed by persistent V3 track identity.
     * This has no dependency on the legacy StormEngine.
     */
    this.evolution=
      new StormEvolution()
  }


  async inferRegions(
    regions,
    now
  ){
    const observations=[]

    for(const region of regions){
      const inference=
        await this.inferenceEngine
          .inferObservation({
            observation:region,

            evidence:
              region
                ?.properties
                ?.evidence ??
              null,

            now
          })

      observations.push(
        attachObservationInference(
          region,
          inference
        )
      )
    }

    return observations
  }


  predictPrevious({
    field,
    motion
  }={}){
    if(
      !this.previousAccepted.length
    ){
      return []
    }

    /*
     * Missing motion evidence is not stationary motion.
     *
     * Without a field and motion field we cannot create
     * predicted geometry and therefore cannot establish
     * temporal relationships.
     */
    if(
      !field ||
      !motion
    ){
      return []
    }


    const predicted=[]

    for(
      const observation
      of this.previousAccepted
    ){
      const prediction=
        advectGeographicGeometry(
          observation.geometry,
          field,
          motion,
          this.advectionOptions
        )

      /*
       * Unsupported advection is deliberately omitted
       * from the relationship graph.
       *
       * It must NOT become a disappearance merely
       * because motion evidence was unavailable.
       */
      if(
        !prediction.supported ||
        !prediction.geometry
      ){
        continue
      }


      predicted.push({
        ...observation,

        id:
          observationId(
            observation
          ),

        geometry:
          prediction.geometry,

        properties:{
          ...(observation.properties||{}),

          trackingPrediction:{
            uncertaintyPixels:
              prediction.uncertaintyPixels,

            support:
              prediction.support ??
              null
          }
        }
      })
    }

    return predicted
  }


  buildLineage({
    accepted,
    predicted
  }){
    /*
     * First frame:
     * every accepted observation is a birth.
     */
    if(
      !this.previousAccepted.length
    ){
      return {
        relationships:[],

        births:
          accepted.map(
            observationId
          ),

        disappearances:[]
      }
    }


    const previousIds=
      predicted.map(
        observationId
      )

    const currentIds=
      accepted.map(
        observationId
      )


    const graph=
      buildRelationshipGraph(
        predicted,
        accepted
      )


    /*
     * Only successfully predicted previous observations
     * participate in lineage classification.
     *
     * Previous observations without usable motion stay
     * unresolved in identity-state rather than being
     * falsely declared disappeared.
     */
    return classifyLineage(
      previousIds,
      currentIds,
      graph.edges
    )
  }


  async processFrame({
    observedAt,
    regions=[],
    field=null,
    motion=null,
    lightning=null,
    now=Date.now()
  }={}){
    if(
      typeof observedAt!=='string' ||
      !observedAt
    ){
      throw new TypeError(
        'observedAt is required'
      )
    }

    if(!Array.isArray(regions)){
      throw new TypeError(
        'regions must be an array'
      )
    }


    const observations=
      await this.inferRegions(
        regions,
        now
      )


    const accepted=
      observations.filter(
        isAcceptedStormObservation
      )


    const predicted=
      this.predictPrevious({
        field,
        motion
      })


    const lineage=
      this.buildLineage({
        accepted,
        predicted
      })


    this.identity=
      advanceIdentityState(
        this.identity,
        {
          observedAt,
          ...lineage
        }
      )


    const previousTime=
      this.previousObservedAt
        ? Date.parse(
            this.previousObservedAt
          )
        : NaN

    const currentTime=
      Date.parse(
        observedAt
      )

    const baseIntervalMinutes=
      (
        Number.isFinite(previousTime) &&
        Number.isFinite(currentTime) &&
        currentTime>previousTime
      )
        ? (
            currentTime-
            previousTime
          )/
          60000
        : null


    const hazards=
      accepted.map(
        observation=>{
          const id=
            observationId(
              observation
            )

          /*
           * Motion estimated from the previous/current
           * radar pair is the authoritative motion basis
           * for forecasting the current observation.
           *
           * Missing motion, field or valid frame timing
           * stays missing. Never infer stationary motion.
           */
          const forecast=
            (
              field &&
              motion &&
              Number.isFinite(
                baseIntervalMinutes
              ) &&
              baseIntervalMinutes>0
            )
              ? projectHazardGeometry({
                  geometry:
                    observation.geometry,

                  field,

                  motion,

                  baseIntervalMinutes,

                  advectionOptions:
                    this.advectionOptions
                })
              : []

          const trackId=
            this.identity
              .activeByObservation
              .get(id) ??
            null

          const evolution=
            trackId
              ? this.evolution.update(
                  trackId,
                  observation
                )
              : null

          const lightningEvidence=
            lightning?.available===true
              ? {
                  available:true,
                  ...attachLightning(
                    [observation],
                    lightning.strikes||[],
                    now,
                    {
                      lookbackMinutes:
                        lightning.lookbackMinutes,
                      associationRadiusM:
                        lightning.associationRadiusM,
                      evidenceWeight:0
                    }
                  )[0].lightning
                }
              : {
                  available:false
                }

          const severity=
            calculateStormSeverityV1(
              observation,
              evolution,
              lightningEvidence
            )

          return {
            ...observation,

            id,

            trackId,

            forecast,

            evolution,

            lightning:
              lightningEvidence,

            severity
          }
        }
      )


    /*
     * Advance temporal observation state only after the
     * complete current frame has been processed.
     */
    this.previousAccepted=
      accepted

    this.previousObservedAt=
      observedAt


    return {
      observedAt,

      observations,

      acceptedObservations:
        accepted,

      predictedPrevious:
        predicted,

      lineage,

      identity:
        this.identity,

      hazards
    }
  }
}


module.exports={
  StormEngineV3
}
