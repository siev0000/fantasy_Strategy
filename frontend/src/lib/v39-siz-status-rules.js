import {V39_SIZ_STATUS_BALANCE as rules} from './v39-gameplay-balance.js';

export function resolveV39SizStatusModifiers(value){
  const raw=value==null||value===''?NaN:Number(value);
  const siz=Math.max(rules.minimumSiz,Number.isFinite(raw)?raw:rules.neutralSiz);
  const fraction=siz<rules.neutralSiz?(siz-rules.neutralSiz)/(rules.neutralSiz-rules.minimumSiz)
    :(siz-rules.neutralSiz)/(rules.largeReferenceSiz-rules.neutralSiz);
  const powerPercent=fraction*rules.statusPercent;
  return {siz,statusPercent:{HP:powerPercent,攻撃:powerPercent,魔力:powerPercent,速度:-powerPercent,命中:-fraction*rules.accuracyPercent},
    skillPercent:{隠密:-powerPercent}};
}

function applyPercent(source,percent){
  const result={...source};
  for(const [key,bonus] of Object.entries(percent)){
    if(!Object.hasOwn(source||{},key))continue;
    const value=Number(source[key]);if(!Number.isFinite(value))continue;
    const scaled=Math.max(0,value)*Math.max(rules.minimumMultiplier,1+bonus/100);
    result[key]=Math.max(key==='HP'&&value>0?1:0,Math.round(scaled+Number.EPSILON*Math.max(1,scaled)*2));
  }
  return result;
}

// Call only on regenerated race/class growth values, never on already-derived stats.
export function applyV39SizStatusModifiers(status,skillLevels={}){
  const modifiers=resolveV39SizStatusModifiers(status?.SIZ);
  return {status:{...applyPercent(status,modifiers.statusPercent),SIZ:modifiers.siz},
    skillLevels:applyPercent(skillLevels,modifiers.skillPercent),modifiers};
}

// Derived unit values already include the original SIZ modifier. Apply only
// the ratio between the new and old modifier to avoid counting it twice.
export function applyV39SizChangeToDerived(status,skillLevels,oldSiz,newSiz){
  const old=resolveV39SizStatusModifiers(oldSiz);
  const next=resolveV39SizStatusModifiers(newSiz);
  const scale=(source,oldPercents,newPercents)=>{
    const result={...source};
    for(const key of Object.keys(newPercents)){
      if(!Object.hasOwn(source||{},key))continue;
      const before=Math.max(rules.minimumMultiplier,1+(oldPercents[key]||0)/100);
      const after=Math.max(rules.minimumMultiplier,1+(newPercents[key]||0)/100);
      result[key]=Math.max(key==='HP'&&Number(source[key])>0?1:0,Math.round((Number(source[key])||0)*after/before));
    }
    return result;
  };
  return {status:{...scale(status,old.statusPercent,next.statusPercent),SIZ:next.siz},skillLevels:scale(skillLevels,old.skillPercent,next.skillPercent)};
}
