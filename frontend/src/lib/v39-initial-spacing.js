import balance from '../../../config/v39-initial-placement.json';
import {getHexDistance,getHexNeighborCoords} from './hex-grid.js';
import {getFactionSettlements} from './settlement-state.js';
import {normalizeV39RaceName} from './v39-race-definitions.js';

export const V39_INITIAL_SPACING=balance;
const key=tile=>`${tile.x},${tile.y}`;
const raceNames=new Map();
function canonicalRace(value){
  const name=String(value||'');
  if(!raceNames.has(name))raceNames.set(name,normalizeV39RaceName(name));
  return raceNames.get(name);
}
export const isV39InitialLand=(map,x,y)=>!!map.grid?.[y]?.[x]&&!['海','湖','火山'].includes(map.grid[y][x])&&!map.lavaMap?.[y]?.[x];
export function v39InitialDistance(map,a,b){
  let distance=getHexDistance(a,b);
  if(map.worldWrapEnabled===true)for(const dx of [-map.w,0,map.w])for(const dy of [-map.h,0,map.h]){
    if(dx||dy)distance=Math.min(distance,getHexDistance(a,{x:b.x+dx,y:b.y+dy}));
  }
  return distance;
}
export function v39InitialFootprint(map,tile){
  if(!isV39InitialLand(map,tile.x,tile.y))return [];
  const cells=[tile,...getHexNeighborCoords(map.w,map.h,tile.x,tile.y,map.worldWrapEnabled===true)];
  return cells.length===7&&cells.every(p=>isV39InitialLand(map,p.x,p.y))?cells.map(p=>({...p,key:key(p)})):[];
}
export function collectV39InitialSites(state,map){
  const world=state.activeWorldId||'surface';
  const rows=[...(state.players||[]).flatMap(player=>getFactionSettlements(player.factionState).filter(s=>s.placed).map(s=>({...s,race:player.race}))),...(state.neutralVillages||[])];
  return rows.filter(s=>Number.isInteger(s.x)&&Number.isInteger(s.y)&&(s.worldId||'surface')===world).map(site=>{
    const keys=site.territoryTileKeys?.length?site.territoryTileKeys:Object.keys(site.territoryResidentialCenterMap||{});
    const tiles=(keys.length?keys:[key(site),...getHexNeighborCoords(map.w,map.h,site.x,site.y,map.worldWrapEnabled===true).map(key)]).map(value=>{const [x,y]=value.split(',').map(Number);return {x,y};});
    return {...site,race:canonicalRace(site.race),tiles,radius:Math.max(0,...tiles.map(p=>v39InitialDistance(map,site,p)))};
  });
}
export function createV39InitialSpacing(map,state,{villageCount=0}={}){
  let landArea=0;
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)if(isV39InitialLand(map,x,y))landArea++;
  const baseCount=(state.players||[]).reduce((sum,p)=>sum+Math.max(1,p.factionState?.initialSettlementCount||p.factionState?.initialSettlementPlans?.length||getFactionSettlements(p.factionState).filter(s=>s.placed).length),0);
  const count=Math.max(1,baseCount+villageCount);
  const gap=Math.max(balance.minimumBorderDistance,Math.min(balance.maximumBorderDistance,Math.floor(Math.sqrt(landArea/count)*balance.spacingFactor)-2));
  return {map,sites:collectV39InitialSites(state,map),landArea,count,gap,targetGap:gap,minimumGap:balance.minimumBorderDistance,
    unsafe:new Set((map.hazardZones||[]).flatMap(zone=>zone.tileKeys||[]))};
}
export function inspectV39InitialSpacing(tile,race,context){
  const cells=v39InitialFootprint(context.map,tile);
  if(!cells.length||cells.some(p=>context.unsafe.has(key(p))))return {available:false,clearance:-Infinity,sameRaceClearance:-Infinity};
  const radius=context.map.worldWrapEnabled===true&&context.map.h%2?Math.max(...cells.map(p=>v39InitialDistance(context.map,tile,p))):1;
  let clearance=Infinity,sameRaceClearance=Infinity;
  for(const site of context.sites){
    const lower=v39InitialDistance(context.map,tile,site)-radius-site.radius;
    // Bounding radii avoid scanning territory edges when the site is already far away.
    const gap=radius===1&&site.radius===1&&site.tiles.length===7?Math.max(0,lower):lower>=context.gap+balance.sameRaceExtraDistance?lower:Math.min(...cells.flatMap(p=>site.tiles.map(q=>v39InitialDistance(context.map,p,q))));
    clearance=Math.min(clearance,gap);
    if(canonicalRace(race)===site.race)sameRaceClearance=Math.min(sameRaceClearance,gap);
  }
  return {available:clearance>=context.gap,clearance,sameRaceClearance};
}
export function selectV39InitialRace(candidates,assigned,{point,map,random=Math.random,preferred=()=>false}={}){
  if(!candidates.length)return null;
  const rows=candidates.map(row=>{
    const race=canonicalRace(row.race||row.key),matches=assigned.filter(p=>canonicalRace(p.race||p.key)===race);
    const located=matches.filter(p=>Number.isInteger(p.x)&&Number.isInteger(p.y));
    return {row,count:matches.length,distance:point&&map&&located.length?Math.min(...located.map(p=>v39InitialDistance(map,point,p))):Infinity,preferred:preferred(row)?1:0};
  });
  const count=Math.min(...rows.map(row=>row.count));
  let pool=rows.filter(row=>row.count===count);
  const distance=Math.max(...pool.map(row=>row.distance));pool=pool.filter(row=>row.distance===distance);
  if(pool.some(row=>row.preferred))pool=pool.filter(row=>row.preferred);
  return pool[Math.min(pool.length-1,Math.floor(random()*pool.length))].row;
}

function stableHash(value){let n=0;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),2654435761)>>>0;return n;}
export function planV39InitialVillageSites(state,map,races,villageCount,occupied=new Set()){
  const context=createV39InitialSpacing(map,state,{villageCount});
  const assigned=[...(state.players||[]),...(state.neutralVillages||[])],sites=[];
  const tiles=[];
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){
    const tile={x,y,key:`${x},${y}`,terrain:map.specialMap?.[y]?.[x]||map.grid?.[y]?.[x]};
    const footprint=v39InitialFootprint(map,tile);
    if(footprint.length&&!footprint.some(p=>occupied.has(p.key)||context.unsafe.has(p.key)))tiles.push(tile);
  }
  let gap=context.targetGap;
  while(sites.length<villageCount&&races.length){
    let best=null;
    for(const tile of tiles){
      const race=selectV39InitialRace(races,assigned,{point:tile,map,random:()=>stableHash(`${tile.key}:race`)/4294967296,
        preferred:row=>String(row.preferredTerrain||'').split(/[,、/／]/).some(t=>t&&String(tile.terrain).includes(t))});
      const spacing=inspectV39InitialSpacing(tile,race.race,{...context,gap});
      if(!spacing.available)continue;
      const score=[Math.max(0,gap+balance.sameRaceExtraDistance-spacing.sameRaceClearance),-spacing.clearance,stableHash(`${tile.key}:site`)];
      const different=best?score.findIndex((value,i)=>value!==best.score[i]):-1;
      if(!best||different>=0&&score[different]<best.score[different])best={tile,race,score};
    }
    if(!best){if(gap>context.minimumGap){gap--;continue;}break;}
    sites.push(best);assigned.push({...best.tile,race:best.race.race});
    const footprint=v39InitialFootprint(map,best.tile);
    context.sites.push({...best.tile,race:canonicalRace(best.race.race),radius:Math.max(...footprint.map(p=>v39InitialDistance(map,best.tile,p))),tiles:footprint});
  }
  return {sites,requested:villageCount,placed:sites.length,targetBorderDistance:context.targetGap,usedBorderDistance:gap,omitted:villageCount-sites.length};
}
