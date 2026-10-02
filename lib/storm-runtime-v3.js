'use strict'

const {
  InferenceEngineV2
}=require('./inference-engine-v2')

const {
  createDeterministicObservationInference
}=require('./inference-deterministic-v2')

const {
  StormEngineV3
}=require('./storm-engine-v3')

const {
  estimateMotionField
}=require('./storm-tracker-v3/motion-field')


class StormRuntimeV3 {
  constructor({
    inferenceEngine=null,
    stormEngine=null,
    motionOptions={}
  }={}){
    this.inferenceEngine=
      inferenceEngine ||
      new InferenceEngineV2({
        algorithms:[
          createDeterministicObservationInference()
        ]
      })

    this.stormEngine=
      stormEngine ||
      new StormEngineV3({
        inferenceEngine:
          this.inferenceEngine
      })

    this.motionOptions={
      ...motionOptions
    }

    /*
     * Only the immediately preceding normalized
     * radar frame is retained for optical-flow
     * estimation.
     */
    this.previousMotionFrame=null
  }


  async processFrame({
    observedAt,
    regions=[],
    motionFrame=null,
    field=null,
    lightning=null,
    now=Date.now()
  }={}){
    let motion=null

    /*
     * Motion requires two physical radar frames.
     *
     * No previous frame means unknown motion,
     * never stationary motion.
     */
    if(
      this.previousMotionFrame &&
      motionFrame
    ){
      motion=
        estimateMotionField(
          this.previousMotionFrame,
          motionFrame,
          this.motionOptions
        )
    }


    const result=
      await this.stormEngine
        .processFrame({
          observedAt,
          regions,
          field,
          motion,
          lightning,
          now
        })


    /*
     * Advance physical-frame state only after
     * successful processing.
     */
    if(motionFrame){
      this.previousMotionFrame=
        motionFrame
    }


    return {
      ...result,
      motion
    }
  }
}


module.exports={
  StormRuntimeV3
}
