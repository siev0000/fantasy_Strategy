import {getGameDataRows} from './game-data-registry.js';
import {calculateV39MonsterFusionGrowth,collectV39FusionClassLevels} from './v39-monster-fusion-growth.js';
import {applyV39DerivedCharacterData} from '../v39/unit/v39-character-derived-rules.js';
import {getHexDistance,getHexOffsetNeighbors} from './hex-grid.js';
import {resolveActionSkillRows} from './v39-combat-engine.js';
import {resolveV39SkillCooldownTurns} from './v39-turn-timing.js';
import defaults from '../../../config/v39-fusion-defaults.json';
import {isV39TestSkillModeEnabled} from './v39-test-skill-rules.js';
import {resolveV39UnitTotalExpForLevel,resolveV39UnitRaceCategory} from './v39-unit-experience.js';
import testFixture from '../../../config/v39-fusion-test.json';
import {canUseV39StoredSouls} from './v39-soul-storage.js';
import {canUnitEnterV39Tile} from './v39-terrain-traversal.js';
import {getV39StorageFacilities} from './v39-facility-storage.js';
import {isV39InvalidDataToken} from './v39-class-rules.js';

const split=value=>String(value||'').split(/[,、\n]/).map(s=>s.trim()).filter(Boolean);
const alive=u=>Number(u?.hp??u?.currentHp)>0&&!['死亡','死体'].includes(u?.state);
const world=u=>u?.worldId||'surface';
const hasCargo=value=>value&&typeof value==='object'&&Object.values(value).some(v=>typeof v==='number'?v>0:Array.isArray(v)?v.length>0:typeof v==='object'?hasCargo(v):Boolean(v));
export function getV39FusionMaterials(faction){return [...(faction?.units||[]),...(faction?.soulStorage||[]),...(faction?.facilityStorage||[]).map(entry=>({...entry.unit,facilityStored:{tileKey:entry.tileKey,name:entry.facilityName,worldId:entry.worldId}}))];}
export function getV39FusionSkills(unit){
  const rows=resolveActionSkillRows(unit).filter(row=>split(row.効果).includes('合体'));
  if(unit?.fusionTestFixture&&isV39TestSkillModeEnabled())rows.push({名前:'テスト合体',行動:'A',効果:'合体',AP消費:20});
  return rows;
}
export function getV39FusionRecipes(state){
  const testing=isV39TestSkillModeEnabled()&&state.players?.some(p=>p.factionState?.units?.some(u=>u.fusionTestFixture));
  const rows=getGameDataRows('モンスター合成').filter(row=>row.状態==='確定'||testing&&['候補','未定'].includes(row.状態));
  if(testing)rows.push(defaults.testRecipe);
  return rows.map((row,index)=>({...row,id:`fusion-${index}`,requirements:split(row.素材).map(item=>{
    const match=/^(.+)_([1-9]\d*)$/.exec(item);return match?{name:match[1],count:Number(match[2])}:null;
  }),bonuses:split(row.ボーナスクラス),acquiredSkills:[...new Set(split(row.獲得スキル).filter(name=>!isV39InvalidDataToken(name)))]}));
}
export function resolveV39FusionMaterialRadius(actor){
  return actor?.fusionTestFixture&&isV39TestSkillModeEnabled()?testFixture.materialRadius:defaults.materialRadius;
}
export function isV39FusionTerritoryScope(state,playerId,actor,settings=defaults){
  return settings.territoryWideMaterials===true&&world(actor)==='surface'
    &&Number.isInteger(actor?.x)&&Number.isInteger(actor?.y)
    &&state.territoryOwnerByTile?.[`${actor.x},${actor.y}`]===playerId;
}
export function inspectV39FusionAccess(state,playerId,actorId,mode='skill',skillName=''){
  const player=state.players?.find(p=>p.id===playerId),faction=player?.factionState,actor=faction?.units?.find(u=>u.id===actorId),reasons=[];
  const runtime=faction?.combatRuntime||{},turn=state.timeline?.turnNumber;
  const skill=getV39FusionSkills(actor).find(row=>!skillName||row.名前===skillName);
  const cost=mode==='skill'?Math.max(0,Number(skill?.AP消費)||0):0;
  if(playerId!==state.activePlayerId||state.timeline?.phase!=='player'||!alive(actor)||world(actor)!==(state.activeWorldId||'surface'))reasons.push('操作中の生存ユニットが必要');
  if(actor?.waitTurnNumber===turn||runtime.pendingActionsByUnitId?.[actorId])reasons.push('待機・行動予約中です');
  if(mode==='skill'){
    if(!skill)reasons.push('効果:合体のスキルが必要');
    if(Number(skill?.HP消費)>0)reasons.push('HP消費付き合体は未対応');
    if(Number(runtime.cooldownsByUnitId?.[actorId]?.[skill?.名前])>turn)reasons.push('使用済みまたはCT中');
    if(Number(actor?.ap??actor?.currentAp)<cost)reasons.push('AP不足');
  }else if(mode==='facility'){
    const available=actor&&world(actor)==='surface'&&[actor,...getHexOffsetNeighbors(actor.x,actor.y)].some(({x,y})=>{
      const key=`${x},${y}`,names=state.facilitiesByTile?.[key];
      return state.territoryOwnerByTile?.[key]===playerId&&Array.isArray(names)&&names.some(name=>defaults.facilityNames.includes(name));
    });
    if(!available)reasons.push('自領の魔術工房・魔獣研究所・魂の保管庫の隣接マスに移動してください');
  }else reasons.push('合体の実行方法が不正');
  return {actor,player,faction,skill,cost,reasons};
}
export function inspectV39FusionMaterial(state,playerId,actor,unit,settings=defaults){
  const faction=state.players?.find(p=>p.id===playerId)?.factionState,reasons=[];
  if(unit?.facilityStored){
    const entry=faction?.facilityStorage?.find(e=>e.unit?.id===unit.id);
    const facility=getV39StorageFacilities(state,playerId).find(f=>f.tileKey===entry?.tileKey&&f.name===entry?.facilityName&&f.worldId===entry?.worldId);
    if(!entry||!facility||!actor||world(actor)!==facility.worldId||getHexDistance(actor,facility)>1)return ['格納施設上か隣接マスで合成してください'];
    const projected={...entry.unit,x:facility.x,y:facility.y,worldId:facility.worldId};
    return inspectV39FusionMaterial({...state,players:state.players.map(p=>p.id===playerId?{...p,factionState:{...faction,units:[...faction.units,projected]}}:p)},playerId,actor,projected,settings);
  }
  if(unit?.soulStored){
    if(!faction?.soulStorage?.some(s=>s.id===unit.id))return ['自軍の保管された魂が必要'];
    if(!canUseV39StoredSouls(state,playerId,actor))reasons.push('魂の保管庫かその隣接マスで合成してください');
    if(!collectV39FusionClassLevels(unit))reasons.push('魂の種族・クラス情報が不正');
    return reasons;
  }
  if(!unit||!faction?.units?.some(u=>u.id===unit.id)||!alive(unit))return ['自軍の生存ユニットが必要'];
  if(unit.soulCollected||unit.id===actor?.id||unit.isSovereign||unit.isNamed||unit.isMob||unit.summon||unit.combatProfile?.memberCount>1)reasons.push('素材は実行者以外の無名・単体ユニットのみ');
  const radius=resolveV39FusionMaterialRadius(actor);
  const territoryScope=isV39FusionTerritoryScope(state,playerId,actor,settings);
  if(world(unit)!==world(actor)||!Number.isInteger(unit.x)||!Number.isInteger(unit.y)
    ||(territoryScope?state.territoryOwnerByTile?.[`${unit.x},${unit.y}`]!==playerId:getHexDistance(actor,unit)>radius))
    reasons.push(territoryScope?'同じワールドの自領内にいる素材が必要':`同じワールドの周囲${radius}マス以内が必要`);
  const squads=faction.squads||[];
  if(unit.equipment?.length||hasCargo(unit.equipmentInventory)||hasCargo(unit.cargo)||hasCargo(unit.expeditionCargoByType)||hasCargo(unit.toolStockByType)||squads.some(s=>s.unitIds?.includes(unit.id)&&(hasCargo(s.cargo)||hasCargo(s.cargoByUnitId?.[unit.id]))))reasons.push('装備・荷物を先に預けてください');
  if(unit.caveDuty||unit.autoTransport||unit.tradeAssignment||unit.transportAssignment||unit.instructorAssignment||faction.combatRuntime?.pendingActionsByUnitId?.[unit.id])reasons.push('自動任務・行動予約を解除してください');
  if(['recruitInstructorByTile','recruitInstructorTransfers'].some(field=>Object.values(faction[field]||{}).some(row=>row.unitId===unit.id)))reasons.push('教官の指定を解除してください');
  if((faction.combatRuntime?.activeEffectsByUnitId?.[unit.id]||[]).length)reasons.push('効果時間中の素材は使用できません');
  if(faction.units.some(u=>u.summon?.casterId===unit.id))reasons.push('召喚中のユニットは素材にできません');
  if(!collectV39FusionClassLevels(unit))reasons.push('種族・クラス情報が不正');
  return reasons;
}
export function inspectV39MonsterFusion(state,{playerId,actorId,recipeId,materialIds=[],mode='skill',skillName=''}={}){
  const access=inspectV39FusionAccess(state,playerId,actorId,mode,skillName),reasons=[...access.reasons];
  const recipe=getV39FusionRecipes(state).find(row=>row.id===recipeId),classes=new Set(getGameDataRows('クラス').map(r=>r.名前));
  if(!recipe)return {...access,available:false,reasons:[...reasons,'レシピがありません']};
  if(recipe.requirements.some(r=>!r)||!recipe.requirements.length)reasons.push('素材書式が不正');
  const required=recipe.requirements.filter(Boolean),slots=required.flatMap(r=>Array.from({length:Math.min(13,r.count)},()=>r.name));
  if(slots.length>12||slots.length<2)reasons.push('対応する素材数は2〜12体です');
  for(const name of slots)if(!classes.has(name))reasons.push(`素材クラス未登録: ${name}`);
  const acquiredClasses=recipe.bonuses.filter(name=>classes.has(name));
  const skippedClasses=recipe.bonuses.filter(name=>!classes.has(name));
  const warnings=skippedClasses.length?[`未登録のため付与しません: ${skippedClasses.join('、')}`]:[];
  const materials=Array.from(materialIds,id=>getV39FusionMaterials(access.faction).find(u=>u.id===id));
  const acquiredSkillNames=[...new Set([
    ...recipe.acquiredSkills,
    ...materials.flatMap(unit=>Array.isArray(unit?.fusionGrowth?.acquiredSkillNames)?unit.fusionGrowth.acquiredSkillNames:[])
  ].filter(name=>typeof name==='string'&&!isV39InvalidDataToken(name)).map(name=>name.trim()))];
  const knownSkills=new Set(getGameDataRows('スキル一覧').map(row=>row.名前));
  const unresolvedSkills=acquiredSkillNames.filter(name=>!knownSkills.has(name));
  if(unresolvedSkills.length)warnings.push(`未登録スキル（名前のみ保持・効果なし）: ${unresolvedSkills.join('、')}`);
  if(materialIds.length!==slots.length||materials.some(u=>!u))reasons.push('素材をすべて選択してください');
  if(new Set(materialIds).size!==materialIds.length)reasons.push('同じ素材を重複使用できません');
  materials.forEach((unit,index)=>{
    reasons.push(...inspectV39FusionMaterial(state,playerId,access.actor,unit));
    if(unit&&!(Number(collectV39FusionClassLevels(unit)?.[slots[index]])>0))reasons.push(`素材${index+1}に${slots[index]}が必要`);
  });
  let origin=materials.find(unit=>unit&&!unit.soulStored&&!unit.facilityStored);
  if(materials.length&&materials.every(unit=>unit?.soulStored||unit?.facilityStored)&&access.actor){
    const map=typeof window!=='undefined'?window.__v39FieldRuntime?.mapData:null;
    const occupied=new Set([...state.players.flatMap(p=>p.factionState.units),...(state.enemies||[]),
      ...(state.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])].filter(u=>alive(u)&&world(u)===world(access.actor)).map(u=>`${u.x},${u.y}`));
    origin=getHexOffsetNeighbors(access.actor.x,access.actor.y).find(tile=>
      !occupied.has(`${tile.x},${tile.y}`)&&map?.grid?.[tile.y]?.[tile.x]
      &&canUnitEnterV39Tile(map,tile.x,tile.y,materials[0]));
    if(!origin)reasons.push('合体結果を配置できる隣接マスがありません');
  }
  if(origin&&[...state.players.flatMap(p=>p.factionState.units),...(state.enemies||[])].some(u=>!materialIds.includes(u.id)&&alive(u)&&world(u)===world(origin)&&u.x===origin.x&&u.y===origin.y))reasons.push('合体後の配置マスが他のユニットと重なっています');
  let growth=null,preview=null;
  if(!reasons.length){
    growth=calculateV39MonsterFusionGrowth({materials,requiredClasses:slots,acquiredClasses});
    if(!growth.ok)reasons.push(growth.reason);
    else {
      for(const name of Object.keys(growth.levelsByClass))if(!classes.has(name))reasons.push(`継承クラス未登録: ${name}`);
      const race=materials[0].race,className=acquiredClasses[0]||materials[0].className;
      const levels=growth.levelsByClass;
      preview=applyV39DerivedCharacterData({id:'fusion-preview',name:recipe.合成結果,race,className,level:growth.level,
        isNamed:false,isMob:false,unitType:'通常ユニット',state:'生存',equipment:[],squadId:'solo',worldId:world(access.actor),
        x:origin.x,y:origin.y,position:[origin.x,origin.y],
        fusionAppearanceClass:Object.keys(levels).find(name=>['デヴィル','エンジェル'].includes(name))||'',
        fusionGrowth:{levelsByClass:{...levels},baseLevel:Math.floor(growth.baseValue),baseExp:growth.baseProgress.exp,baseNeed:growth.baseProgress.need,
          classExp:Object.fromEntries(Object.entries(growth.acquiredProgress).map(([name,p])=>[name,p.exp])),
          recipeName:recipe.合成結果,sourceIds:[...materialIds],skippedClasses:[...skippedClasses],acquiredSkillNames},
        prerequisiteClassLevels:Object.fromEntries(Object.entries(levels).filter(([name])=>name!==race&&name!==className))});
      const exp=growth.baseProgress.exp,totalExp=resolveV39UnitTotalExpForLevel(growth.level,resolveV39UnitRaceCategory(preview))+exp;
      preview={...preview,exp,totalExp,status:{...preview.status,exp,totalExp},hp:preview.maxHp,currentHp:preview.maxHp,ap:0,currentAp:0,maxAp:100};
      if(!preview.derivedCharacter?.ok)reasons.push('結果の能力を生成できません');
    }
  }
  return {...access,recipe,slots,materials,growth,preview,warnings,reasons:[...new Set(reasons)],available:!reasons.length};
}
export function executeV39MonsterFusion(state,request){
  const check=inspectV39MonsterFusion(state,request);
  if(!check.available)return {ok:false,reason:check.reasons.join(' / '),state};
  const ids=new Set(request.materialIds),faction=check.faction,serial=(Number(faction.fusionSerial)||0)+1;
  const allIds=new Set([...state.players.flatMap(p=>p.factionState.units),...(state.enemies||[])].map(u=>u.id));
  let id=`fusion-${request.playerId}-${serial}`;while(allIds.has(id))id+='-new';
  const created={...check.preview,id};
  const runtime={...faction.combatRuntime};
  for(const [key,value] of Object.entries(runtime))if(key.endsWith('ByUnitId'))runtime[key]=Object.fromEntries(Object.entries(value||{}).filter(([key])=>!ids.has(key)));
  if(request.mode!=='facility')runtime.cooldownsByUnitId={...runtime.cooldownsByUnitId,[request.actorId]:{...runtime.cooldownsByUnitId?.[request.actorId],[check.skill.名前]:state.timeline.turnNumber+resolveV39SkillCooldownTurns(check.skill)}};
  const squads=(faction.squads||[]).map(s=>{
    const unitIds=(s.unitIds||[]).filter(id=>!ids.has(id));if(s.id==='solo')unitIds.push(id);
    const next={...s,unitIds};
    for(const field of ['leaderId','movementLeaderId'])if(ids.has(next[field]))next[field]=unitIds[0]||'';
    if(s.cargoByUnitId)next.cargoByUnitId=Object.fromEntries(Object.entries(s.cargoByUnitId).filter(([id])=>!ids.has(id)));
    return next;
  });
  if(!squads.some(s=>s.id==='solo'))squads.push({id:'solo',label:'単独',unitIds:[id]});
  const units=faction.units.filter(u=>!ids.has(u.id)).map(u=>u.id===request.actorId?{...u,ap:Number(u.ap??u.currentAp)-check.cost,currentAp:Number(u.ap??u.currentAp)-check.cost}:u);
  const next={...faction,units:[...units,created],soulStorage:(faction.soulStorage||[]).filter(s=>!ids.has(s.id)),facilityStorage:(faction.facilityStorage||[]).filter(e=>!ids.has(e.unit.id)),squads,combatRuntime:runtime,fusionSerial:serial,selectedUnitId:id};
  return {ok:true,created,state:{...state,players:state.players.map(p=>p.id===request.playerId?{...p,factionState:next}:p)}};
}
