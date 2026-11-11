const chainScales = [1/2,5/12,1/3,1/4];

export function resolveV39ChainDepth(row) {
  const effects=String(row?.効果??'').split(/[\s,:：;；/／|｜、]+/u);
  return Math.max(0,...effects.map(effect=>effect==='連鎖'?1:Number(effect.match(/^連鎖_([1-4])$/)?.[1])||0));
}

export function runV39ChainAttacks({depth,entries,targets,canSpread,strike}) {
  let origins=entries.filter(entry=>entry.targetId&&(entry.hitCount>0||entry.hitResults?.some(hit=>hit.hit)));
  const reached=new Set(origins.map(entry=>String(entry.targetId)));
  for(const id of reached)strike(id,chainScales[0],1,true);
  for(let index=0;index<depth&&origins.length;index++){
    const next=[];
    for(const target of targets){
      const id=String(target.id);
      if(reached.has(id)||!origins.some(origin=>canSpread(origin,target)))continue;
      reached.add(id);
      if(strike(id,chainScales[index],index+1,false))next.push(target);
    }
    origins=next;
  }
}
