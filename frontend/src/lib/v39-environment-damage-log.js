const text=value=>String(value??'').trim();
const number=value=>value==null||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const damage=entry=>Math.max(0,number(entry.damage??entry.total)||0);
const source=(entry,fallback)=>text(entry.source)||fallback;
export function formatV39EnvironmentDamageEntry(entry,fallback='災害'){
  const name=text(entry.name||entry.targetName||entry.unitId||entry.targetId)||'対象';
  const hp=number(entry.beforeHp)!=null&&number(entry.afterHp)!=null?` / HP ${entry.beforeHp}→${entry.afterHp}`:'';
  const components=entry.detail?.components?.map(c=>`${text(c.resistanceKey).replace(/耐性$/u,'')} ${c.damage}`).join('＋');
  const force=number(entry.collisionPower)!=null?` / 衝突威力${entry.collisionPower}`:'';
  return `${name}: ${source(entry,fallback)} ${damage(entry)}ダメージ${components?`（${components}）`:''}${hp}${force}`;
}
function summarize(rows,label,turn,visibility){
  const victims=new Map();
  for(const entry of rows){
    const key=entry.unitId||entry.targetId||entry.name||entry.targetName;
    const victim=victims.get(key)||{name:text(entry.name||entry.targetName||key)||'対象',damage:0,targetType:entry.targetType};
    victim.damage+=damage(entry);
    victims.set(key,victim);
  }
  const count=victims.size;
  const facilities=[...victims.values()].filter(victim=>victim.targetType==='facility').length;
  const targets=facilities?[count>facilities?`${count-facilities}体`:'',`施設${facilities}件`].filter(Boolean).join('・'):`${count}体`;
  const total=rows.reduce((sum,e)=>sum+damage(e),0);
  return {channel:'battle',title:label,message:`被害 ${targets} / 合計${total}ダメージ`,
    details:[...victims.values()].map(e=>`${e.name}：${e.damage}ダメージ`).join('\n'),collapsible:true,turn,
    combatVisibility:visibility,environmentDamageEntries:rows};
}
export function mergeV39EnvironmentDamageLogs(previous,current){
  return summarize([...previous.environmentDamageEntries,...current.environmentDamageEntries],current.title,current.turn,current.combatVisibility);
}
export function buildV39EnvironmentDamageLogs(detail,state,{fallback='災害',testMode=false,isVisible=()=>false,isDetected=()=>true,background=false}={}){
  if(!state?.activePlayerId)return [];
  const world=detail.worldId||state?.activeWorldId||'surface';
  if(background||world!==(state?.activeWorldId||'surface'))return [];
  const ownIds=new Set(state?.players?.find(p=>p.id===state.activePlayerId)?.factionState?.units?.map(u=>u.id)||[]);
  const units=[...(state?.players||[]).flatMap(p=>p.factionState?.units||[]),...(state?.enemies||[]),...(state?.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])];
  const byId=new Map(units.map(u=>[u.id,u]));
  const visible=(detail.damageEntries||detail.entries||[]).filter(entry=>{
    if(damage(entry)<=0||entry.visibleAtDamage===false)return false;
    if(entry.visibleAtDamage===true||testMode)return true;
    const id=entry.unitId||entry.targetId,owner=entry.playerId||entry.ownerPlayerId;
    if(owner===state?.activePlayerId||ownIds.has(id))return true;
    const unit=byId.get(id);
    return number(entry.x)!=null&&number(entry.y)!=null&&isVisible(entry.x,entry.y)&&unit&&isDetected(unit)!==false;
  });
  const grouped=new Map();
  for(const entry of visible){
    const label=source(entry,fallback);
    if(!grouped.has(label))grouped.set(label,[]);grouped.get(label).push(entry);
  }
  return [...grouped].map(([label,rows])=>summarize(rows,label,detail.turnNumber||state.timeline?.turnNumber,
    {playerId:state.activePlayerId,worldId:world,observed:true}));
}
