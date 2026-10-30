import { getGameDataRows } from "./game-data-registry.js";
import { V39_SITE_DISCOVERY_BALANCE } from "./v39-gameplay-balance.js";
import { getHexDistance, getHexOffsetNeighbors } from "./hex-grid.js";
import { isDetectedByScout, resolveDetectionScoutValue, resolveV39UnitVisionRange } from "./v39-detection-rules.js";
import { hasV39CaveLineOfSight, isV39UnitInWorld } from "./v39-cave-spatial-rules.js";
import { isV39SurfaceCaveEntrance } from "./v39-cave-entrance-rules.js";
import { createV39DiscoveryCheck } from "./v39-research-discovery.js";

const definitions = new Map(getGameDataRows("地形").map(row => [row.地形,row]));
const specialties = new Map(getGameDataRows("特産品").map(row => [row.名前,row]));
const sourceDefinition = definition => definition?.source
  || definitions.get(definition?.featureName)
  || specialties.get(definition?.name) || definition;
export function isV39ProximitySite(definition) {
  const row = sourceDefinition(definition);
  return ["洞窟","薬草","薬草の群生地"].includes(row?.地形 || row?.名前 || definition?.name)
    || row?.発見隠密 != null || (!definition?.地形 && definition?.隠密 != null);
}
export function resolveV39SiteStealth(state, key, definition) {
  const row = sourceDefinition(definition);
  const name = row?.地形 || row?.名前 || definition?.name;
  // 地形.jsonの「隠密」は、その地形上のユニット補正。地点の発見難易度と混同しない。
  let value = Math.max(0, Number((!definition?.地形 ? definition?.隠密 : undefined) ?? row?.発見隠密
    ?? V39_SITE_DISCOVERY_BALANCE.defaultStealthByName[name]) || 0);
  const turn = Number(state?.timeline?.turnNumber) || 1;
  for (const effect of state?.worldEnvironment?.siteConcealmentEffects || []) {
    if (!effect.tileKeys?.includes(key) || turn < effect.startsAtTurn
      || (effect.expiresAtTurn != null && turn > effect.expiresAtTurn)) continue;
    value += Math.max(0, Number(effect.stealthBonus) || 0);
  }
  return value;
}

export function revealV39NearbySites(state, map) {
  if (!map) return {changed:false,state,reports:[]};
  const worldId = state.activeWorldId || "surface", reports = [];
  const turn = Number(state.timeline?.turnNumber) || 1;
  const players = (state.players || []).map(player => {
    const faction = player.factionState || {}, exploration = faction.exploration || {};
    const features = {...exploration.discoveredFeaturesByTile}, food = {...exploration.discoveredSpecialtiesByTile}, caves = {...exploration.discoveredCaveEntrancesByTile};
    const research = createV39DiscoveryCheck(faction), ownReports = [];
    for (const unit of faction.units || []) {
      if (Number(unit.hp ?? unit.HP ?? 0) <= 0 || unit.state === "死亡" || !isV39UnitInWorld(unit,worldId)) continue;
      const range = resolveV39UnitVisionRange(unit,map), scout = resolveDetectionScoutValue(unit,map);
      // 視界の周辺だけを走査する。選択/チャット更新ごとにマップ全体を走査しない。
      const queue = [{x:unit.x,y:unit.y}], visited = new Set();
      for (let index=0; index<queue.length; index++) {
        const tile=queue[index], key=`${tile.x},${tile.y}`, distance=getHexDistance(unit,tile);
        if (visited.has(key) || distance>range || tile.x<0 || tile.y<0 || tile.x>=map.w || tile.y>=map.h) continue;
        visited.add(key);
        if (distance<range) queue.push(...getHexOffsetNeighbors(tile.x,tile.y));
        if (!hasV39CaveLineOfSight(map,unit,tile,{showWall:true})) continue;
        const detect = definition => isDetectedByScout({scout,stealth:resolveV39SiteStealth(state,key,definition),distance,inRange:true,mapData:map,from:unit,to:tile,visionRange:range,gameSettings:state.gameSettings});
        const record={discoveredTurn:turn,discoveredByUnitId:unit.id,discoveredByProximity:true};
        const names=[];
        const site=state.explorationSitesByTile?.[key], row=site && definitions.get(site.featureName || site.name || String(site.featureId || "").replace(/^地形:/,""));
        if (site && row && !features[key] && isV39ProximitySite({source:row,...site}) && research.feature(row) && detect({source:row,...site})) {
          features[key]={...site,...record}; names.push(row.地形);
        }
        const specialty=state.specialtiesByTile?.[key], foodRow=specialty && specialties.get(specialty.name);
        if (specialty && !food[key] && isV39ProximitySite({source:foodRow,...specialty}) && research.specialty(specialty) && detect({source:foodRow,...specialty})) {
          food[key]={...specialty,...record}; names.push(specialty.name);
        }
        if (!caves[key] && isV39SurfaceCaveEntrance(map,tile.x,tile.y) && detect(definitions.get("洞窟"))) {
          caves[key]={...tile,...record}; names.push("洞窟入口");
        }
        if (names.length) ownReports.push({type:"proximity-discovery",playerId:player.id,worldId,key,turn,message:`探知で発見: (${key}) / ${names.join(" / ")}`});
      }
    }
    if (!ownReports.length) return player;
    reports.push(...ownReports);
    return {...player,factionState:{...faction,exploration:{...exploration,researchDiscoveryVersion:1,discoveredFeaturesByTile:features,discoveredSpecialtiesByTile:food,discoveredCaveEntrancesByTile:caves,history:[...(exploration.history || []),...ownReports].slice(-200)},activityLog:[...(faction.activityLog || []),...ownReports].slice(-200)}};
  });
  return {changed:reports.length>0,reports,state:reports.length?{...state,players}:state};
}
