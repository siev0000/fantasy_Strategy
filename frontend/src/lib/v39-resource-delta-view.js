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
