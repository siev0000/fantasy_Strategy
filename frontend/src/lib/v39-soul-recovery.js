import balance from '../../../config/v39-soul-recovery.json';
import {normalizeV39SpatialUnitWorlds} from './v39-spatial-unit-worlds.js';
import {getHexDistance} from './hex-grid.js';
import {hasV39SkillEffect} from './v39-combat-ray.js';
import {getV39PassiveRows,matchV39PassiveCondition} from './v39-passive-rules.js';
import {resolvePopulationClassDefinition} from './v39-population-economy.js';
import {canV39UnitLeaveOrganicCorpse} from './v39-corpse-types.js';
import {resolveV39CorpseExpiry} from './v39-corpse-lifetime.js';
import {isV39UnitWaiting} from './v39-unit-action-rules.js';
import {resolveV39FactionUnitCargoStatus,addV39CargoToFactionUnit} from './v39-logistics-state.js';

const world=u=>u?.worldId||'surface';
const units=s=>{const spatial=normalizeV39SpatialUnitWorlds(s,s.activeWorldId||'surface');return [
  ...(s.players||[]).flatMap(p=>p.factionState?.units||[]),...spatial.enemies,...spatial.neutralVillages.flatMap(v=>v.defenseUnits||[])];};
const alive=u=>Number(u?.hp??u?.currentHp)>0;
export function hasV39SoulRecoveryPassive(unit,action){
  return getV39PassiveRows(unit).some(row=>hasV39SkillEffect(row,'魂回収')&&matchV39PassiveCondition(row,unit,action).matches);
}
export function canV39ManuallyRecoverSoul(unit){
  return resolvePopulationClassDefinition(unit?.race)?.増加条件==='魂'||hasV39SoulRecoveryPassive(unit,null);
}
export function resolveV39CorpseSoulPoints(corpse){
  const kind=resolvePopulationClassDefinition(corpse.race)?.種類;
  const count=corpse.animalArmy?.members?.length||corpse.combatProfile?.memberCount||1;
  return Math.max(0,Math.floor((balance.pointsByKind[kind]??balance.pointsPerPerson)*count));
}
function remainingPoints(corpse){
  return Math.max(0,resolveV39CorpseSoulPoints(corpse)-(Number(corpse.soulResourceRecoveredPoints)||0));
}
export function v39SoulRecoveryCorpseReason(state,playerId,corpse){
  if(!corpse||Number(corpse.hp??corpse.currentHp)>0)return '死亡していません';
  if(!Number.isFinite(Number(corpse.hp??corpse.currentHp)))return '死亡時のHP情報がありません';
  if(corpse.summon)return '召喚体は回収対象外です';
  if(!canV39UnitLeaveOrganicCorpse(corpse))return 'アンデッドの残骸は回収対象外です';
  if(corpse.soulCollected||remainingPoints(corpse)<=0)return '魂は回収済みです';
  if(resolveV39CorpseExpiry(corpse,state.timeline?.turnNumber||1)<=(state.timeline?.turnNumber||1))return '死体の回収期限を過ぎています';
  if(state.players?.find(p=>p.id===playerId)?.factionState?.units?.some(u=>u.id===corpse.id))return '自軍の死体は回収対象外です';
  return '';
}
const validCorpse=(state,playerId,corpse)=>!v39SoulRecoveryCorpseReason(state,playerId,corpse);
export function inspectV39ResourceSoulRecovery(state,playerId,unitId){
  const faction=state?.players?.find(p=>p.id===playerId)?.factionState;
  const unit=faction?.units?.find(u=>u.id===unitId);
  const eligible=!!unit&&alive(unit)&&canV39ManuallyRecoverSoul(unit);
  const bodies=eligible?units(state).filter(c=>(c.state==='死亡'||Number(c.hp??c.currentHp)<=0)&&world(c)===world(unit)):[];
  const nearby=bodies.filter(c=>getHexDistance(unit,c)<=balance.manualRadius);
  const corpses=nearby.filter(c=>validCorpse(state,playerId,c));
  const excluded=nearby.filter(c=>!validCorpse(state,playerId,c)).map(c=>({id:c.id,name:c.name||c.race,x:c.x,y:c.y,reason:v39SoulRecoveryCorpseReason(state,playerId,c)}));
  const cargo=resolveV39FactionUnitCargoStatus(faction,unitId,state);
  const nearest=eligible?bodies.map(c=>({id:c.id,name:c.name||c.race,x:c.x,y:c.y,distance:getHexDistance(unit,c),reason:v39SoulRecoveryCorpseReason(state,playerId,c)})).sort((a,b)=>a.distance-b.distance)[0]:null;
  const reason=!eligible?'魂を必要とする種族または条件を満たす魂回収パッシブが必要です'
    :state.activePlayerId!==playerId||state.timeline?.phase!=='player'?'自分の操作ターンに使用してください'
    :world(unit)!==(state.activeWorldId||'surface')?'このキャラクターは別のマップにいます'
    :isV39UnitWaiting(unit,state.timeline?.turnNumber||1)?'待機を解除してください'
    :unit.surveyTask||unit.transportAssignment?.enabled?'自動行動を停止してください'
    :Number(unit.ap??unit.currentAp)<balance.manualApCost?'APが不足しています'
    :cargo.remaining<1/balance.pointsPerSoul?'積載量が不足しています':!corpses.length
      ?excluded.length?`${excluded[0].name} (${excluded[0].x},${excluded[0].y}): ${excluded[0].reason}`
        :nearest?`最寄りの死体: ${nearest.name} (${nearest.x},${nearest.y}) / 距離${nearest.distance}マス（回収は${balance.manualRadius}マス以内）`:'このマップの死亡ユニットデータがありません':'';
  return {eligible,available:!reason,reason,corpses,excluded,nearest,unit,apCost:balance.manualApCost};
}
function takeSoul(state,playerId,unitId,corpse,apCost=0){
  const faction=state.players.find(p=>p.id===playerId)?.factionState;
  if(!faction)return {ok:false,state};
  const status=resolveV39FactionUnitCargoStatus(faction,unitId,state);
  const points=Math.min(remainingPoints(corpse),Math.floor((status.remaining+1e-8)*balance.pointsPerSoul));
  if(points<=0)return {ok:false,state};
  const added=addV39CargoToFactionUnit(faction,unitId,{resourcesByType:{魂:points/balance.pointsPerSoul}});
  if(!added.ok)return {ok:false,state};
  const recovered=(Number(corpse.soulResourceRecoveredPoints)||0)+points;
  const mark=u=>u.id===corpse.id?{...u,worldId:corpse.worldId,soulResourceRecoveredPoints:recovered,
    ...(recovered>=resolveV39CorpseSoulPoints(corpse)?{soulCollected:{playerId,turn:state.timeline?.turnNumber,resource:true}}:{})}:u;
  const villages=(state.neutralVillages||[]).map(v=>({...v,defenseUnits:(v.defenseUnits||[]).map(mark)}));
  const byId=new Map(villages.map(v=>[v.id,v]));
  return {ok:true,amount:points/balance.pointsPerSoul,state:{...state,
    players:state.players.map(p=>({...p,factionState:{...(p.id===playerId?added.faction:p.factionState),
      units:(p.id===playerId?added.faction:p.factionState).units.map(u=>{
        if(p.id===playerId&&u.id===unitId&&apCost){const ap=Math.max(0,Number(u.ap??u.currentAp)-apCost);return {...u,ap,currentAp:ap,actionPoint:ap};}
        return mark(u);
      })}})),enemies:(state.enemies||[]).map(mark),neutralVillages:villages,
    settlements:(state.settlements||[]).map(v=>byId.get(v.id)||v)}};
}
export function recoverV39ResourceSoul(state,playerId,unitId,corpseId){
  const check=inspectV39ResourceSoulRecovery(state,playerId,unitId);
  const corpse=check.corpses.find(c=>c.id===corpseId);
  if(!check.available||!corpse)return {ok:false,state,reason:check.reason||'対象の死体がありません'};
  return takeSoul(state,playerId,unitId,corpse,check.apCost);
}

export function inspectV39SoulRecoveryTiles(state,playerId,unitId,selectedKeys=[]){
  const check=inspectV39ResourceSoulRecovery(state,playerId,unitId),byTile=new Map();
  for(const corpse of check.corpses){
    const key=`${corpse.x},${corpse.y}`;
    if(!byTile.has(key))byTile.set(key,{key,x:corpse.x,y:corpse.y,corpses:[],points:0});
    const tile=byTile.get(key);tile.corpses.push(corpse);tile.points+=remainingPoints(corpse);
  }
  const keys=[...new Set(selectedKeys)],tiles=[...byTile.values()];
  const chosen=keys.map(key=>byTile.get(key));
  const points=chosen.reduce((sum,tile)=>sum+(tile?.points||0),0);
  const apCost=keys.length*balance.manualApCost;
  const faction=state?.players?.find(p=>p.id===playerId)?.factionState;
  const capacityPoints=Math.floor((resolveV39FactionUnitCargoStatus(faction,unitId,state).remaining+1e-8)*balance.pointsPerSoul);
  const reason=check.reason||(!keys.length?'回収するマスを選択してください':chosen.some(tile=>!tile)?'回収できないマスが含まれています'
    :Number(check.unit.ap??check.unit.currentAp)<apCost?'APが不足しています':points>capacityPoints?'積載量が不足しています':'');
  return {...check,tiles,selectedKeys:keys,points,amount:points/balance.pointsPerSoul,apCost,reason,available:!reason};
}

export function recoverV39SoulTiles(state,playerId,unitId,selectedKeys){
  const check=inspectV39SoulRecoveryTiles(state,playerId,unitId,selectedKeys);
  if(!check.available)return {ok:false,state,reason:check.reason};
  let next=state;
  for(const tile of check.tiles.filter(t=>check.selectedKeys.includes(t.key)))for(const corpse of tile.corpses){
    const result=takeSoul(next,playerId,unitId,corpse);
    if(!result.ok)return {ok:false,state,reason:'回収条件が変わりました。選び直してください'};
    next=result.state;
  }
  next={...next,players:next.players.map(p=>p.id!==playerId?p:{...p,factionState:{...p.factionState,
    units:p.factionState.units.map(u=>{if(u.id!==unitId)return u;const ap=Math.max(0,Number(u.ap??u.currentAp)-check.apCost);return {...u,ap,currentAp:ap,actionPoint:ap};})}})};
  return {ok:true,state:next,amount:check.amount,apCost:check.apCost,tileCount:check.selectedKeys.length};
}
export function recoverV39AttackSouls(before,after,actor,skillRow,entries){
  if(!hasV39SkillEffect(skillRow,'魂回収')&&!hasV39SoulRecoveryPassive(actor,skillRow))return after;
  const playerId=before.players?.find(p=>p.factionState?.units?.some(u=>u.id===actor.id))?.id;
  if(!playerId)return after;
  const old=new Map(units(before).map(u=>[u.id,u])),seen=new Set();
  for(const entry of entries){
    if(entry.friendly||seen.has(entry.targetId)||!alive(old.get(entry.targetId)))continue;
    seen.add(entry.targetId);
    const corpse=units(after).find(u=>u.id===entry.targetId);
    if(validCorpse(after,playerId,corpse))after=takeSoul(after,playerId,actor.id,corpse).state;
  }
  return after;
}
