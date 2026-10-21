import {V39_TRADE_RESOURCES,tradeBank,tradeBankAmount} from './v39-trade-state.js';
import {collectV39TerritoryIncome,inspectV39NeutralVillageEconomy} from './v39-economy-rules.js';
import {getV39SpecialtyEntries,isV39HarvestResource,resolveV39SpecialResourceHarvestRule} from './v39-specialty-rules.js';
import {collectV39TradeResourceKnowledge} from './v39-trade-knowledge.js';

export function getV39KnownTradeResources(state,playerId=state.activePlayerId){
  const faction=state.players?.find(row=>row.id===playerId)?.factionState;
  if(!faction)return new Set();
  const contracts=(state.players||[]).flatMap(row=>row.factionState.tradeContracts||[]).filter(row=>row.sides?.some(side=>side.kind==='player'&&side.partyId===playerId));
  return new Set(collectV39TradeResourceKnowledge(faction,contracts));
}

export function getV39TradeResourceAvailability(state,side,mapData=null){
  const bank=tradeBank(state,side),player=state.players?.find(row=>row.id===side.partyId);
  const metrics=bank&&mapData?.grid?(side.kind==='village'
    ?inspectV39NeutralVillageEconomy(bank,mapData)
    :player?collectV39TerritoryIncome(state,{...player,factionState:{...player.factionState,selectedSettlementId:side.settlementId}},mapData):null):null;
  const income={...(metrics?.income?.food||metrics?.food),...(metrics?.income?.material||metrics?.material)};
  if(bank&&player&&side.kind==='player'){
    for(const entry of getV39SpecialtyEntries(state,side.partyId,{settlementId:side.settlementId,ownedOnly:true}).filter(isV39HarvestResource)){
      if(mapData?.lavaMap?.[entry.y]?.[entry.x])continue;
      const rule=resolveV39SpecialResourceHarvestRule(entry,player.factionState.research);
      // A periodic harvest remains income even on turns when no item is paid out.
      income[entry.name]=(Number(income[entry.name])||0)+rule.amount*rule.speed/rule.turns;
    }
  }
  return Object.fromEntries(V39_TRADE_RESOURCES.map(resource=>{
    const stock=Math.max(0,tradeBankAmount(bank,resource.name)),gain=resource.specialty?0:Math.max(0,Number(income[resource.name])||0);
    return [resource.name,{stock,income:gain,canSelect:!!bank&&(stock>0||gain>0),field:resource.field}];
  }));
}
