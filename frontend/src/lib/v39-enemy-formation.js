// 編成人数 is the number inside one marker, not the number of markers in an encounter.
export function resolveV39EnemyMemberCount(row) {
  const raw=row?.編成人数;
  if(raw===undefined||raw===null||raw==='')return 1;
  if(typeof raw==='boolean')return null;
  const count=Number(raw);
  return Number.isInteger(count)&&count>=1&&count<=99?count:null;
}

export function resolveV39EnemyCombatProfile(row,{special=false}={}) {
  const count=special?1:resolveV39EnemyMemberCount(row);
  if(!count||count===1)return null;
  return {mode:'army',unitTypeLabel:'軍隊',memberCount:count,populationCost:0,
    hpMultiplier:1+(count-1)*0.5,attackCount:count,simpleActionOnly:true};
}
