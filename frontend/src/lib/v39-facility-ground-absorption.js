import {getFactionSettlements,replaceFactionSettlement} from './settlement-state.js';
import {damageV39FacilityHealth} from './v39-facility-health.js';

const text=value=>String(value??'');

export function createV39FacilityGroundAbsorber(state,turn,cause='地形攻撃'){
  const world=state?.activeWorldId||'surface',plans=[],reserved=new Map();
  const bases=[...(state?.players||[]).flatMap(player=>getFactionSettlements(player.factionState)
    .map(base=>({base,playerId:player.id}))),...(state?.neutralVillages||[]).map(base=>({base,neutralVillageId:base.id}))];
  function absorb(tileKey,damage){
    let remaining=Math.max(0,Math.floor(Number(damage)||0));
    for(const owner of bases){
      const {base}=owner;
      if(!remaining||!base||base.placed===false||(base.worldId||'surface')!==world)continue;
      if(owner.playerId&&state?.territoryOwnerByTile?.[tileKey]&&state.territoryOwnerByTile[tileKey]!==owner.playerId)continue;
      for(const name of new Set(base.tileFacilityMap?.[tileKey]||[])){
        if(!remaining)break;
        const id=[owner.playerId?'player':'neutral',owner.playerId||owner.neutralVillageId,
          base.settlementId||base.id,tileKey,name].join('|');
        const source=base.facilityStateByTile?.[tileKey]?.[name]||{};
        const hp=Math.max(0,Math.min(Number(source.maxHp)||100,Number(source.hp??source.maxHp??100)||0)-(reserved.get(id)||0));
        const taken=Math.min(remaining,hp);
        if(!taken)continue;
        reserved.set(id,(reserved.get(id)||0)+taken);
        plans.push({playerId:owner.playerId,neutralVillageId:owner.neutralVillageId,
          settlementId:base.settlementId||base.id,tileKey,name,damage:taken,turn,cause});
        remaining-=taken;
      }
    }
    return remaining;
  }
  return {absorb,plans};
}

export function applyV39PlannedFacilityDamage(state,plans){
  if(!plans?.length)return {players:state.players,neutralVillages:state.neutralVillages,entries:[]};
  const entries=[];
  function damageBase(base,owner,ownerType){
    const matches=plans.filter(plan=>text(ownerType==='player'?plan.playerId:plan.neutralVillageId)===text(owner)
      &&text(plan.settlementId)===text(base.settlementId||base.id));
    if(!matches.length)return base;
    const facilityStateByTile={...base.facilityStateByTile};
    for(const plan of matches){
      const current=facilityStateByTile[plan.tileKey]?.[plan.name]||{};
      const result=damageV39FacilityHealth(current,plan.damage,plan.turn,plan.cause);
      facilityStateByTile[plan.tileKey]={...facilityStateByTile[plan.tileKey],[plan.name]:result.health};
      const [x,y]=plan.tileKey.split(',').map(Number);
      entries.push({targetType:'facility',name:plan.name,facilityName:plan.name,
        playerId:plan.playerId,neutralVillageId:plan.neutralVillageId,
        settlementId:plan.settlementId,x,y,damage:result.damage,total:result.damage,
        beforeHp:result.beforeHp,afterHp:result.afterHp,maxHp:result.maxHp,source:plan.cause,destroyed:result.afterHp<=0});
    }
    return {...base,facilityStateByTile};
  }
  const players=(state.players||[]).map(player=>{
    let factionState=player.factionState;
    for(const base of getFactionSettlements(factionState)){
      const next=damageBase(base,player.id,'player');
      if(next!==base)factionState=replaceFactionSettlement(factionState,next,{select:false,ownerPlayerId:player.id});
    }
    return factionState===player.factionState?player:{...player,factionState};
  });
  const neutralVillages=(state.neutralVillages||[]).map(base=>damageBase(base,base.id,'neutral'));
  return {players,neutralVillages,entries};
}
