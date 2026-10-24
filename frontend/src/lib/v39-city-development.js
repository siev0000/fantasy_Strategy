import {getGameDataRows} from './game-data-registry.js';
import {resolveV39CitySpecializationModifiers} from './v39-city-specialization-rules.js';
import {territorySettlementId} from './settlement-state.js';
import {getHexDistance} from './hex-grid.js';

const n=value=>Number.isFinite(Number(value))?Number(value):0;
const hash=value=>{let h=2166136261;for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0)/4294967296;};
const roadCache=new WeakMap();

export function resolveV39CityEvents(settlement,turn) {
  const candidates=new Map();
  for(const event of resolveV39CitySpecializationModifiers(settlement).events) {
    if(hash(`${settlement.settlementId||settlement.id}:${turn}:${event.id}`)<event.chance)
      candidates.set(event.id,getGameDataRows('イベント会話').find(row=>row.ID===event.id));
  }
  return [...candidates.values()].filter(Boolean);
}

export function advanceV39CityDevelopment(state,player,settlement,map,turn) {
  if(!settlement?.placed||settlement.lastCityDevelopmentTurn>=turn||(settlement.worldId||'surface')!==(state.activeWorldId||'surface'))return settlement;
  const effects=resolveV39CitySpecializationModifiers(settlement),id=settlement.settlementId||settlement.id;
  const roads={...(settlement.roadDevelopmentByTile||{})};
  const budget=Math.max(0,Math.floor(effects.roadDevelopment));
  const roadLevel=key=>{const [x,y]=key.split(',').map(Number);return Math.max(n(roads[key]),Number(String(map.specialMap?.[y]?.[x]||'').match(/^道路([123])$/)?.[1])||0);};
  const tiles=budget>0?Object.entries(state.territoryOwnerByTile||{}).filter(([key,owner])=>{
    if(owner!==player.id||territorySettlementId(state.territoryStateByTile?.[key])!==id||state.territoryStateByTile?.[key]?.raided)return false;
    const [x,y]=key.split(',').map(Number),terrain=map.grid?.[y]?.[x],special=map.specialMap?.[y]?.[x];
    return terrain&&!['海','湖','火山','溶岩','壁','岩壁'].includes(terrain)&&!map.lavaMap?.[y]?.[x]
      &&(!special||/^道路[123]$/.test(special))&&roadLevel(key)<3;
  }).map(([key])=>({key,distance:getHexDistance(settlement,Object.fromEntries(key.split(',').map((value,index)=>[index?'y':'x',Number(value)])))}))
    .sort((a,b)=>roadLevel(a.key)-roadLevel(b.key)||a.distance-b.distance||a.key.localeCompare(b.key)):[];
  const changed=[];
  for(const tile of tiles.slice(0,budget)){roads[tile.key]=Math.min(3,roadLevel(tile.key)+1);changed.push(tile.key);}
  const environmentStability=Math.max(0,Math.min(100,effects.environmentStability));
  return {...settlement,roadDevelopmentByTile:roads,lastRoadDevelopmentKeys:changed,
    environmentStability,environmentStabilityTarget:environmentStability,lastCityDevelopmentTurn:turn,
    cityEventCandidates:resolveV39CityEvents(settlement,turn).map(row=>row.ID)};
}

export function resolveV39CityRoadAtTile(state,key,worldId) {
  if(!state)return 0;
  const spatial=worldId===(state.activeWorldId||'surface')?state:state.explorationWorlds?.[worldId]?.spatial;
  let cache=roadCache.get(state);
  if(!cache||cache.players!==state.players||cache.owner!==spatial?.territoryOwnerByTile||cache.territory!==spatial?.territoryStateByTile||cache.world!==worldId){
    const roads={};
    for(const player of state.players||[])for(const base of player.factionState?.settlements||[]){
      if(!base.placed||(base.worldId||'surface')!==worldId)continue;
      for(const [tile,value] of Object.entries(base.roadDevelopmentByTile||{}))
        if(spatial?.territoryOwnerByTile?.[tile]===player.id&&territorySettlementId(spatial?.territoryStateByTile?.[tile])===(base.settlementId||base.id))roads[tile]=Math.min(3,Math.max(0,Math.floor(n(value))));
    }
    cache={players:state.players,owner:spatial?.territoryOwnerByTile,territory:spatial?.territoryStateByTile,world:worldId,roads};roadCache.set(state,cache);
  }
  return cache.roads[key]||0;
}
