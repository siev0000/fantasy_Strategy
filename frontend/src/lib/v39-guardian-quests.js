import { getGameDataRows } from "./game-data-registry.js";
import { getHexDistance } from "./hex-grid.js";
import { V39_QUEST_BALANCE as balance } from "./v39-gameplay-balance.js";
import { changeV39QuestResource } from "./v39-neutral-village-rules.js";
import { getSelectedSettlement } from "./settlement-state.js";
import {getV39HegemonyGuards} from './v39-hegemony-land-rules.js';
import { FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS } from "./v39-economy-rules.js";

const living=unit=>unit && Number(unit.currentHp??unit.hp)>0 && unit.state!=="死亡";
const nearby=(unit,landmark)=>living(unit) && (!unit.worldId||unit.worldId==="surface")
  && getHexDistance(unit,landmark)<=balance.guardianContactRange;
export function getV39GuardianQuestDefinitions() {
  return getGameDataRows("イベント会話").filter(row=>row.分類==="守護者").flatMap(row=>{
    const goal=row.目標?.[0],setting=goal?.設定;
    const type=({納品:"delivery",見張り:"watch",周辺討伐:"hunt"})[goal?.タイプ];
    const reward=row.完了効果?.[0];
    if(!type||row.目標.length!==1||!Number.isInteger(setting?.数量)||setting.数量<1
      ||row.完了効果?.length!==1||reward?.タイプ!=="守護者友好度変更"
      ||!Number.isFinite(reward.設定?.値)
      ||(type==="delivery"&&![...FOOD_RESOURCE_KEYS,...MATERIAL_RESOURCE_KEYS].includes(setting.対象))
      ||(type!=="delivery"&&(!Number.isInteger(row.対象範囲)||row.対象範囲<1))) return [];
    return [{ID:row.ID,名前:row.名前,説明:row.説明,type,required:setting.数量,
      resourceKey:type==="delivery"?setting.対象:"",range:row.対象範囲,
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
  return getV39GuardianQuestDefinitions().filter(row=>!progress.completedEventIds?.includes(row.ID)).map(row=>{
    if(row.type!=="hunt") return row;
    const targetEnemyIds=(state.enemies||[]).filter(enemy=>living(enemy)&&!enemy.victoryGuard && enemy.aggressive===true
      && (!enemy.worldId||enemy.worldId==="surface") && getHexDistance(enemy,landmark)<=row.range)
      .sort((a,b)=>getHexDistance(a,landmark)-getHexDistance(b,landmark)||String(a.id).localeCompare(String(b.id)))
      .slice(0,row.required).map(enemy=>enemy.id);
    return {...row,targetEnemyIds};
  }).filter(row=>row.type!=="hunt"||row.targetEnemyIds.length);
}
export function acceptV39GuardianQuest(state,playerId,key,eventId) {
  const reason=canContact(state,playerId,key);
  if(reason) return {ok:false,state,reason};
  const progress=getV39GuardianProgress(state,playerId,key);
  if(progress.quest && !progress.quest.completed) return {ok:false,state,reason:"既に守護者の依頼を受注しています"};
  const row=listV39GuardianQuests(state,playerId,key).find(item=>item.ID===eventId);
  if(!row) return {ok:false,state,reason:"その依頼は受注できません"};
  const turn=state.timeline?.turnNumber||1;
  const quest={...row,createdTurn:turn,lastProgressTurn:turn,progress:0,completed:false,
    required:row.type==="hunt"?row.targetEnemyIds.length:row.required};
  return {ok:true,state:update(state,playerId,key,{...progress,quest}),message:`受注: ${row.名前}${row.acceptReply?` / ${row.acceptReply}`:""}`};
}
export function completeV39GuardianQuest(state,playerId,key) {
  const reason=canContact(state,playerId,key);
  if(reason) return {ok:false,state,reason};
  const progress=getV39GuardianProgress(state,playerId,key),quest=progress.quest;
  if(!quest||quest.completed) return {ok:false,state,reason:"受注中の依頼がありません"};
  if(!["delivery","watch","hunt"].includes(quest.type)) return {ok:false,state,reason:"未対応の依頼形式です"};
  if(quest.type==="watch"&&quest.progress<quest.required) return {ok:false,state,reason:`見張り ${quest.progress}/${quest.required}ターン`};
  if(quest.type==="hunt"&&state.enemies?.some(enemy=>quest.targetEnemyIds.includes(enemy.id)&&living(enemy))) return {ok:false,state,reason:"討伐対象が残っています"};
  let working=state;
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
  if(!conquest&&getV39GuardianProgress(state,playerId,key).relation<balance.guardianTransferRelation) return {ok:false,state,reason:`友好度${balance.guardianTransferRelation}が必要です`};
  const landmark=state.victoryLandmarksByTile[key],keys=landmark.occupiedTileKeys?.length?landmark.occupiedTileKeys:[key];
  const settlement=getSelectedSettlement(state.players?.find(player=>player.id===playerId)?.factionState);
  if(!settlement?.placed) return {ok:false,state,reason:"領土を所属させる拠点が必要です"};
  if(keys.some(tile=>state.territoryOwnerByTile?.[tile]&&state.territoryOwnerByTile[tile]!==playerId)) return {ok:false,state,reason:"他勢力の領土を含むため譲渡できません"};
  const owner={...state.territoryOwnerByTile},territory={...state.territoryStateByTile},danger={...state.dangerPercentByTile};
  for(const tile of keys) {owner[tile]=playerId;territory[tile]={...territory[tile],status:"領土",settlementId:settlement.id||settlement.settlementId};danger[tile]=0;}
  const guardIds=new Set((state.enemies||[]).filter(enemy=>enemy.victoryLandmarkKey===key).map(enemy=>enemy.id));
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
