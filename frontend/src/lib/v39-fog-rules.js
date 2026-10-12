import { V39_FOG_BALANCE } from "./v39-gameplay-balance.js";
import { v39HexRay } from "./v39-combat-ray.js";
import { resolveV39TerrainNameAt } from "./v39-terrain-location.js";
import { parseV39TurnCount } from "./v39-turn-timing.js";
import { hasV39SkillEffect } from "./v39-combat-ray.js";
import { getHexNeighborCoords } from "./hex-grid.js";

export function clearV39FogByWind(mapData,area,skill) {
  const systems=Array.isArray(skill?.系統)?skill.系統:String(skill?.系統||"").split(/[\s,、/|]+/);
  if(!systems.includes("風") || !(Number(skill?.炸裂)>=V39_FOG_BALANCE.windClearSplash)) return 0;
  let count=0;
  for(const [key,scale] of area) {
    if(!(scale>0)) continue;
    const [x,y]=key.split(",").map(Number);
    let removed=false;
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
  if(!mapData?.grid || turn<1 || turn%V39_FOG_BALANCE.deathFogIntervalTurns!==0) return false;
  const chancePerBody=mapData.isUnderground ? V39_FOG_BALANCE.caveDeathFogChancePerBody : V39_FOG_BALANCE.deathFogChancePerBody;
  const maxChance=mapData.isUnderground ? V39_FOG_BALANCE.caveDeathFogMaxChance : V39_FOG_BALANCE.deathFogMaxChance;
  mapData.fogWeather ||= {};
  if(mapData.fogWeather.lastCorpseCheckedTurn>=turn) return false;
  mapData.fogWeather.lastCorpseCheckedTurn=turn;
  const amounts=new Map(),add=(x,y,amount)=>{
    if(!Number.isInteger(x)||!Number.isInteger(y)||!mapData.grid[y]?.[x]||amount<=0) return;
    if(mapData.isUnderground && ["岩壁","壁"].includes(mapData.grid[y][x])) return;
    const key=`${x},${y}`;amounts.set(key,(amounts.get(key)||0)+amount);
  };
  for(const [key,loot] of Object.entries(state?.groundLootByTile||{})) {
    const [x,y]=key.split(",").map(Number);
    add(x,y,Math.max(0,Number(loot?.cargo?.resourcesByType?.死体??loot?.resourcesByType?.死体)||0));
  }
  const deadUnits=[...(state?.enemies||[]),...(state?.players||[]).flatMap(player=>player.factionState?.units||[]),
    ...(state?.neutralVillages||[]).flatMap(village=>village.defenseUnits||[])];
  for(const unit of deadUnits) {
    if((unit.worldId||"surface")!==(state?.activeWorldId||"surface")) continue;
    if(unit.state!=="死亡" && !(Number(unit.currentHp??unit.hp)<=0)) continue;
    if(unit.deadExpireTurn && unit.deadExpireTurn<=turn) continue;
    add(Number(unit.x),Number(unit.y),V39_FOG_BALANCE.corpseResourcePerBody);
  }
  if(mapData.isUnderground) {
    // 洞窟は階層全体の総数で1回だけ抽選。風で空いた部分も期限までは自動補充しない。
    if(mapData.fogWeather.caveDeathFogExpiresAtTurn>turn) return false;
    const bodies=Math.floor([...amounts.values()].reduce((sum,amount)=>sum+amount,0)/V39_FOG_BALANCE.corpseResourcePerBody);
    if(bodies<1 || random()>=Math.min(maxChance,bodies*chancePerBody)) return false;
    const sourceKey=[...amounts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];
    const expiresAtTurn=turn+V39_FOG_BALANCE.deathFogDurationTurns;
    mapData.fogWeather.caveDeathFogExpiresAtTurn=expiresAtTurn;
    mapData.fogMap ||= [];
    for(let y=0;y<mapData.h;y++) for(let x=0;x<mapData.w;x++) {
      if(!mapData.grid[y]?.[x] || ["岩壁","壁"].includes(mapData.grid[y][x])) continue;
      mapData.fogMap[y] ||= [];
      const previous=mapData.fogMap[y][x];
      mapData.fogMap[y][x]={kind:"death",source:"corpse-floor",
        sourceKey:previous?.kind==="death" && previous.sourceKey ? previous.sourceKey : sourceKey,
        expiresAtTurn:Math.max(previous?.kind==="death" ? previous.expiresAtTurn||0 : 0,expiresAtTurn)};
    }
    return true;
  }
  // 死体数順。同数の候補だけ乱数で順位を決め、重なる判定域は成功/失敗に関係なく一度だけ使う。
  const candidates=[...amounts].map(([key,amount])=>({key,amount,tie:random()}))
    .sort((a,b)=>b.amount-a.amount||a.tie-b.tie||a.key.localeCompare(b.key));
  const used=new Set();let changed=false;
  for(const candidate of candidates) {
    if(used.has(candidate.key)) continue;
    const [x,y]=candidate.key.split(",").map(Number);
    const area=[{x,y,key:candidate.key},...getHexNeighborCoords(mapData.w,mapData.h,x,y,mapData.worldWrapEnabled===true)];
    if(area.some(tile=>used.has(tile.key)||isV39DeathFogTile(mapData,tile.x,tile.y))) continue;
    for(const tile of area) used.add(tile.key);
    const bodies=Math.floor(area.reduce((sum,tile)=>sum+(amounts.get(tile.key)||0),0)/V39_FOG_BALANCE.corpseResourcePerBody);
    if(random()>=Math.min(maxChance,bodies*chancePerBody)) continue;
    for(const tile of area) {
      if(!mapData.grid[tile.y]?.[tile.x]) continue;
      mapData.fogMap ||= [];mapData.fogMap[tile.y] ||= [];
      mapData.fogMap[tile.y][tile.x]={kind:"death",source:"corpse",sourceKey:candidate.key,expiresAtTurn:turn+V39_FOG_BALANCE.deathFogDurationTurns};
    }
    changed=true;
  }
  return changed;
}

export function isV39FogTile(mapData,x,y) {
  return !!mapData?.fogMap?.[y]?.[x] || V39_FOG_BALANCE.terrainNames.includes(resolveV39TerrainNameAt(mapData,x,y));
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
