import {getFactionSettlements} from './settlement-state.js';

export function getV39ConstructionPlanPreviews(state){
  const faction=state?.players?.find(player=>player.id===state.activePlayerId)?.factionState;
  const world=state?.activeWorldId||'surface',seen=new Set(),previews=[];
  for(const base of getFactionSettlements(faction)){
    if((base.worldId||'surface')!==world)continue;
    for(const plan of base.operationPlans||[]){
      if(!['construction','wall','development'].includes(plan.kind)||!plan.facilityName||!Number.isInteger(plan.tile?.x)||!Number.isInteger(plan.tile?.y))continue;
      const tileKey=`${plan.tile.x},${plan.tile.y}`;
      if(plan.kind!=='wall'&&seen.has(tileKey))continue;
      if(plan.kind!=='wall')seen.add(tileKey);
      previews.push({id:plan.id,tileKey,facilityName:plan.facilityName,worldId:world,planned:true,
        ...(plan.kind==='wall'?{edges:plan.edges||[]}:{}),...(plan.kind==='development'?{settlementType:plan.facilityName}:{})});
    }
  }
  return previews;
}
