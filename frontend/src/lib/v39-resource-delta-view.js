export function getV39RecordedResourceDelta(base,key){
  const record=base?.lastEconomyDelta;
  const value=record?.food?.[key]??record?.material?.[key];
  return value==null||!Number.isFinite(Number(value))?null:Number(value);
}

export function describeV39ResourceDelta(value){
  if(value==null||!Number.isFinite(Number(value)))return {text:'(未集計)',tone:'unknown'};
  const rounded=Math.round(Number(value)*100)/100;
  return {text:`(${rounded>=0?'+':''}${rounded})`,tone:rounded<0?'negative':rounded>0?'positive':'zero'};
}

export function buildV39ResourceFlowRecord({production={},before={},after={},maintenance={},reserved={}}={}){
  const n=value=>Number.isFinite(Number(value))?Number(value):0,round=value=>Math.round(value*10)/10;
  const keys=[...new Set([...Object.keys(production),...Object.keys(before),...Object.keys(after)])];
  const deltaByType={},consumptionByType={},growthConsumptionByType={};
  for(const key of keys){
    deltaByType[key]=round(n(after[key])-n(before[key]));
    consumptionByType[key]=round(Math.max(0,n(production[key])-deltaByType[key]));
    growthConsumptionByType[key]=round(Math.max(0,consumptionByType[key]-n(maintenance[key])-n(reserved[key])));
  }
  return {productionByType:{...production},consumptionByType,deltaByType,
    maintenanceByType:{...maintenance},growthConsumptionByType,tradeReservedByType:{...reserved}};
}
