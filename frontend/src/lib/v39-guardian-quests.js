import { getGameDataRows } from "./game-data-registry.js";
import { getHexDistance } from "./hex-grid.js";
import { V39_QUEST_BALANCE as balance } from "./v39-gameplay-balance.js";
import { changeV39QuestResource } from "./v39-neutral-village-rules.js";
import { getSelectedSettlement } from "./settlement-state.js";
import {getV39HegemonyGuards} from './v39-hegemony-land-rules.js';
import { FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS } from "./v39-economy-rules.js";
import {buildV39UnitEntity} from './v39-unit-creation-rules.js';
import {canUnitEnterV39Tile} from './v39-terrain-traversal.js';
import {getV39GuardianLandSettings} from './v39-victory-guardian-candidates.js';

const living=unit=>unit && Number(unit.currentHp??unit.hp)>0 && unit.state!=="死亡";
const nearby=(unit,landmark)=>living(unit) && (!unit.worldId||unit.worldId==="surface")
  && getHexDistance(unit,landmark)<=balance.guardianContactRange;
export function getV39GuardianQuestDefinitions(landmark=null) {
  const ids=landmark?getV39GuardianLandSettings(landmark)?.trialIds:null;
  return getGameDataRows("イベント会話").filter(row=>row.分類==="守護者"&&(!landmark||ids?.includes(row.ID))).flatMap(row=>{
    const goal=row.目標?.[0],setting=goal?.設定;
    const type=({納品:row.目標.length>1?'supplies':'delivery',見張り:"watch",周辺討伐:"hunt",試練討伐:'trial',村発展:'development'})[goal?.タイプ];
    const reward=row.完了効果?.[0];
    if(!type||!Number.isInteger(setting?.数量)||setting.数量<1
      ||row.完了効果?.length!==1||reward?.タイプ!=="守護者友好度変更"
      ||!Number.isFinite(reward.設定?.値)
      ||(type!=='supplies'&&row.目標.length!==1)
      ||(['delivery','supplies'].includes(type)&&row.目標.some(item=>item.タイプ!=='納品'||!Number.isInteger(item.設定?.数量)||item.設定.数量<1||![...FOOD_RESOURCE_KEYS,...MATERIAL_RESOURCE_KEYS].includes(item.設定.対象)))
      ||(!['delivery','supplies'].includes(type)&&(!Number.isInteger(row.対象範囲)||row.対象範囲<1))) return [];
    return [{ID:row.ID,名前:row.名前,説明:row.説明,type,required:setting.数量,
      resourceKey:type==="delivery"?setting.対象:"",range:row.対象範囲,
      ...(type==='supplies'?{supplies:row.目標.map(item=>({resourceKey:item.設定.対象,required:item.設定.数量,stockKind:FOOD_RESOURCE_KEYS.includes(item.設定.対象)?'food':'material'}))}:{}),
      ...(type==='trial'?{summonLevel:setting.Lv}:{}),
      ...(type==='development'?{facilityTarget:setting.完成施設数}:{}),
      stockKind:FOOD_RESOURCE_KEYS.includes(setting.対象)?"food":"material",
      acceptReply:row.選択肢?.find(choice=>choice.番号==="1")?.回答||"",
      completeReply:row.選択肢?.find(choice=>choice.番号==="1-1")?.回答||"",
      relationGain:reward.設定.値}];
  });
}
export function getV39GuardianProgress(state,playerId,key) {
  return state.victoryLandmarksByTile?.[key]?.guardianByPlayerId?.[playerId]||{relation:0,completedEventIds:[]};
}
function update(state,playerId,key,progress) {
  const landmark=state.victoryLandmarksByTile[key];
  return {...state,victoryLandmarksByTile:{...state.victoryLandmarksByTile,
    [key]:{...landmark,guardianByPlayerId:{...landmark.guardianByPlayerId,[playerId]:progress}}}};
}
const facilityCount=village=>new Set((village?.buildings||[]).filter(name=>!getGameDataRows('施設').some(row=>row.施設名===name&&row.分類==='拠点規模'))).size;
function developmentTargets(state,landmark,row) {
  return (state.neutralVillages||[]).filter(village=>!village.abandoned&&Number(village.population)>0
    &&getHexDistance(village,landmark)<=row.range&&facilityCount(village)<row.facilityTarget)
    .sort((a,b)=>getHexDistance(a,landmark)-getHexDistance(b,landmark)||String(a.id).localeCompare(String(b.id)))
    .slice(0,row.required).map(village=>({id:village.id,name:village.name,initialFacilities:facilityCount(village)}));
}
export function inspectV39GuardianQuest(state,playerId,key) {
  const quest=getV39GuardianProgress(state,playerId,key).quest;
  if(!quest||quest.completed)return {ready:false,description:'受注中の試練はありません'};
  const settlement=getSelectedSettlement(state.players?.find(player=>player.id===playerId)?.factionState);
  if(quest.type==='supplies') {
    const supplies=quest.supplies.map(item=>({...item,available:Number(settlement?.[item.stockKind==='food'?'foodStockByType':'materialStockByType']?.[item.resourceKey])||0}));
    return {ready:supplies.every(item=>item.available>=item.required),supplies,description:supplies.map(item=>`${item.resourceKey} ${item.available}/${item.required}`).join(' / ')};
  }
  if(quest.type==='development') {
    const villages=(quest.targetVillages||[]).map(target=>{
      const village=state.neutralVillages?.find(row=>row.id===target.id),count=facilityCount(village);
      return {...target,count,ready:!!village&&!village.abandoned&&Number(village.population)>0&&count>=quest.facilityTarget&&count>target.initialFacilities};
    });
    return {ready:villages.length===quest.required&&villages.every(village=>village.ready),villages,
      description: villages.map(village=>`${village.name}: 施設${village.count}/${quest.facilityTarget}${village.ready?' 達成':''}`).join(' / ')};
  }
  if(quest.type==='trial') {
    const defeated=new Set(quest.defeatedEnemyIds||[]);
    const count=(quest.targetEnemyIds||[]).filter(id=>defeated.has(id)||state.enemies?.some(enemy=>enemy.id===id&&!living(enemy))).length;
    return {ready:count>=quest.required,description:`試練の召喚体 Lv${quest.summonLevel}: ${count}/${quest.required}体討伐`};
  }
  return {ready:false,description:quest.type==='delivery'?`${quest.resourceKey} ${quest.required}`:quest.type==='watch'?`${quest.progress}/${quest.required}ターン`:
    `残り ${(quest.targetEnemyIds||[]).filter(id=>state.enemies?.some(enemy=>enemy.id===id&&living(enemy))).length}体`};
}
export function getV39GuardianTrialStatus(state,playerId,key) {
  const progress=getV39GuardianProgress(state,playerId,key),definitions=getV39GuardianQuestDefinitions(state.victoryLandmarksByTile?.[key]);
  const completed=definitions.filter(row=>progress.completedEventIds?.includes(row.ID)).length;
  return {completed,required:definitions.length,ready:definitions.length>=3&&completed===definitions.length};
}
function spawnTrial(state,playerId,key,row,map) {
  if(!map?.grid)return {ok:false,state,reason:'試練を配置する地上マップがありません'};
  const landmark=state.victoryLandmarksByTile[key],guards=getV39HegemonyGuards(state,landmark);
  const source=guards.find(unit=>unit.strongMinion===true)||guards[0];
  const className=source?.guardianSpeciesName?source.race:source?.className||source?.race;
  const unit=buildV39UnitEntity({id:'trial-preview',name:'試練の召喚体',race:source?.race,className,level:row.summonLevel,equipment:source?.equipment});
  if(!unit.derivedCharacter?.ok)return {ok:false,state,reason:'守護者の試練用クラスを解決できません'};
  const occupied=new Set([...(state.players||[]).flatMap(player=>player.factionState?.units||[]),...(state.enemies||[]),
    ...(state.neutralVillages||[]).flatMap(village=>[village,...(village.defenseUnits||[])])].filter(entity=>entity.kind==='neutral-village'||living(entity)).map(entity=>`${entity.x},${entity.y}`));
  occupied.add(key);
  const positions=[];
  for(let y=Math.max(0,landmark.y-row.range);y<=Math.min(map.h-1,landmark.y+row.range);y++)for(let x=Math.max(0,landmark.x-row.range);x<=Math.min(map.w-1,landmark.x+row.range);x++) {
    const distance=getHexDistance({x,y},landmark);
    if(distance>0&&distance<=row.range&&!occupied.has(`${x},${y}`)&&canUnitEnterV39Tile(map,x,y,unit))positions.push({x,y,distance});
  }
  positions.sort((a,b)=>b.distance-a.distance||a.y-b.y||a.x-b.x);
  if(positions.length<row.required)return {ok:false,state,reason:'召喚体を置く空きマスが足りません。覇権地の周囲を空けてください'};
  const actor=state.players.find(player=>player.id===playerId)?.factionState.units.find(entity=>nearby(entity,landmark));
  const enemies=positions.slice(0,row.required).map((position,index)=>({...unit,...position,
    id:`guardian-trial:${landmark.id||key}:${playerId}:${row.ID}:${index}`,name:`${source.name||source.race}の試練`,
    worldId:'surface',aggressive:true,neverFlee:true,territoryCenterX:landmark.x,territoryCenterY:landmark.y,territoryRadius:row.range,
    aggroTargetUnitId:actor?.id,guardianTrial:{playerId,key,eventId:row.ID},summon:{kind:'guardian-trial'},corpseCargo:null}));
  return {ok:true,state:{...state,enemies:[...(state.enemies||[]),...enemies]},targetEnemyIds:enemies.map(enemy=>enemy.id)};
}
// Keep proof before the ordinary death lifecycle removes a summoned body.
export function recordV39GuardianTrialDefeats(state) {
  let working=state;
  for(const enemy of state.enemies||[]) {
    const trial=enemy.guardianTrial;if(!trial||living(enemy))continue;
    const progress=getV39GuardianProgress(working,trial.playerId,trial.key),quest=progress.quest;
    if(!quest||quest.completed||quest.ID!==trial.eventId||!quest.targetEnemyIds?.includes(enemy.id)||quest.defeatedEnemyIds?.includes(enemy.id))continue;
    working=update(working,trial.playerId,trial.key,{...progress,quest:{...quest,defeatedEnemyIds:[...(quest.defeatedEnemyIds||[]),enemy.id]}});
  }
  return working;
}
function canContact(state,playerId,key) {
  const landmark=state.victoryLandmarksByTile?.[key],player=state.players?.find(row=>row.id===playerId);
  if(state.activeWorldId && state.activeWorldId!=="surface") return "地上の守護地で交渉してください";
  const discovered=player?.factionState?.exploration?.discoveredFeaturesByTile?.[key];
  if(!landmark||!discovered) return "勝利対象土地を調査して発見してください";
  if(!player.factionState.units?.some(unit=>nearby(unit,landmark))) return "守護地の近くに生存ユニットが必要です";
  if(landmark.peacefulOwnerPlayerId) return "既に守護者が交代しています";
  const guards=getV39HegemonyGuards(state,landmark);
  if(!guards.length) return "守護者は既に倒されています。領土として取得してください";
  if(guards.some(guard=>player.factionState.units.some(unit=>unit.id===guard.aggroTargetUnitId))) return "守護者との交戦中は交渉できません";
  return "";
}
export function listV39GuardianQuests(state,playerId,key) {
  if(canContact(state,playerId,key)) return [];
  const progress=getV39GuardianProgress(state,playerId,key),landmark=state.victoryLandmarksByTile[key];
  return getV39GuardianQuestDefinitions(landmark).filter(row=>!progress.completedEventIds?.includes(row.ID)).map(row=>{
    if(row.type!=="hunt") return row;
    const targetEnemyIds=(state.enemies||[]).filter(enemy=>living(enemy)&&!enemy.victoryGuard && enemy.aggressive===true
      && (!enemy.worldId||enemy.worldId==="surface") && getHexDistance(enemy,landmark)<=row.range)
      .sort((a,b)=>getHexDistance(a,landmark)-getHexDistance(b,landmark)||String(a.id).localeCompare(String(b.id)))
      .slice(0,row.required).map(enemy=>enemy.id);
    return {...row,targetEnemyIds};
  }).filter(row=>row.type!=="hunt"||row.targetEnemyIds.length);
}
export function acceptV39GuardianQuest(state,playerId,key,eventId,map=globalThis.window?.__v39FieldRuntime?.mapData) {
  const reason=canContact(state,playerId,key);
  if(reason) return {ok:false,state,reason};
  const progress=getV39GuardianProgress(state,playerId,key);
  if(progress.quest && !progress.quest.completed) return {ok:false,state,reason:"既に守護者の依頼を受注しています"};
  const row=listV39GuardianQuests(state,playerId,key).find(item=>item.ID===eventId);
  if(!row) return {ok:false,state,reason:"その依頼は受注できません"};
  const turn=state.timeline?.turnNumber||1;
  const quest={...row,createdTurn:turn,lastProgressTurn:turn,progress:0,completed:false,
    required:row.type==="hunt"?row.targetEnemyIds.length:row.required};
  let working=state;
  if(row.type==='development') {
    quest.targetVillages=developmentTargets(state,state.victoryLandmarksByTile[key],row);
    if(quest.targetVillages.length<row.required)return {ok:false,state,reason:`周囲${row.range}マスに施設${row.facilityTarget}未満の生存する村が${row.required}つ必要です`};
  }
  if(row.type==='trial') {
    const result=spawnTrial(state,playerId,key,row,map);if(!result.ok)return result;
    working=result.state;quest.targetEnemyIds=result.targetEnemyIds;quest.defeatedEnemyIds=[];
  }
  return {ok:true,state:update(working,playerId,key,{...progress,quest}),message:`受注: ${row.名前}${row.acceptReply?` / ${row.acceptReply}`:""}`};
}
export function completeV39GuardianQuest(state,playerId,key) {
  const reason=canContact(state,playerId,key);
  if(reason) return {ok:false,state,reason};
  const progress=getV39GuardianProgress(state,playerId,key),quest=progress.quest;
  if(!quest||quest.completed) return {ok:false,state,reason:"受注中の依頼がありません"};
  if(!["delivery","watch","hunt","supplies","trial","development"].includes(quest.type)) return {ok:false,state,reason:"未対応の依頼形式です"};
  if(['supplies','trial','development'].includes(quest.type)) {
    const check=inspectV39GuardianQuest(state,playerId,key);
    if(!check.ready)return {ok:false,state,reason:check.description};
  }
  if(quest.type==="watch"&&quest.progress<quest.required) return {ok:false,state,reason:`見張り ${quest.progress}/${quest.required}ターン`};
  if(quest.type==="hunt"&&state.enemies?.some(enemy=>quest.targetEnemyIds.includes(enemy.id)&&living(enemy))) return {ok:false,state,reason:"討伐対象が残っています"};
  let working=state;
  if(quest.type==='supplies')for(const item of quest.supplies) {
    const payment=changeV39QuestResource(working,playerId,item.stockKind,-item.required,item.resourceKey);
    if(!payment.ok)return {ok:false,state,reason:payment.reason||'納品する拠点がありません'};
    working=payment.state;
  }
  if(quest.type==="delivery") {
    const payment=changeV39QuestResource(state,playerId,quest.stockKind,-quest.required,quest.resourceKey);
    if(!payment.ok) return {...payment,reason:payment.reason||"納品する拠点がありません"};
    working=payment.state;
  }
  const relationGain=quest.relationGain??balance.guardianRelationGain;
  return {ok:true,state:update(working,playerId,key,{...progress,
    relation:Math.max(-100,Math.min(100,progress.relation+relationGain)),
    completedEventIds:[...(progress.completedEventIds||[]),quest.ID],quest:{...quest,completed:true}}),
    message:`依頼完了 / 守護者の友好度 ${relationGain>=0?"+":""}${relationGain}${quest.completeReply?` / ${quest.completeReply}`:""}`};
}
export function advanceV39GuardianQuests(state,turn) {
  let working=state;
  for(const [key,landmark] of Object.entries(state.victoryLandmarksByTile||{})) for(const player of state.players||[]) {
    const progress=getV39GuardianProgress(working,player.id,key),quest=progress.quest;
    if(!quest||quest.completed||quest.type!=="watch"||quest.lastProgressTurn>=turn) continue;
    const present=player.factionState?.units?.some(unit=>living(unit)&&(!unit.worldId||unit.worldId==="surface")
      && getHexDistance(unit,landmark)<=(quest.range??balance.guardianContactRange));
    working=update(working,player.id,key,{...progress,quest:{...quest,lastProgressTurn:turn,
      progress:present?Math.min(quest.required,quest.progress+1):0}});
  }
  return working;
}
export function transferV39GuardianLand(state,playerId,key,{conquest=false}={}) {
  const site=state.victoryLandmarksByTile?.[key],player=state.players.find(player=>player.id===playerId);
  if(site?.peacefulOwnerPlayerId)return {ok:false,state,reason:'既に取得された覇権地です'};
  const world=state.explorationWorlds?.[site?.hegemonyWorldId];
  const reason=conquest?(!site||state.activeWorldId!=='surface'||!player?.factionState.exploration?.discoveredFeaturesByTile?.[key]
    ||!player.factionState.units.some(unit=>nearby(unit,site))?'発見済みの覇権地へ生存ユニットを向かわせてください':
    !world?.map?.guardianInitialized||getV39HegemonyGuards(state,site).length?'奥地の守護者と配下を倒してください':''):canContact(state,playerId,key);
  if(reason) return {ok:false,state,reason};
  if(!conquest&&!getV39GuardianTrialStatus(state,playerId,key).ready) return {ok:false,state,reason:'守護者の3試練すべての達成が必要です'};
  const landmark=state.victoryLandmarksByTile[key],keys=landmark.occupiedTileKeys?.length?landmark.occupiedTileKeys:[key];
  const settlement=getSelectedSettlement(state.players?.find(player=>player.id===playerId)?.factionState);
  if(!settlement?.placed) return {ok:false,state,reason:"領土を所属させる拠点が必要です"};
  if(keys.some(tile=>state.territoryOwnerByTile?.[tile]&&state.territoryOwnerByTile[tile]!==playerId)) return {ok:false,state,reason:"他勢力の領土を含むため譲渡できません"};
  const owner={...state.territoryOwnerByTile},territory={...state.territoryStateByTile},danger={...state.dangerPercentByTile};
  for(const tile of keys) {owner[tile]=playerId;territory[tile]={...territory[tile],status:"領土",settlementId:settlement.id||settlement.settlementId};danger[tile]=0;}
  const guardIds=new Set((state.enemies||[]).filter(enemy=>enemy.victoryLandmarkKey===key||enemy.guardianTrial?.key===key).map(enemy=>enemy.id));
  const worlds={...state.explorationWorlds};
  if(landmark.hegemonyWorldId&&worlds[landmark.hegemonyWorldId]){
    const interior=worlds[landmark.hegemonyWorldId],ids=new Set(interior.spatial.enemies.filter(enemy=>enemy.victoryLandmarkKey===key).map(enemy=>enemy.id));
    worlds[landmark.hegemonyWorldId]={...interior,map:{...interior.map,hegemonyOwnerPlayerId:playerId},spatial:{...interior.spatial,
      enemies:interior.spatial.enemies.filter(enemy=>!ids.has(enemy.id)),enemyNests:interior.spatial.enemyNests.filter(nest=>nest.victoryLandmarkKey!==key),
      enemySquads:interior.spatial.enemySquads.filter(squad=>!squad.unitIds?.some(id=>ids.has(id)))}};
  }
  return {ok:true,state:{...state,territoryOwnerByTile:owner,territoryStateByTile:territory,dangerPercentByTile:danger,
    explorationWorlds:worlds,
    victoryLandmarksByTile:{...state.victoryLandmarksByTile,[key]:{...landmark,peacefulOwnerPlayerId:playerId}},
    enemies:(state.enemies||[]).filter(enemy=>!guardIds.has(enemy.id)),
    enemyNests:(state.enemyNests||[]).filter(nest=>nest.victoryLandmarkKey!==key),
    enemySquads:(state.enemySquads||[]).filter(squad=>!squad.unitIds?.some(id=>guardIds.has(id)))},
    message:conquest?`${landmark.name}を取得しました。これから5ターンの確保を開始します`:`${landmark.name}の守護者を引き継ぎました`};
}
