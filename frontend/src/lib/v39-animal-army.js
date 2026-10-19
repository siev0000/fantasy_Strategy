import {applyV39DerivedCharacterData} from '../v39/unit/v39-character-derived-rules.js';
import {resolveV39AnimalArmyProgress} from './v39-unit-experience.js';
import {V39_ANIMAL_ARMY_SETTINGS as settings, isV39AnimalArmy, isV39OrdinaryAnimal} from './v39-animal-army-profile.js';
import {getHexDistance,getHexOffsetNeighbors} from './hex-grid.js';
import {canUnitEnterV39Tile,resolveV39UnitMovementStepCost} from './v39-terrain-traversal.js';
import {v39SquadAutomaticDuty} from './v39-squad-coordination.js';
import {isV39CargoEmpty} from './v39-logistics-state.js';
import {getV39StorageFacilities,getV39FacilityStoredEntries} from './v39-facility-storage.js';

const alive = u => Number(u?.hp ?? u?.currentHp) > 0 && !['死亡','死体'].includes(u?.state);
const world = u => u?.worldId || 'surface';
const key = u => `${u.x},${u.y}`;
const zeroAp = unit => ({...unit,ap:0,currentAp:0,actionPoint:0,squadMoveMode:'independent',squadGather:null});
export function getV39AnimalArmyEntries(state,playerId) {
  const f = state.players?.find(p=>p.id===playerId)?.factionState;
  return [...(f?.units || []).map(unit=>({unit})),...(f?.facilityStorage || []).map(storage=>({unit:storage.unit,storage}))];
}
export function inspectV39AnimalArmyUnit(state,playerId,entry) {
  const u=entry?.unit, f=state.players?.find(p=>p.id===playerId)?.factionState;
  if (!u || !f) return 'ユニットが見つかりません';
  if (!alive(u)) return '生存している個体が必要です';
  if (!isV39OrdinaryAnimal(u)) return '通常の動物・蟲のみ（ヒーロー・ネームド・召喚は対象外）';
  if (!isV39AnimalArmy(u) && (u.combatProfile?.memberCount>1 || u.combatProfile?.mode&&u.combatProfile.mode!=='normal')) return '内部個体を持たない既存軍隊は対象外です';
  if (u.fusionGrowth || u.strongAnimalClassName || u.undeadOrigin) return '合成・強敵・アンデッド個体は対象外です';
  if (world(u)!==(state.activeWorldId||'surface')) return '別マップにいます';
  if(entry.storage){
    const facility=getV39StorageFacilities(state,playerId).find(v=>v.tileKey===entry.storage.tileKey&&v.name===entry.storage.facilityName&&v.type==='unit');
    if(!facility)return '自軍の生体格納施設が必要です';
  }
  if (v39SquadAutomaticDuty(f,u) || u.autoTransport || u.instructorAssignment) return '自動任務を先に解除してください';
  const squad=f.squads?.find(s=>s.unitIds?.includes(u.id));
  if (squad && (!isV39CargoEmpty(squad.cargo) || !isV39CargoEmpty(squad.cargoByUnitId?.[u.id]))) return '運搬品を先に降ろしてください';
  if (!isV39CargoEmpty(u.cargo) || Object.values(u.toolStockByType||{}).some(n=>Number(n)>0)) return '携帯品を先に預けてください';
  const runtime=f.combatRuntime || {};
  if(Object.values(runtime.cooldownsByUnitId?.[u.id]||{}).some(deadline=>Number(deadline)>Number(state.timeline?.turnNumber)))return '再使用待ちのスキルがあります';
  if (runtime.pendingActionsByUnitId?.[u.id] || (runtime.activeEffectsByUnitId?.[u.id]||[]).length
    || u.shield?.remaining>0 || u.barrier?.remaining>0
    || entry.storage?.runtimeByKey?.pendingActionsByUnitId || (entry.storage?.runtimeByKey?.activeEffectsByUnitId||[]).length
    || Object.values(entry.storage?.runtimeByKey?.cooldownsByUnitId||{}).some(deadline=>Number(deadline)>Number(state.timeline?.turnNumber))) return '行動予約・一時効果がある間は編成できません';
  return '';
}
export function getV39AnimalArmyMemberUnits(army) {
  if (!isV39AnimalArmy(army)) return [structuredClone(army)];
  const rate=Math.max(0,Number(army.hp??army.currentHp))/Math.max(1,army.maxHp);
  const factor=rate/Math.max(1e-9,Number(army.animalArmy.initialHpRate));
  return army.animalArmy.members.map(raw=>{
    const unit=structuredClone(raw),hp=Math.min(unit.maxHp,Math.max(rate>0?1:0,Math.floor(Number(unit.hp)*factor)));
    return {...unit,hp,currentHp:hp,...Object.fromEntries(['lastCombatTurn','lastStealthAttackTurn','lastStealthBreakTurn'].map(name=>[name,Math.max(Number(unit[name])||0,Number(army[name])||0)]))};
  });
}
function sameBuild(a,b) {
  const signature=u=>JSON.stringify([u.race,u.className,u.secondClassName||'',u.prerequisiteClassLevels||{},u.fusionAppearanceClass||'',u.testSkillNames||[]]);
  return signature(a)===signature(b);
}
export function inspectV39AnimalArmyCandidate(state,playerId,anchor,entry) {
  const reason=inspectV39AnimalArmyUnit(state,playerId,entry);
  if (reason) return reason;
  if (isV39AnimalArmy(entry.unit) && entry.unit.id!==anchor.unit.id) return '別の軍隊は先に解散してください';
  if (!sameBuild(anchor.unit,entry.unit)) return '同種・同じクラス構成の個体を選んでください';
  if (anchor.storage || entry.storage) {
    if (!anchor.storage || !entry.storage || anchor.storage.tileKey!==entry.storage.tileKey
      || anchor.storage.facilityName!==entry.storage.facilityName || anchor.storage.worldId!==entry.storage.worldId) return '同じ施設内の個体を選んでください';
  } else if (getHexDistance(anchor.unit,entry.unit)>settings.assemblyRadius) return `周囲${settings.assemblyRadius}マスへ集めてください`;
  return '';
}
function deploymentSlots(state,playerId,anchor,units,map,removedIds) {
  const occupied=new Set([...(state.players||[]).flatMap(p=>p.factionState?.units||[]),...(state.enemies||[]),...(state.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])]
    .filter(u=>alive(u)&&world(u)===world(anchor)&&!removedIds.has(u.id)).map(key));
  if(map?.caveEventNpc)occupied.add(key(map.caveEventNpc));
  const result=[],queue=[{x:anchor.x,y:anchor.y,depth:0}],seen=new Set();
  for(let i=0;i<queue.length;i++){
    const tile=queue[i];if(seen.has(key(tile)))continue;seen.add(key(tile));
    if(!map?.grid?.[tile.y]?.[tile.x])continue;
    if(tile.depth<settings.deploymentRadius)for(const next of getHexOffsetNeighbors(tile.x,tile.y)){
      if(Number.isFinite(resolveV39UnitMovementStepCost(map,tile.x,tile.y,next.x,next.y,anchor)))queue.push({...next,depth:tile.depth+1});
    }
    const unit=units[result.length];
    if(unit&&!occupied.has(key(tile))&&canUnitEnterV39Tile(map,tile.x,tile.y,unit)){result.push(tile);occupied.add(key(tile));}
    if(result.length===units.length)return result;
  }
  return null;
}
export function editV39AnimalArmy(state,playerId,{anchorId,memberIds=[],disband=false},map) {
  const fail=reason=>({ok:false,state,reason});
  if(state.activePlayerId!==playerId || state.timeline?.phase!=='player')return fail('自分の操作ターンに編成してください');
  const entries=getV39AnimalArmyEntries(state,playerId),anchor=entries.find(e=>e.unit.id===anchorId);
  const reason=inspectV39AnimalArmyUnit(state,playerId,anchor);if(reason)return fail(reason);
  const original=getV39AnimalArmyMemberUnits(anchor.unit);
  if(disband&&!isV39AnimalArmy(anchor.unit))return fail('解散する軍隊を選んでください');
  const ids=[...memberIds];
  if(!disband&&(new Set(ids).size!==ids.length||!ids.includes(original[0].id)))return fail('代表個体を含め、重複せず選んでください');
  if(!disband&&(ids.length<settings.minimumMembers||ids.length>settings.maximumMembers))return fail(`${settings.minimumMembers}〜${settings.maximumMembers}体を選んでください`);
  const originalById=new Map(original.map(u=>[u.id,u])), selected=[];
  for(const id of disband?[]:ids){
    if(originalById.has(id)){selected.push(originalById.get(id));continue;}
    const entry=entries.find(e=>e.unit.id===id),why=inspectV39AnimalArmyCandidate(state,playerId,anchor,entry||{});
    if(why)return fail(why);
    selected.push(structuredClone(entry.unit));
  }
  if(selected.some(u=>!alive(u)))return fail('戦闘で失われた個体は編成できません');
  if(!disband&&isV39AnimalArmy(anchor.unit)&&ids.length===original.length&&ids.every(id=>originalById.has(id)))return fail('編成を変更してください');
  const removed=new Set([anchorId,...selected.map(u=>u.id)]);
  let restored=original.filter(u=>disband||!ids.includes(u.id));
  const hpSum=selected.reduce((n,u)=>n+Number(u.hp),0),maxSum=selected.reduce((n,u)=>n+Number(u.maxHp),0);
  const rate=maxSum?hpSum/maxSum:0;
  let army=null;
  if(!disband){
    const progress=resolveV39AnimalArmyProgress(selected),count=selected.length;
    army=applyV39DerivedCharacterData({...structuredClone(selected[0]),id:anchorId,name:`${selected[0].race}軍隊`,
      level:progress.level,exp:progress.exp,totalExp:progress.totalExp,
      unitType:'動物軍隊',isMob:true,isNamed:false,squadId:anchor.unit.squadId,
      x:anchor.unit.x,y:anchor.unit.y,position:[anchor.unit.x,anchor.unit.y],worldId:world(anchor.unit),
      combatProfile:{mode:'army',unitTypeLabel:'動物軍隊',memberCount:count,populationCost:0,
        hpMultiplier:1+(count-1)*settings.hpBonusPerMember,attackCount:count,simpleActionOnly:true},
      animalArmy:{version:1,members:selected,initialHpRate:rate,expRemainderIndex:0}});
    for(const name of ['lastCombatTurn','lastStealthAttackTurn','lastStealthBreakTurn'])army[name]=Math.max(...selected.map(u=>Number(u[name])||0));
    army=zeroAp({...army,hp:Math.max(1,Math.floor(army.maxHp*rate)),currentHp:Math.max(1,Math.floor(army.maxHp*rate))});
  }
  const outputs=[...(army?[army]:[]),...restored];
  if(anchor.storage){
    const facility=getV39StorageFacilities(state,playerId).find(v=>v.tileKey===anchor.storage.tileKey&&v.name===anchor.storage.facilityName);
    const remaining=getV39FacilityStoredEntries(state,playerId,facility).filter(e=>!removed.has(e.unit.id)).length;
    if(facility.capacity&&remaining+outputs.length>facility.capacity)return fail('解散・入替後の個体数が施設の格納上限を超えます');
  }
  if(!anchor.storage){
    const slots=deploymentSlots(state,playerId,anchor.unit,outputs,map,removed);
    if(!slots)return fail('周囲に配置できる空きマスがありません');
    outputs.forEach((u,i)=>{outputs[i]=zeroAp({...u,x:slots[i].x,y:slots[i].y,position:[slots[i].x,slots[i].y],worldId:world(anchor.unit)});});
  }else outputs.forEach((u,i)=>{outputs[i]=zeroAp({...u,x:anchor.unit.x,y:anchor.unit.y,position:[anchor.unit.x,anchor.unit.y],worldId:world(anchor.unit)});});
  const f=state.players.find(p=>p.id===playerId).factionState;
  const squads=(f.squads||[]).map(s=>{
    const unitIds=(s.unitIds||[]).filter(id=>!removed.has(id)||army&&id===anchorId&&!anchor.storage);
    return {...s,unitIds,...Object.fromEntries(['leaderId','movementLeaderId'].map(k=>[k,unitIds.includes(s[k])?s[k]:unitIds[0]||'']))};
  });
  let solo=squads.find(s=>s.id==='solo');if(!solo){solo={id:'solo',label:'単独',unitIds:[]};squads.push(solo);}
  if(!anchor.storage)for(const u of outputs)if(!squads.some(s=>s.unitIds.includes(u.id))){solo.unitIds.push(u.id);u.squadId='solo';}
  const combatRuntime={...f.combatRuntime};
  for(const [name,rows] of Object.entries(combatRuntime))if(name.endsWith('ByUnitId'))combatRuntime[name]=Object.fromEntries(Object.entries(rows||{}).filter(([id])=>!removed.has(id)));
  const next={...f,combatRuntime,squads:squads.filter(s=>s.id==='solo'||s.unitIds.length),
    units:[...f.units.filter(u=>!removed.has(u.id)),...(!anchor.storage?outputs:[])],
    facilityStorage:[...(f.facilityStorage||[]).filter(e=>!removed.has(e.unit.id)),...(anchor.storage?outputs.map(unit=>({...anchor.storage,unit,runtimeByKey:{}})):[])],
    selectedUnitId:!anchor.storage?outputs[0].id:f.selectedUnitId};
  return {ok:true,army:army?outputs[0]:null,units:outputs,state:{...state,players:state.players.map(p=>p.id===playerId?{...p,factionState:next}:p)}};
}
