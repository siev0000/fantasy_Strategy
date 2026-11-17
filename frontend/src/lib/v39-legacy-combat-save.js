const aliases=[['スタン','怯み'],['ノックバック','体幹']];
const forcedEffects=new Set(['吹き飛ばし','吹飛ばし','押し出し','引き寄せ']);
const legacyForcedSkills=new Set(['打ち倒す一撃','守りの去なし']);

export function normalizeV39LegacyCombatSave(value,path='gameState'){
  if(Array.isArray(value))return value.map((entry,index)=>normalizeV39LegacyCombatSave(entry,`${path}[${index}]`));
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)return value;
  const result={...value};
  for(const [oldKey,newKey] of aliases){
    if(!Object.hasOwn(value,oldKey))continue;
    const old=value[oldKey];
    if(typeof old!=='number'||!Number.isFinite(old))throw new Error(`旧セーブの変換に失敗しました: ${path}.${oldKey} は有限の数値が必要です`);
    if(Object.hasOwn(value,newKey)){
      if(typeof value[newKey]!=='number'||!Number.isFinite(value[newKey]))throw new Error(`旧セーブの変換に失敗しました: ${path}.${newKey} は有限の数値が必要です`);
    }else result[newKey]=old;
    delete result[oldKey];
    if(oldKey==='ノックバック'&&old>0&&legacyForcedSkills.has(value.名前)&&result[newKey]>0){
      if(value.効果!=null&&typeof value.効果!=='string')throw new Error(`旧セーブの変換に失敗しました: ${path}.効果 は文字列が必要です`);
      const effects=(value.効果||'').split(/[\s/／,，、|]+/u).filter(Boolean);
      if(!effects.some(effect=>forcedEffects.has(effect)))result.効果=[value.効果,'吹き飛ばし'].filter(Boolean).join('/');
    }
  }
  return Object.fromEntries(Object.entries(result).map(([key,entry])=>[key,normalizeV39LegacyCombatSave(entry,`${path}.${key}`)]));
}
