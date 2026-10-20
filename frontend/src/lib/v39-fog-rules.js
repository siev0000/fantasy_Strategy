import { V39_FOG_BALANCE } from "./v39-gameplay-balance.js";
import {getV39ActiveHazardsAt,getV39HazardRule} from './v39-hazard-zones.js';
import { v39HexRay } from "./v39-combat-ray.js";
import { resolveV39TerrainNameAt } from "./v39-terrain-location.js";
import { parseV39TurnCount } from "./v39-turn-timing.js";
import { hasV39SkillEffect } from "./v39-combat-ray.js";
import { getHexNeighborCoords } from "./hex-grid.js";
import {ensureV39CaveAreas} from "./v39-cave-areas.js";
import {advanceV39Purification,changeV39Purification} from "./v39-purification-rules.js";

export function placeV39DeathFog(mapData,sourceKey,turn) {
  const [x,y]=sourceKey.split(',').map(Number);
  const areaId=mapData.isUnderground?ensureV39CaveAreas(mapData)[sourceKey]:null;
  const keys=mapData.isUnderground?(mapData.caveAreas?.[areaId] || []):[sourceKey,...getHexNeighborCoords(mapData.w,mapData.h,x,y,mapData.worldWrapEnabled===true).map(tile=>tile.key)];
  mapData.fogMap ||= [];
  let placed=0;
  for(const key of keys) {
    const [tx,ty]=key.split(',').map(Number);
    if(!mapData.grid[ty]?.[tx]||['岩壁','壁'].includes(mapData.grid[ty][tx]))continue;
    if(mapData.fogMap[ty]?.[tx]?.kind==='death')continue;
    mapData.fogMap[ty] ||= [];
    mapData.fogMap[ty][tx]={kind:'death',source:'unholy',sourceKey,areaId,createdAtTurn:turn,expiresAtTurn:turn+V39_FOG_BALANCE.deathFogDurationTurns};
    changeV39Purification(mapData,key,key===sourceKey?-2:-1);placed++;
  }
  return placed;
}

export function clearV39FogByWind(mapData,area,skill) {
  const systems=Array.isArray(skill?.系統)?skill.系統:String(skill?.系統||"").split(/[\s,、/|]+/);
  if(!systems.includes("風") || !(Number(skill?.炸裂)>=V39_FOG_BALANCE.windClearSplash)) return 0;
  let count=0;
  const turn=mapData.hazardTurn||1;
  for(const [key,scale] of area) {
    if(!(scale>0)) continue;
    const [x,y]=key.split(",").map(Number);
    let removed=false;
    for(const zone of mapData.hazardZones||[]){
      const effect=getV39HazardRule(zone.disasterId)?.危険地帯効果;
      if(zone.tileKeys.includes(key)&&effect?.windSuppressTurns>0){
        zone.suppressedUntilByTile||={};zone.suppressedUntilByTile[key]=turn+effect.windSuppressTurns;removed=true;
      }
    }
    if(mapData?.fogMap?.[y]?.[x]) {mapData.fogMap[y][x]=null;removed=true;}
    // 地形変換の死の霧は特殊レイヤーだけ外し、基本地形を壊さない。
    if(V39_FOG_BALANCE.terrainNames.includes(mapData?.specialMap?.[y]?.[x])) {
      mapData.specialMap[y][x]=null;removed=true;
    }
    if(mapData?.deathFogSourceByTile) delete mapData.deathFogSourceByTile[key];
    if(removed) count++;
  }
  return count;
}

export function advanceV39NaturalFog(mapData,turn,random=Math.random) {
  const changed=advanceV39Fog(mapData,turn);
  if(!mapData?.grid || mapData.isUnderground || turn<1 || turn%V39_FOG_BALANCE.naturalIntervalTurns!==0) return changed;
  mapData.fogWeather ||= {};
  if(mapData.fogWeather.lastCheckedTurn>=turn) return changed;
  mapData.fogWeather.lastCheckedTurn=turn;
  const active=new Set((mapData.fogMap||[]).flat().filter(cell=>cell?.source==="natural").map(cell=>cell.regionId));
  const regions=new Map(),size=V39_FOG_BALANCE.naturalRegionSize;
  for(let y=0;y<mapData.h;y++) for(let x=0;x<mapData.w;x++) {
    if(!V39_FOG_BALANCE.naturalTerrainNames.includes(resolveV39TerrainNameAt(mapData,x,y)) && !mapData.riverMap?.[y]?.[x] && !mapData.lakeMap?.[y]?.[x]) continue;
    const key=`${Math.floor(x/size)},${Math.floor(y/size)}`;
    if(!regions.has(key)) regions.set(key,[]);
    regions.get(key).push({x,y});
  }
  let placed=false;
  for(const [region,centers] of regions) {
    if(active.size>=V39_FOG_BALANCE.naturalMaxRegions) break;
    if(active.has(region)||random()>=V39_FOG_BALANCE.naturalChance) continue;
    const center=centers[Math.min(centers.length-1,Math.floor(random()*centers.length))];
    const radius=V39_FOG_BALANCE.naturalMinRadius+Math.floor(random()*(V39_FOG_BALANCE.naturalMaxRadius-V39_FOG_BALANCE.naturalMinRadius+1));
    const seen=new Set([`${center.x},${center.y}`]),queue=[{...center,distance:0}];
    let regionPlaced=false;
    for(let i=0;i<queue.length;i++) {
      const tile=queue[i],{x,y}=tile;
      if(!isV39FogTile(mapData,x,y)&&(tile.distance<radius||random()<V39_FOG_BALANCE.naturalEdgeChance)) {
        mapData.fogMap ||= [];mapData.fogMap[y] ||= [];
        mapData.fogMap[y][x]={source:"natural",regionId:region,expiresAtTurn:turn+V39_FOG_BALANCE.naturalDurationTurns};
        placed=true;regionPlaced=true;
      }
      if(tile.distance>=radius) continue;
      for(const next of getHexNeighborCoords(mapData.w,mapData.h,x,y,mapData.worldWrapEnabled===true)) {
        if(seen.has(next.key)||!mapData.grid[next.y]?.[next.x]) continue;
        seen.add(next.key);queue.push({...next,distance:tile.distance+1});
      }
    }
    if(regionPlaced) active.add(region);
  }
  return changed||placed;
}

export function isV39DeathFogTile(mapData,x,y) {
  return mapData?.fogMap?.[y]?.[x]?.kind==="death" || resolveV39TerrainNameAt(mapData,x,y)==="死の霧";
}
export function isV39DeathFogSource(mapData,x,y) {
  const key=`${x},${y}`;
  return isV39DeathFogTile(mapData,x,y) && (mapData.fogMap?.[y]?.[x]?.sourceKey===key
    || (resolveV39TerrainNameAt(mapData,x,y)==="死の霧" && mapData.deathFogSourceByTile?.[key]===true));
}

export function advanceV39CorpseFog(mapData,state,turn,random=Math.random) {
  const events=advanceV39Purification(mapData,state,turn,random);
  mapData.unholyUndeadOrigins=events.filter(event=>event.type==='undead');
  let changed=false;
  for(const event of events)if(event.type==='fog')changed=placeV39DeathFog(mapData,event.key,turn)>0||changed;
  return changed;
}
export function isV39FogTile(mapData,x,y) {
  return !!mapData?.fogMap?.[y]?.[x] || V39_FOG_BALANCE.terrainNames.includes(resolveV39TerrainNameAt(mapData,x,y))
    ||getV39ActiveHazardsAt(mapData,x,y,mapData?.hazardTurn||1).some(({rule})=>rule.危険地帯効果?.fog);
}
export function placeV39SkillFog(mapData,area,skill,turn) {
  clearV39FogByWind(mapData,area,skill);
  if(!hasV39SkillEffect(skill,"霧")) return false;
  const duration=Math.max(1,parseV39TurnCount(skill.効果時間,V39_FOG_BALANCE.defaultDurationTurns));
  mapData.fogMap ||= [];
  for(const key of area.keys()) {
    const [x,y]=key.split(",").map(Number);
    mapData.fogMap[y] ||= [];
    mapData.fogMap[y][x]={expiresAtTurn:Math.max(mapData.fogMap[y][x]?.expiresAtTurn||0,turn+duration)};
  }
  return true;
}
export function advanceV39Fog(mapData,turn) {
  let changed=false;
  for(const row of mapData?.fogMap||[]) for(let x=0;x<(row?.length||0);x++) {
    if(row[x]?.expiresAtTurn && row[x].expiresAtTurn<=turn) {row[x]=null;changed=true;}
  }
  return changed;
}

export function resolveV39FogPenalty(mapData, from, to) {
  if (!mapData?.grid || !from || !to || [from.x,from.y,to.x,to.y].some(value=>value==null||!Number.isFinite(Number(value)))) return {tiles:0,scout:0,vision:0};
  const tiles=[from,...v39HexRay(mapData,from,to)];
  const fogKeys=new Set(tiles.filter(tile=>isV39FogTile(mapData,tile.x,tile.y))
    .map(tile=>`${tile.x},${tile.y}`));
  return {tiles:fogKeys.size,scout:fogKeys.size*V39_FOG_BALANCE.scoutPenaltyPerTile,
    vision:fogKeys.size*V39_FOG_BALANCE.visionPenaltyPerTile};
}
export function isV39FogVisionAllowed(mapData,from,to,range,distance) {
  return distance<=Math.max(1,range-resolveV39FogPenalty(mapData,from,to).vision);
}
