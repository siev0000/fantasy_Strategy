import {getGameDataRows} from './game-data-registry.js';
import {getHexNeighborCoords,getHexDistance} from './hex-grid.js';

const definitions=getGameDataRows('地形').filter(row=>row.危険地帯設定?.disasterId).map(row=>({...row.危険地帯設定,name:row.地形}));
const rules=new Map(getGameDataRows('災害').filter(row=>row.常設危険地帯===true&&row.有効!==false).map(row=>[row.ID,row]));
export const getV39HazardDefinitions=()=>definitions;
export const getV39HazardRule=id=>rules.get(id);
const indexes=new WeakMap();
const terms=(map,x,y)=>[map.grid?.[y]?.[x],map.specialMap?.[y]?.[x],map.reliefMap?.[y]?.[x]].filter(Boolean);
const matches=(names,values)=>names?.some(name=>values.some(value=>String(value).includes(name)));
const walkable=(map,x,y)=>!!map.grid?.[y]?.[x]&&!['海','湖','溶岩','火山','壁','岩壁'].includes(map.grid[y][x]);

export function generateV39HazardZones(map,random=Math.random) {
  if(!map?.grid||map.shapeOnly||Array.isArray(map.hazardZones))return map;
  map.hazardZones=[];map.hazardGenerationVersion=1;
  const occupied=new Set(),entrances=map.entrances||[];
  for(const definition of getV39HazardDefinitions()){
    if(!getV39HazardRule(definition.disasterId))continue;
    const candidates=[];
    for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){
      if(!walkable(map,x,y)||occupied.has(`${x},${y}`))continue;
      if(map.isUnderground&&!definition.underground)continue;
      if(map.isUnderground&&entrances.some(e=>getHexDistance(e,{x,y})<(definition.deep?7:4)))continue;
      const neighbors=getHexNeighborCoords(map.w,map.h,x,y,false);
      const eligible=map.isUnderground?definition.underground:
        matches(definition.terrains,terms(map,x,y))||matches(definition.near,neighbors.flatMap(p=>terms(map,p.x,p.y)))
        ||(definition.minimumHeight&&Number(map.heightLevelMap?.[y]?.[x])>=definition.minimumHeight);
      if(!eligible)continue;
      if(definition.interiorForest&&matches(['森'],terms(map,x,y))&&neighbors.filter(p=>matches(['森'],terms(map,p.x,p.y))).length<4)continue;
      if(map.specialMap?.[y]?.[x]&&/太陽|黄昏|星の火口|宇宙/.test(map.specialMap[y][x]))continue;
      candidates.push({x,y,key:`${x},${y}`});
    }
    const regions=new Map();for(const tile of candidates){const key=`${Math.floor(tile.x/(definition.regionSize||12))},${Math.floor(tile.y/(definition.regionSize||12))}`;
      if(!regions.has(key))regions.set(key,[]);regions.get(key).push(tile);}
    let count=0;
    const shuffled=[...regions.values()];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
    for(const region of shuffled){
      if(random()>Number(definition.chance??0.18)&&count>0)continue;
      const available=region.filter(p=>!occupied.has(p.key));if(!available.length)continue;
      const center=available[Math.floor(random()*available.length)],allowed=new Set(candidates.map(p=>p.key));
      const tiles=[center.key];occupied.add(center.key);
      const queue=[{...center,distance:0}];
      for(let i=0;i<queue.length;i++){
        const point=queue[i];if(point.distance>=Math.max(0,Number(definition.radius)||0))continue;
        for(const tile of getHexNeighborCoords(map.w,map.h,point.x,point.y,false))if(allowed.has(tile.key)&&!occupied.has(tile.key)&&random()<0.7){
          tiles.push(tile.key);occupied.add(tile.key);queue.push({...tile,distance:point.distance+1});
        }
      }
      map.hazardZones.push({id:`hazard:${definition.name}:${center.key}`,disasterId:definition.disasterId,name:definition.name,
        x:center.x,y:center.y,tileKeys:tiles,suppressedUntilByTile:{}});count++;
    }
  }
  return map;
}

export function getV39ActiveHazardsAt(map,x,y,turn=1){
  if(!map?.hazardZones?.length)return [];
  const key=`${x},${y}`;
  let cached=indexes.get(map);
  if(cached?.zones!==map.hazardZones){
    const byTile=new Map();for(const zone of map.hazardZones)for(const tile of zone.tileKeys){if(!byTile.has(tile))byTile.set(tile,[]);byTile.get(tile).push(zone);}
    cached={zones:map.hazardZones,byTile};indexes.set(map,cached);
  }
  return (cached.byTile.get(key)||[]).filter(zone=>Number(zone.suppressedUntilByTile?.[key]||0)<=turn)
    .map(zone=>({zone,rule:getV39HazardRule(zone.disasterId)})).filter(row=>row.rule);
}
export const isV39HazardFlightAvoided=(unit,rule)=>rule?.危険地帯効果?.contact===true&&Number(unit?.status?.飛行??unit?.飛行??unit?.skillLevels?.飛行??0)>0;
export function v39HazardRecoveryFromState(state,unit){
  const world=unit.worldId||'surface',environment=!state.activeWorldId||world===state.activeWorldId?state.worldEnvironment:state.explorationWorlds?.[world]?.spatial?.worldEnvironment;
  return Math.min(1,...(environment?.activeDisasters||[]).filter(event=>event.persistentHazard&&event.tileKeys?.includes(`${unit.x},${unit.y}`))
    .map(event=>hazardRecoveryFactor(getV39HazardRule(event.disasterId),unit)));
}
function hazardRecoveryFactor(rule,unit){
  const base=Number(rule?.危険地帯効果?.recoveryMultiplier??1),resist=Math.max(0,Math.min(100,Number(unit?.status?.毒耐性??unit?.resistances?.毒耐性)||0));
  return 1-(1-base)*(1-resist/100);
}
export function v39HazardRecoveryMultiplier(map,unit,turn=1){
  return Math.min(1,...getV39ActiveHazardsAt(map,unit.x,unit.y,turn).map(({rule})=>hazardRecoveryFactor(rule,unit)));
}
export function v39HazardRiskAt(map,unit,x,y){
  return Math.max(0,...getV39ActiveHazardsAt(map,x,y,map?.hazardTurn||1).map(({rule})=>{
    if(isV39HazardFlightAvoided(unit,rule))return 0;
    const element=rule.ダメージ属性||'毒',resist=Number(unit?.status?.[`${element}耐性`]??unit?.resistances?.[`${element}耐性`])||0;
    return Math.max(Number(rule.ダメージ威力)||0,Number(rule.危険地帯効果?.poisonPower)||0)*(1-Math.min(100,Math.max(0,resist))/100);
  }));
}
export function v39HazardMovementMultiplier(map,unit,x,y,turn=map?.hazardTurn||1){
  return Math.max(1,...getV39ActiveHazardsAt(map,x,y,turn).map(({rule})=>{
    const resist=Number(unit?.status?.氷耐性??unit?.resistances?.氷耐性)||0;
    return 1+(Number(rule.危険地帯効果?.movementMultiplier??1)-1)*(1-Math.min(1,Math.max(0,resist)/100));
  }));
}
export function projectV39HazardEvents(map,turn){
  return (map.hazardZones||[]).flatMap(zone=>{
    const rule=getV39HazardRule(zone.disasterId);if(!rule)return [];
    const tileKeys=zone.tileKeys.filter(key=>Number(zone.suppressedUntilByTile?.[key]||0)<=turn);
    if(!tileKeys.length)return [];
    return [{...zone,tileKeys,persistentHazard:true,anchorKey:`${zone.x},${zone.y}`,icon:rule.アイコン,
      startsAtTurn:1,expiresAtTurn:Number.MAX_SAFE_INTEGER,damagePower:0,unitDamageRate:0,
      movementDamagePower:Number(rule.移動時ダメージ威力)||0,damageElement:rule.ダメージ属性,
      yieldMultiplier:1,securityLoss:0}];
  });
}
