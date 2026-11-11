const n=value=>Math.max(0,Number(value)||0);

// Replay authoritative post-guard hit results without changing committed HP.
export function expandV39SkillHitEntries(entries){
  const seen=new Set(),result=[];
  for(const entry of entries||[]){
    if(!entry.targetId||seen.has(entry.targetId))continue;
    seen.add(entry.targetId);
    if(!entry.hitResults?.length){result.push(entry);continue;}
    let hp=n(entry.beforeHp);
    for(const [index,hit]of entry.hitResults.entries()){
      if(hp<=0)break;
      const damage=hit.hit?Math.min(hp,n(hit.damage??entry.hits?.[index])):0;
      const next=hp-damage;
      result.push({...entry,hitIndex:index,beforeHp:hp,afterHp:next,total:damage,
        hitCount:hit.hit?1:0,hitResults:[{...hit,damage}],hits:[damage]});
      hp=next;
    }
  }
  return result;
}

export function aggregateV39CounterEvents(events){
  const grouped=new Map();
  for(const event of events){
    const key=JSON.stringify([event.ownerId,event.name,event.cause,event.attackerId]);
    const prior=grouped.get(key);
    if(prior){prior.amount+=n(event.amount);prior.hitEvents++;}
    else grouped.set(key,{...event,amount:n(event.amount),hitEvents:1});
  }
  return [...grouped.values()];
}
