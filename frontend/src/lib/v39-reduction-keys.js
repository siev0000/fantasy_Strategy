export const V39_REDUCTION_KEYS=Object.freeze({
  物理軽減:['物理耐性'],
  魔法軽減:['魔法耐性'],
  遠隔軽減:['射撃耐性','遠隔耐性','射撃軽減']
});
export function normalizeV39ReductionKey(key){
  return Object.keys(V39_REDUCTION_KEYS).find(name=>name===key||V39_REDUCTION_KEYS[name].includes(key))||key;
}
export const isV39FlatReduction=key=>Object.hasOwn(V39_REDUCTION_KEYS,normalizeV39ReductionKey(key));
export function readV39ReductionField(record,key){
  const name=normalizeV39ReductionKey(key);
  for(const candidate of [name,...(V39_REDUCTION_KEYS[name]||[])]){
    if(record?.[candidate]!==null&&record?.[candidate]!==undefined)return record[candidate];
  }
  return undefined;
}
export function readV39UnitResistance(unit,key){
  return readV39ReductionField(unit?.status,key)??readV39ReductionField(unit?.resistances,key);
}
// Canonical fields take precedence when a save contains both old and new names.
export function normalizeV39ReductionFields(record={}){
  const result={...record};
  for(const [key,aliases] of Object.entries(V39_REDUCTION_KEYS)){
    const value=readV39ReductionField(record,key);
    for(const alias of aliases)delete result[alias];
    if(value!==undefined)result[key]=value;
  }
  return result;
}
