import balance from '../../../config/v39-npc-defense.json';
import {getFactionSettlements} from './settlement-state.js';
import {getHexDistance} from './hex-grid.js';

const alive=unit=>Number(unit?.hp??unit?.currentHp)>0&&unit.state!=='死亡';
export const isV39GarrisonAtHome=(unit,base)=>!!unit&&(unit.worldId||'surface')===(base.worldId||'surface')&&getHexDistance(unit,base)<=balance.garrisonRadius;

// Reserve real units, not merely a spare-unit count that explorers can still use.
export function selectV39BaseGarrisons(units,bases,previous=[]){
  const used=new Set(),result=[];
  const candidates=(units||[]).filter(unit=>alive(unit)&&(unit.worldId||'surface')==='surface'
    &&Number.isInteger(unit.x)&&Number.isInteger(unit.y)&&!unit.summon&&!unit.isSummoned
    &&!unit.tradeAssignment&&!unit.transportAssignment&&!unit.pendingWorldExit);
  for(const base of bases||[]){
    if(base.placed===false||base.abandoned||!Number.isInteger(base.x)||!Number.isInteger(base.y)||(base.worldId||'surface')!=='surface')continue;
    const settlementId=base.settlementId||base.id;
    for(let index=0;index<balance.minimumGarrisonUnits;index++){
      const old=previous.find(row=>row.settlementId===settlementId&&row.slot===index);
      const available=candidates.filter(unit=>!used.has(unit.id));
      const unit=available.find(unit=>unit.id===old?.unitId)||available.sort((a,b)=>
        Number(isV39GarrisonAtHome(b,base))-Number(isV39GarrisonAtHome(a,base))
        ||Number(b.combatProfile?.mode==='army')-Number(a.combatProfile?.mode==='army')
        ||getHexDistance(a,base)-getHexDistance(b,base)||String(a.id).localeCompare(String(b.id)))[0];
      if(!unit)continue;
      used.add(unit.id);result.push({unitId:unit.id,settlementId,slot:index,x:base.x,y:base.y,worldId:base.worldId||'surface',name:base.name||settlementId});
    }
  }
  return result;
}
export function getV39NpcGarrisons(player){
  return selectV39BaseGarrisons(player?.factionState?.units,getFactionSettlements(player?.factionState||{}),player?.factionState?.aiState?.garrisons);
}
export const getV39NpcGarrisonIds=player=>new Set(getV39NpcGarrisons(player).map(row=>row.unitId));
export function prepareV39NpcGarrisons(state,playerId){
  return {...state,players:state.players.map(player=>player.id!==playerId?player:{...player,factionState:{...player.factionState,
    aiState:{...player.factionState.aiState,garrisons:getV39NpcGarrisons(player)}}})};
}
