const rows = value => Array.isArray(value) ? value : [];

export function collectV39AcquiredToolNames(faction = {}) {
  const history = Array.isArray(faction.acquiredToolNames) ? faction.acquiredToolNames : [];
  const names = new Set(history.filter(name=>typeof name==='string' && name));
  const rememberStock = stock => {
    for (const [name,amount] of Object.entries(stock ?? {})) {
      if (Number(amount)>0) names.add(name);
    }
  };
  const rememberUnit = unit => {
    rememberStock(unit?.toolStockByType);
    rememberStock(unit?.expeditionCargoByType);
  };
  for (const base of rows(faction.settlements)) rememberStock(base?.toolStockByType);
  for (const unit of rows(faction.units)) rememberUnit(unit);
  for (const entry of rows(faction.facilityStorage)) rememberUnit(entry?.unit);
  return [...names];
}
