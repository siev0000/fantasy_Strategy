import {getV39FacilityStorageRule} from './v39-facility-storage.js';
import {applyV39DerivedCharacterData} from '../v39/unit/v39-character-derived-rules.js';
import {getHexDistance} from './hex-grid.js';
import {canV39UnitLeaveOrganicCorpse} from './v39-corpse-types.js';
import {addV39SoulApp,resolveV39UnitSoulApp} from './v39-soul-app.js';

const world=u=>u?.worldId||'surface';
const dead=u=>u&&(u.state==='死亡'||Number(u.hp??u.currentHp)<=0);
export function getV39SoulArchives(state,playerId){
  const surface=(state.activeWorldId||'surface')==='surface'?state:state.explorationWorlds?.surface?.spatial;
  return Object.entries(surface?.facilitiesByTile||{}).filter(([tile,names])=>
    surface.territoryOwnerByTile?.[tile]===playerId&&Array.isArray(names)&&names.some(name=>getV39FacilityStorageRule(name)?.type==='soul'))
    .map(([tile])=>{const [x,y]=tile.split(',').map(Number);return {x,y,key:tile};});
}
export function canUseV39StoredSouls(state,playerId,actor){
  return actor&&Number.isInteger(actor.x)&&Number.isInteger(actor.y)
    &&world(actor)==='surface'&&getV39SoulArchives(state,playerId).some(tile=>getHexDistance(actor,tile)<=1);
}
export function inspectV39SoulCollection(state,playerId,target){
  if(!getV39SoulArchives(state,playerId).length)return {ok:false,reason:'自軍の魂の保管庫が必要です'};
  const bodies=[...(state.players||[]).flatMap(p=>p.factionState?.units||[]),...(state.enemies||[]),
    ...(state.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])];
  const turn=state.timeline?.turnNumber||0;
  const corpse=bodies.find(u=>canV39UnitLeaveOrganicCorpse(u)&&dead(u)&&!u.soulCollected&&!u.soulResourceRecoveredPoints&&!u.summon&&!(u.combatProfile?.memberCount>1)
    &&world(u)===(state.activeWorldId||'surface')&&u.x===target.x&&u.y===target.y
    &&(!u.deadExpireTurn||u.deadExpireTurn>turn));
  if(!corpse)return {ok:false,reason:'回収可能な単体の死体がありません（回収済み・召喚体・軍隊は対象外）'};
  // Store only growth/appearance identity; gear, cargo, orders and coordinates stay outside the soul.
  const fields=['race','className','secondClassName','level','prerequisiteClassLevels','strongAnimalClassName',
    'strongAnimalClassLevel','fusionGrowth','promotionGrowthStart','classGrowthStart','undeadGrowthStart','reincarnationGrowthStart','reincarnationInheritedSkillNames','reincarnationSecondClassName',
    'fusionAppearanceClass','image','imageFile','imageIndex','testOnly'];
  const identity=Object.fromEntries(fields.filter(field=>corpse[field]!==undefined).map(field=>[field,structuredClone(corpse[field])]));
  const soul=applyV39DerivedCharacterData({...identity,soulApp:resolveV39UnitSoulApp(corpse,state.gameSettings),id:`soul-${playerId}-${corpse.id}`,name:corpse.name,
    sourceUnitId:corpse.id,soulStored:true,storedAtTurn:turn,state:'死亡',hp:0,currentHp:0,equipment:[]});
  if(!soul.derivedCharacter?.ok)return {ok:false,reason:'死体の種族・クラス情報を取得できません'};
  if((state.players||[]).some(p=>(p.factionState?.soulStorage||[]).some(s=>s.sourceUnitId===corpse.id)))
    return {ok:false,reason:'この魂は既に回収されています'};
  return {ok:true,corpse,soul};
}
export function collectV39Soul(state,playerId,target){
  const check=inspectV39SoulCollection(state,playerId,target);
  if(!check.ok)return {...check,state};
  const mark=u=>u.id===check.corpse.id?{...u,soulCollected:{playerId,turn:state.timeline?.turnNumber||0}}:u;
  const players=state.players.map(p=>({...p,factionState:{...(p.id===playerId?addV39SoulApp(p.factionState,[check.soul.soulApp]):p.factionState),
    units:p.factionState.units.map(mark),
    ...(p.id===playerId?{soulStorage:[...(p.factionState.soulStorage||[]),check.soul]}:{})}}));
  const villages=(state.neutralVillages||[]).map(v=>({...v,defenseUnits:(v.defenseUnits||[]).map(mark)}));
  const byId=new Map(villages.map(v=>[v.id,v]));
  return {...check,state:{...state,players,enemies:(state.enemies||[]).map(mark),neutralVillages:villages,
    settlements:(state.settlements||[]).map(v=>byId.get(v.id)||v)}};
}
