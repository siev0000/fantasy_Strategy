import config from '../../../config/v39-map-generation-features.json';
import {getHexNeighborCoords} from './hex-grid.js';

const key=(x,y)=>`${x},${y}`;
const vector=(a,b)=>({x:b.x+(b.y%2)*.5-a.x-(a.y%2)*.5,y:(b.y-a.y)*Math.sqrt(3)/2});
export function generateV39CanyonRegions(map,{random=Math.random,protectedKeys=new Set()}={}){
  const {grid,w,h,specialMap,heightLevelMap}=map,rule=config.canyons;
  const near=p=>getHexNeighborCoords(w,h,p.x,p.y);
  const riverNear=new Map(),queue=[];
  for(const raw of map.riverTouchSet||[]){const [x,y]=raw.split(',').map(Number);if(x>=0&&x<w&&y>=0&&y<h){riverNear.set(raw,0);queue.push({x,y,key:raw});}}
  for(let i=0;i<queue.length;i++){
    const point=queue[i],distance=riverNear.get(point.key);
    if(distance>=rule.riverDistance)continue;
    for(const n of near(point))if(!riverNear.has(n.key)){riverNear.set(n.key,distance+1);queue.push(n);}
  }
  const eligible=new Map(),seeds=[],land=new Map();
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const point={x,y,key:key(x,y)},terrain=grid[y][x],height=heightLevelMap?.[y]?.[x];
    if(!['海','湖','河川','溶岩'].includes(terrain)&&!map.lavaMap?.[y]?.[x])land.set(point.key,point);
    if(protectedKeys.has(point.key)||specialMap[y][x]||!rule.terrains.includes(terrain)
      ||!Number.isFinite(height)||height<rule.minimumHeight||!riverNear.has(point.key))continue;
    eligible.set(point.key,point);
    if(height>=rule.seedMinHeight&&near(point).some(n=>Number.isFinite(heightLevelMap?.[n.y]?.[n.x])&&height-heightLevelMap[n.y][n.x]>=rule.seedMinDrop)
      &&[point,...near(point)].some(n=>riverNear.get(n.key)===0))seeds.push(point);
  }
  // Preserve land connections that a non-flying unit can cross at height difference <= 1.
  const walkNear=p=>near(p).filter(n=>{
    if(!land.has(n.key))return false;
    const a=heightLevelMap?.[p.y]?.[p.x],b=heightLevelMap?.[n.y]?.[n.x];
    return !Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)<=1;
  });
  const componentByKey=new Map(),components=[];
  for(const point of land.values()){
    if(componentByKey.has(point.key))continue;
    const component=[point],id=components.length;componentByKey.set(point.key,id);
    for(let i=0;i<component.length;i++)for(const n of walkNear(component[i]))if(!componentByKey.has(n.key)){
      componentByKey.set(n.key,id);component.push(land.get(n.key));
    }
    components.push(component);
  }
  const blocked=new Set(),regions=[];
  const available=p=>eligible.has(p.key)&&!blocked.has(p.key)&&near(p).every(n=>!blocked.has(n.key));
  const hasBypass=points=>{
    const removed=new Set([...blocked,...points.map(p=>p.key)]),ids=new Set(points.map(p=>componentByKey.get(p.key)));
    for(const id of ids){
      const remaining=components[id].filter(p=>!removed.has(p.key));
      if(!remaining.length)return false;
      const visited=new Set([remaining[0].key]),walk=[remaining[0]];
      for(let i=0;i<walk.length;i++)for(const n of walkNear(walk[i]))if(componentByKey.get(n.key)===id&&!removed.has(n.key)&&!visited.has(n.key)){
        visited.add(n.key);walk.push(n);
      }
      if(visited.size!==remaining.length)return false;
    }
    return true;
  };
  for(let i=seeds.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[seeds[i],seeds[j]]=[seeds[j],seeds[i]];}
  const target=Math.max(1,Math.ceil(w*h/rule.areaPerRegion));
  let attempts=0;
  for(const seed of seeds){
    if(regions.length>=target||attempts++>=rule.maximumAttempts)break;
    if(!available(seed))continue;
    const roll=random(),kind=roll<rule.smallChance?'small':roll<rule.smallChance+rule.largeChance?'large':'normal';
    const range=rule[`${kind}Length`],length=range[0]+Math.floor(random()*(range[1]-range[0]+1));
    let best=[seed],budget=rule.searchBudget;
    const walk=(path,heading)=>{
      if(--budget<0||best.length>=length)return;
      if(path.length>best.length)best=[...path];
      if(path.length>=length)return;
      const last=path.at(-1),used=new Set(path.map(p=>p.key));
      const options=near(last).filter(n=>available(n)&&!used.has(n.key)).map(n=>{
        const step=vector(last,n),dot=heading?step.x*heading.x+step.y*heading.y:1;
        return {point:n,step,dot,score:random()+dot*.6-(riverNear.get(n.key)||0)*.1};
      }).filter(n=>n.dot>=.45).sort((a,b)=>b.score-a.score);
      for(const option of options){walk([...path,option.point],heading||option.step);if(best.length>=length)break;}
    };
    walk([seed],null);
    if(best.length<range[0]){
      if(kind==='large'&&best.length>=rule.normalLength[0])best=best.slice(0,rule.normalLength[1]);
      else continue;
    }
    let tiles=[...best];const used=new Set(tiles.map(p=>p.key)),heading=best.length>1?vector(best[0],best[1]):{x:1,y:0},side=random()<.5?-1:1;
    for(const point of best){
      if(random()>=rule.widthChance)continue;
      const n=near(point).find(n=>{
        const delta=vector(point,n);
        return available(n)&&!used.has(n.key)&&(heading.x*delta.y-heading.y*delta.x)*side>.4;
      });
      if(n){used.add(n.key);tiles.push(n);}
    }
    if(!hasBypass(tiles)){tiles=best;if(!hasBypass(tiles))continue;}
    for(const point of tiles){blocked.add(point.key);specialMap[point.y][point.x]='峡谷';}
    regions.push({kind:best.length>=rule.largeLength[0]?'large':kind==='small'?'small':'normal',length:best.length,
      path:best.map(p=>p.key),tileKeys:tiles.map(p=>p.key),size:tiles.length});
  }
  return {placed:blocked.size,regions,attempts};
}
