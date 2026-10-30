import {getFactionSettlements,replaceFactionSettlement} from './settlement-state.js';
import {resolveV39SettlementTerritoryDamage,resolveV39SettlementDisasterMultiplier} from './v39-city-specialization-rules.js';
import {damageV39FacilityHealth} from './v39-facility-health.js';
import {resolveV39DisasterDamage} from './v39-disaster-damage.js';

export function applyV39FacilityDisasterDamage(state,events,turn){
  const world=state.activeWorldId||'surface',entries=[];
  const hazards=events.filter(event=>Number(event.details?.facilityDamageMultiplier)>0);
  if(!hazards.length)return {players:state.players,neutralVillages:state.neutralVillages,entries};
  function damageBase(base,owner){
    if(!base||base.placed===false||(base.worldId||'surface')!==world)return base;
    const facilityStateByTile={...base.facilityStateByTile};let changed=false;
    for(const [key,names] of Object.entries(base.tileFacilityMap||{})){
      if(owner.playerId&&state.territoryOwnerByTile?.[key]&&state.territoryOwnerByTile[key]!==owner.playerId)continue;
      const active=hazards.filter(event=>(event.damageTileKeys||event.tileKeys||[]).includes(key));
      if(!active.length)continue;
      for(const name of new Set(Array.isArray(names)?names:[])){
        let strongest=null;
        for(const event of active){
          const spec=resolveV39DisasterDamage(event),power=spec.power*event.details.facilityDamageMultiplier;
          if(power<=0)continue;
          const element=spec.element||'打撃';
          const reduced=resolveV39SettlementTerritoryDamage(base,key,power,{skillRow:{[element]:power},worldId:world});
          const damage=Math.max(0,Math.round(reduced*resolveV39SettlementDisasterMultiplier(base,key,event.disasterId,world)));
          if(!strongest||damage>strongest.damage)strongest={event,damage};
        }
        if(!strongest||strongest.damage<=0)continue;
        const source=facilityStateByTile[key]?.[name]||{};
        const result=damageV39FacilityHealth(source,strongest.damage,turn,strongest.event.name||'災害');
        if(result.damage<=0)continue;
        facilityStateByTile[key]={...facilityStateByTile[key],[name]:result.health};changed=true;
        const [x,y]=key.split(',').map(Number),settlementId=base.settlementId||base.id;
        entries.push({unitId:`facility:${owner.playerId||owner.neutralVillageId}:${settlementId}:${world}:${key}:${name}`,
          targetType:'facility',name,facilityName:name,settlementId,...owner,x,y,damage:result.damage,total:result.damage,
          beforeHp:result.beforeHp,afterHp:result.afterHp,maxHp:result.maxHp,source:strongest.event.name||'災害',
          disasterId:strongest.event.disasterId,destroyed:result.afterHp<=0});
      }
    }
    return changed?{...base,facilityStateByTile}:base;
  }
  const players=(state.players||[]).map(player=>{
    let factionState=player.factionState;
    for(const base of getFactionSettlements(factionState)){
      const damaged=damageBase(base,{playerId:player.id});
      if(damaged!==base)factionState=replaceFactionSettlement(factionState,damaged,{select:false,ownerPlayerId:player.id});
    }
    return factionState===player.factionState?player:{...player,factionState};
  });
  const neutralVillages=(state.neutralVillages||[]).map(base=>damageBase(base,{neutralVillageId:base.id}));
  return {players,neutralVillages,entries};
}
