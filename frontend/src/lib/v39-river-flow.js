// Edge keys are undirected. Distance along the river to a water outlet determines flow.
export function resolveV39RiverFlowDirections(riverData){
  const water=riverData?.cornerWaterLinkSet instanceof Set?riverData.cornerWaterLinkSet:new Set();
  const edges=new Set([...(riverData?.cornerEdgeSet instanceof Set?riverData.cornerEdgeSet:[]),...water]);
  const adjacency=new Map(),distance=new Map(),queue=[];
  for(const key of edges){
    const nodes=String(key).split('|');if(nodes.length!==2)continue;
    const [a,b]=nodes;
    if(!adjacency.has(a))adjacency.set(a,new Set());if(!adjacency.has(b))adjacency.set(b,new Set());
    adjacency.get(a).add(b);adjacency.get(b).add(a);
  }
  for(const edge of water)for(const node of String(edge).split('|'))if(!distance.has(node)){distance.set(node,0);queue.push(node);}
  for(let i=0;i<queue.length;i++)for(const next of adjacency.get(queue[i])||[])if(!distance.has(next)){
    distance.set(next,distance.get(queue[i])+1);queue.push(next);
  }
  const directions=[];
  for(const edgeKey of edges){
    const [a,b]=String(edgeKey).split('|'),da=distance.get(a),db=distance.get(b);
    if(!Number.isFinite(da)||!Number.isFinite(db)||da===db)continue;
    directions.push({edgeKey,from:da>db?a:b,to:da>db?b:a});
  }
  return directions;
}
