export function normalizeV39HitEffect(raw = {}) {
  return { hitEffectMode:['common','specified'].includes(raw.hitEffectMode)?raw.hitEffectMode:'none',
    hitEffectName:typeof raw.hitEffectName==='string'?raw.hitEffectName.trim():'' };
}

export function resolveV39HitTargets(entries = []) {
  const found = new Map();
  for(const entry of entries){
    const hits=entry?.hitResults;
    const hit=Array.isArray(hits)?hits.some(item=>item.hit===true):Number(entry?.total)>0;
    if(!hit || !Number.isFinite(entry.x) || !Number.isFinite(entry.y))continue;
    found.set(`${entry.x},${entry.y}`,{x:entry.x,y:entry.y});
  }
  return [...found.values()];
}
