'use strict'


function uniqueSorted(values){
  return [
    ...new Set(values)
  ].sort()
}


function connectedComponents(
  previousIds,
  currentIds,
  edges
){
  const previousSet=
    new Set(previousIds)

  const currentSet=
    new Set(currentIds)

  const adjacency=
    new Map()


  function addNode(key){
    if(!adjacency.has(key)){
      adjacency.set(
        key,
        new Set()
      )
    }
  }


  function previousKey(id){
    return `p:${id}`
  }


  function currentKey(id){
    return `c:${id}`
  }


  for(const id of previousSet){
    addNode(
      previousKey(id)
    )
  }

  for(const id of currentSet){
    addNode(
      currentKey(id)
    )
  }

  for(const edge of edges){
    if(
      !previousSet.has(edge.from) ||
      !currentSet.has(edge.to)
    ){
      continue
    }

    const a=
      previousKey(edge.from)

    const b=
      currentKey(edge.to)

    addNode(a)
    addNode(b)

    adjacency.get(a).add(b)
    adjacency.get(b).add(a)
  }


  const seen=
    new Set()

  const components=[]


  for(const [
    start,
    neighbours
  ] of adjacency){
    /*
     * Isolated nodes are births /
     * disappearances, not lineage
     * relationship components.
     */
    if(
      seen.has(start) ||
      neighbours.size===0
    ){
      continue
    }

    const stack=[start]
    const previous=[]
    const current=[]

    while(stack.length){
      const node=
        stack.pop()

      if(seen.has(node)){
        continue
      }

      seen.add(node)

      if(node.startsWith('p:')){
        previous.push(
          node.slice(2)
        )
      } else {
        current.push(
          node.slice(2)
        )
      }

      for(
        const neighbour
        of adjacency.get(node)
      ){
        if(!seen.has(neighbour)){
          stack.push(neighbour)
        }
      }
    }

    components.push({
      previous:
        uniqueSorted(previous),

      current:
        uniqueSorted(current)
    })
  }

  return components
}


function relationshipType(
  previous,
  current
){
  if(
    previous.length===1 &&
    current.length===1
  ){
    return 'continuation'
  }

  if(
    previous.length===1 &&
    current.length>1
  ){
    return 'split'
  }

  if(
    previous.length>1 &&
    current.length===1
  ){
    return 'merge'
  }

  return 'complex'
}


function classifyLineage(
  previousIds,
  currentIds,
  edges
){
  if(!Array.isArray(previousIds)){
    throw new TypeError(
      'previousIds are required'
    )
  }

  if(!Array.isArray(currentIds)){
    throw new TypeError(
      'currentIds are required'
    )
  }

  if(!Array.isArray(edges)){
    throw new TypeError(
      'edges are required'
    )
  }


  const matchedPrevious=
    new Set(
      edges.map(
        edge=>edge.from
      )
    )

  const matchedCurrent=
    new Set(
      edges.map(
        edge=>edge.to
      )
    )


  const components=
    connectedComponents(
      previousIds,
      currentIds,
      edges
    )


  const relationships=
    components.map(
      component=>({
        type:
          relationshipType(
            component.previous,
            component.current
          ),

        previous:
          component.previous,

        current:
          component.current
      })
    )


  const births=
    uniqueSorted(
      currentIds.filter(
        id=>
          !matchedCurrent.has(id)
      )
    )


  const disappearances=
    uniqueSorted(
      previousIds.filter(
        id=>
          !matchedPrevious.has(id)
      )
    )


  return {
    relationships,
    births,
    disappearances
  }
}


module.exports={
  classifyLineage
}
