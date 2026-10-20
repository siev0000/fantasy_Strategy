import config from '../../../config/v39-map-generation-features.json';
import {getHexNeighborCoords,getHexDistance} from './hex-grid.js';

export function generateV39WastelandRegions(map,profile,protectedKeys=new Set()){
  const rule=config.wasteland,{grid,w,h}=map,key=(x,y)=>`${x},${y}`,eligible=new Map();
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(protectedKeys.has(key(x,y))||!['平地','荒野'].includes(grid[y][x]))continue;
    const region=profile?.regions?.[`${Math.floor(x/profile.regionSize)},${Math.floor(y/profile.regionSize)}`];
    if(region&&region.temperature<=0)continue;
    if(grid[y][x]==='荒野')grid[y][x]='平地';
    eligible.set(key(x,y),{x,y,key:key(x,y),dryness:100-(region?.humidity??55)});
  }
  const target=Math.floor(eligible.size*rule.eligibleRatio),regions=[];
  let placed=0;
  const neighbors=point=>getHexNeighborCoords(w,h,point.x,point.y).filter(n=>eligible.has(n.key));
  const seeds=[...eligible.values()].map(point=>({...point,score:neighbors(point).length*10+point.dryness*.08+Math.random()*8}))
    .filter(point=>neighbors(point).length>=rule.minimumCoreNeighbors).sort((a,b)=>b.score-a.score);
  for(const seed of seeds){
    if(placed>=target)break;
    if(!eligible.has(seed.key))continue;
    if(regions.some(region=>getHexDistance(seed,region.seed)<rule.regionGap+Math.sqrt(region.size)))continue;
    const cells=new Map([[seed.key,seed]]),frontier=new Map();
    const add=point=>{cells.set(point.key,point);frontier.delete(point.key);for(const n of neighbors(point))if(!cells.has(n.key))frontier.set(n.key,eligible.get(n.key));};
    add(seed);
    for(const point of neighbors(seed))add(eligible.get(point.key));
    const size=Math.min(rule.maximumRegionSize,Math.max(rule.minimumRegionSize,target-placed));
    while(cells.size<size){
      const candidates=[...frontier.values()].map(point=>({...point,touch:neighbors(point).filter(n=>cells.has(n.key)).length}))
        .filter(point=>point.touch>=2).sort((a,b)=>(b.touch*10-getHexDistance(seed,b)*2)-(a.touch*10-getHexDistance(seed,a)*2));
      if(!candidates.length)break;add(candidates[0]);
    }
    if(cells.size<rule.minimumRegionSize)continue;
    for(const point of cells.values()){grid[point.y][point.x]='荒野';eligible.delete(point.key);}
    regions.push({seed:{x:seed.x,y:seed.y},size:cells.size});placed+=cells.size;
  }
  return {target,placed,minimumRegionSize:rule.minimumRegionSize,regions};
}
