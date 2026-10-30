import { getHexOffsetNeighbors } from './hex-grid.js';

const key = p => `${p.x},${p.y}`;
export const v39WallEdgeKey = edge => [key(edge.from), key(edge.to)].sort().join('/');

export function isV39WallEdge(edge, map) {
  return !!edge?.from && !!edge?.to && [edge.from, edge.to].every(p =>
    Number.isInteger(p.x) && Number.isInteger(p.y) && !!map?.grid?.[p.y]?.[p.x])
    && getHexOffsetNeighbors(edge.from.x, edge.from.y).some(p => key(p) === key(edge.to));
}

export function collectV39WallOuterEdges(tiles, map, {includeOutsideMap=false}={}) {
  const occupied = new Set(tiles.map(key));
  return tiles.flatMap(from => getHexOffsetNeighbors(from.x, from.y)
    .filter(to => !occupied.has(key(to)) && (includeOutsideMap || !!map?.grid?.[to.y]?.[to.x]))
    .map(to => ({ from:{x:from.x,y:from.y}, to })));
}

// Rendering and construction previews share the same edge geometry.
export function resolveV39WallEdgeSegment(edge, centerAt, {width,height,rowStep}) {
  const a = centerAt(edge.from.x, edge.from.y), b = centerAt(edge.to.x, edge.to.y);
  const points = [{x:a.x,y:a.y-height/2}, {x:a.x+width/2,y:a.y+height/2-rowStep},
    {x:a.x+width/2,y:a.y-height/2+rowStep}, {x:a.x,y:a.y+height/2},
    {x:a.x-width/2,y:a.y-height/2+rowStep}, {x:a.x-width/2,y:a.y+height/2-rowStep}];
  const mid = {x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  return points.map((p,i) => [p,points[(i+1)%6]]).sort((aa,bb) =>
    Math.hypot((aa[0].x+aa[1].x)/2-mid.x,(aa[0].y+aa[1].y)/2-mid.y)
    - Math.hypot((bb[0].x+bb[1].x)/2-mid.x,(bb[0].y+bb[1].y)/2-mid.y))[0];
}

const logicalMetrics={width:2,height:4,rowStep:3};
const logicalCenter=(x,y)=>({x:x*2+(y&1),y:y*3});
const vertexKey=p=>`${p.x},${p.y}`;
const pairCache=new WeakMap();

export function orderV39WallConstructionEdges(edges,startKey=edges[0]&&v39WallEdgeKey(edges[0])){
  const remaining=new Map(edges.map(edge=>[v39WallEdgeKey(edge),edge]));
  const ordered=[];let next=startKey,last=null;
  while(remaining.size){
    const edge=remaining.get(next)||remaining.values().next().value;
    remaining.delete(v39WallEdgeKey(edge));ordered.push(edge);
    const segment=resolveV39WallEdgeSegment(edge,logicalCenter,logicalMetrics);
    const exit=last&&segment.some(p=>vertexKey(p)===last)?segment.find(p=>vertexKey(p)!==last):segment[1];
    last=vertexKey(exit);
    const adjacent=[...remaining].find(([,candidate])=>resolveV39WallEdgeSegment(candidate,logicalCenter,logicalMetrics).some(p=>vertexKey(p)===last));
    next=adjacent?.[0];
    if(!next)last=null;
  }
  return ordered;
}

// Two walls bordering the same outside tile form an inward notch. Keep the
// original edges for hex movement, but treat the straightened section as a pair.
export function collectV39JoinedWallPairs(structures=[]) {
  const cached=pairCache.get(structures);
  if(cached?.length===structures.length)return cached.pairs;
  const buckets=new Map(),pairs=[],used=new Set();
  for(const wall of structures){
    if(wall.kind!=='壁'||!wall.edge||!wall.wallFacilityName)continue;
    const segment=resolveV39WallEdgeSegment(wall.edge,logicalCenter,logicalMetrics);
    for(const point of segment){
      const group=`${wall.ownerId}|${wall.settlementId}|${wall.wallFacilityName}|${key(wall.edge.to)}|${vertexKey(point)}`;
      if(!buckets.has(group))buckets.set(group,[]);
      buckets.get(group).push(wall);
    }
  }
  for(const walls of buckets.values()){
    if(walls.length!==2||walls.some(w=>used.has(w.id))||key(walls[0].edge.from)===key(walls[1].edge.from))continue;
    pairs.push(walls);walls.forEach(w=>used.add(w.id));
  }
  pairCache.set(structures,{length:structures.length,pairs});return pairs;
}

export function resolveV39JoinedWallSegment(pair,centerAt,metrics){
  const segments=pair.map(w=>resolveV39WallEdgeSegment(w.edge,centerAt,metrics));
  const same=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<.01;
  const shared=segments[0].find(a=>segments[1].some(b=>same(a,b)));
  return shared?segments.map(segment=>segment.find(p=>!same(p,shared))):segments[0];
}

// Visual outline only: do not replace the defense's effect tiles or durability.
export function resolveV39SmoothedFootprintOutline(tiles,centerAt,metrics){
  const unique=[...new Map(tiles.map(tile=>[key(tile),tile])).values()];
  const edges=collectV39WallOuterEdges(unique,null,{includeOutsideMap:true});
  const walls=edges.map((edge,id)=>({id,kind:'壁',edge,ownerId:'outline',settlementId:'outline',wallFacilityName:'outline'}));
  const pairs=new Map(collectV39JoinedWallPairs(walls).flatMap(pair=>pair.map(w=>[w.id,pair]))),seen=new Set(),segments=[];
  for(const wall of walls){
    if(seen.has(wall.id))continue;
    const pair=pairs.get(wall.id);(pair||[wall]).forEach(w=>seen.add(w.id));
    segments.push(pair?resolveV39JoinedWallSegment(pair,centerAt,metrics):resolveV39WallEdgeSegment(wall.edge,centerAt,metrics));
  }
  return segments;
}

export function resolveV39WallStepStructures(map,from,to){
  const edgeKey=v39WallEdgeKey({from,to}),structures=map?.defenseStructures||[];
  const matching=structures.filter(w=>w.kind==='壁'&&(w.edge?v39WallEdgeKey(w.edge)===edgeKey
    :(w.tiles||[]).some(p=>key(p)===key(from)||key(p)===key(to))));
  const ids=new Set(matching.map(w=>w.id));
  for(const pair of collectV39JoinedWallPairs(structures))if(pair.some(w=>ids.has(w.id)))pair.forEach(w=>ids.add(w.id));
  return structures.filter(w=>ids.has(w.id)&&w.hp>0);
}

export function resolveV39JoinedWallDamageScales(structures,area){
  const scales=new Map(structures.map(w=>[w.id,Math.max(area.structureScales?.get(w.id)||0,
    ...(w.edge?[w.edge.from,w.edge.to]:w.tiles||[]).map(p=>area.get(key(p))||0))]));
  for(const pair of collectV39JoinedWallPairs(structures)){
    const scale=Math.max(...pair.map(w=>scales.get(w.id)||0));
    pair.forEach(w=>scales.set(w.id,scale));
  }
  return scales;
}

export function pruneV39DefenseStructures(structures,turn){
  const current=structures.filter(w=>!w.expiresAtTurn||w.expiresAtTurn>turn);
  const retained=new Set(collectV39JoinedWallPairs(current).filter(pair=>pair.some(w=>w.hp>0)).flat().map(w=>w.id));
  return current.filter(w=>w.hp>0||retained.has(w.id));
}
