import config from '../../../config/v39-trade.json';

export function collectV39TradeResourceKnowledge(faction={},contracts=faction.tradeContracts||[]){
  const names=new Set([...(config.initialKnownResources||[]),...(faction.knownTradeResourceNames||[])]);
  const remember=bag=>{for(const [name,amount] of Object.entries(bag||{}))if(Number(amount)>0)names.add(name);};
  for(const bank of faction.settlements||[]){remember(bank.foodStockByType);remember(bank.materialStockByType);}
  for(const unit of faction.units||[])remember(unit.cargo?.resourcesByType);
  for(const entry of Object.values(faction.exploration?.discoveredSpecialtiesByTile||{}))if(entry?.name)names.add(entry.name);
  for(const squad of faction.squads||[]){remember(squad.cargo?.resourcesByType);for(const cargo of Object.values(squad.cargoByUnitId||{}))remember(cargo?.resourcesByType);}
  // Only completed exchanges teach resources; an unaccepted request is not discovery.
  for(const contract of contracts)for(const exchange of contract.history||[])for(const goods of exchange.goods||[])remember(goods);
  return [...names].filter(name=>typeof name==='string'&&name);
}
