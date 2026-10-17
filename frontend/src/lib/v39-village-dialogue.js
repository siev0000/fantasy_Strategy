import {openV39NumberedDialogue,viewV39NumberedDialogue,chooseV39NumberedDialogue,backV39NumberedDialogue,inspectV39NumberedDialogue} from './v39-event-dialogue-rules.js';
import {acceptV39NeutralVillageQuest,completeV39NeutralVillageQuest,changeV39QuestResource,
  changeV39NeutralVillageRelation,updateV39NeutralVillageState,getV39NeutralVillageRelation} from './v39-neutral-village-rules.js';
import {getSelectedSettlement} from './settlement-state.js';
import {FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS} from './v39-economy-rules.js';
import {V39_QUEST_BALANCE} from './v39-gameplay-balance.js';

const fail=(state,reason)=>({ok:false,state,reason});
const playerOf=state=>state.players.find(row=>row.id===state.activePlayerId);
const villageOf=(state,id)=>state.neutralVillages?.find(row=>row.id===id);
const questOf=(state,id)=>villageOf(state,id)?.questsByPlayerId?.[state.activePlayerId];
const sessionsOf=state=>playerOf(state)?.factionState.eventDialogueById||{};
const resourceKind=name=>FOOD_RESOURCE_KEYS.includes(name)?'food':MATERIAL_RESOURCE_KEYS.includes(name)?'material':'';
const fieldOf=name=>resourceKind(name)==='food'?'foodStockByType':'materialStockByType';
const amount=(state,name)=>Number(getSelectedSettlement(playerOf(state)?.factionState)?.[fieldOf(name)]?.[name])||0;
const alive=unit=>Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';

function accessReason(state,villageId) {
  const village=villageOf(state,villageId),player=playerOf(state);
  if(!village||!player)return '会話相手またはプレイヤーがいません';
  if((state.activeWorldId||'surface')!=='surface'||state.timeline?.phase!=='player')return '地上の操作ターンに会話してください';
  if(!player.factionState.units.some(unit=>alive(unit)&&(unit.worldId||'surface')==='surface'
    &&(village.territoryTileKeys||[`${village.x},${village.y}`]).includes(`${unit.x},${unit.y}`)))return '村の領域に生存ユニットを移動してください';
  return '';
}

function adapters(definition,mapData) {
  const ownedQuest=ctx=>{
    const quest=questOf(ctx.state,ctx.contextId);
    return quest?.dialogueEventId===definition.ID&&quest.accepted&&!quest.completed?quest:null;
  };
  return {
    conditions:{
      一般村友好度:(term,ctx)=>{
        const value=getV39NeutralVillageRelation(villageOf(ctx.state,ctx.contextId),ctx.playerId);
        return term.比較==='>='?value>=term.値:term.比較==='<='?value<=term.値:term.比較==='一致'&&value===term.値;
      },
      プレイヤー種族:(term,ctx)=>term.比較==='一致'&&playerOf(ctx.state)?.race===term.値,
      資源保有:(term,ctx)=>!!resourceKind(term.名前)&&amount(ctx.state,term.名前)>=term.数量,
      依頼受注済み:(_term,ctx)=>!!ownedQuest(ctx),
      討伐達成:(term,ctx)=>{
        const quest=ownedQuest(ctx);
        if(quest?.type!=='hunt'||quest.dialogueTarget!==term.対象)return false;
        const living=new Set(ctx.state.enemies.filter(alive).map(unit=>unit.id));
        return quest.targetEnemyIds.filter(id=>!living.has(id)).length>=term.数量;
      }
    },
    supportedOperations:['消費:資源','報酬:資源','報酬:一般村友好度変更','効果:依頼開始','効果:依頼完了'],
    applyChoice(state,choice,context) {
      let working=state;
      const start=choice.効果.find(term=>term.タイプ==='依頼開始');
      const complete=choice.効果.find(term=>term.タイプ==='依頼完了');
      if(choice.効果.filter(term=>term.タイプ!=='会話終了').length>1)return fail(state,'依頼効果は選択肢ごとに1つ指定してください');
      if(start&&complete)return fail(state,'依頼の開始と完了は別の選択肢にしてください');
      if(start) {
        const goal=definition.目標?.[0];
        if(definition.目標?.length!==1||!['納品','討伐'].includes(goal?.タイプ))return fail(state,'未対応の依頼目標です');
        const target=goal.設定?.対象,required=Number(goal.設定?.数量);
        if(!Number.isInteger(required)||required<1)return fail(state,'依頼数量が不正です');
        const questDefinition={ID:definition.ID,名前:definition.名前,イベント種別:'依頼',発生条件:[],
          再発生:definition.再発生===true,クールダウン:definition.クールダウン||0,期限ターン:definition.期限ターン||0,
          生成設定:{方式:goal.タイプ==='納品'?'指定物資':'指定討伐',対象:target,数量:required,範囲:V39_QUEST_BALANCE.villageNumberedHuntRange},
          目標:[{タイプ:goal.タイプ,設定:{部分納品:false}}],選択肢:[{効果:[{タイプ:'依頼開始'}]}],完了効果:[]};
        const result=acceptV39NeutralVillageQuest(working,context.playerId,context.contextId,mapData,definition.ID,questDefinition);
        if(!result.ok)return result;
        const village=result.village;
        const quest={...result.quest,dialogueEventId:definition.ID,dialogueQuestKey:start.設定.対象,dialogueTarget:target,dialogueStartNumber:choice.番号,
          numberedDefinition:structuredClone(definition)};
        working=updateV39NeutralVillageState(result.state,{...village,questsByPlayerId:{...village.questsByPlayerId,[context.playerId]:quest}});
      }
      const quest=questOf(working,context.contextId);
      if(complete&&(!quest||quest.dialogueEventId!==definition.ID||quest.dialogueQuestKey!==complete.設定.対象||quest.completed))return fail(state,'この会話の受注中依頼がありません');
      // The common delivery handler charges the goal itself. Do not charge a sheet cost twice.
      let covered=complete&&quest.type==='delivery'?Math.max(0,quest.required-(quest.progress||0)):0;
      for(const term of choice.消費) {
        if(!resourceKind(term.名前)||!Number.isInteger(term.数量)||term.数量<1)return fail(state,'未対応の消費資源または数量です');
        const skip=complete&&term.名前===quest.resourceKey?Math.min(covered,term.数量):0;
        covered-=skip;
        const result=changeV39QuestResource(working,context.playerId,resourceKind(term.名前),-(term.数量-skip),term.名前);
        if(!result.ok)return result;
        working=result.state;
      }
      if(complete) {
        const result=completeV39NeutralVillageQuest(working,context.playerId,context.contextId,{fromDialogue:true});
        if(!result.ok)return result;
        working=result.state;
      }
      for(const term of choice.報酬) {
        let village=villageOf(working,context.contextId);
        if(term.タイプ==='一般村友好度変更') {
          working=updateV39NeutralVillageState(working,changeV39NeutralVillageRelation(village,context.playerId,Number(term.設定?.値)||0));
          continue;
        }
        if(!resourceKind(term.名前)||!Number.isInteger(term.数量)||term.数量<1)return fail(state,'未対応の報酬資源または数量です');
        const field=fieldOf(term.名前),soul=term.名前==='魂'&&Number.isFinite(village.soulStock);
        const stock=Number(soul?village.soulStock:village[field]?.[term.名前])||0;
        if(stock<term.数量)return fail(state,`村の${term.名前}が不足しています`);
        village=soul?{...village,soulStock:stock-term.数量}:{...village,[field]:{...village[field],[term.名前]:stock-term.数量}};
        const result=changeV39QuestResource(working,context.playerId,resourceKind(term.名前),term.数量,term.名前);
        if(!result.ok)return result;
        working=updateV39NeutralVillageState(result.state,village);
      }
      return {ok:true,state:working};
    }
  };
}

export function openV39VillageDialogue(state,definition,villageId,mapData) {
  const reason=accessReason(state,villageId);if(reason)return fail(state,reason);
  if(definition?.分類!=='一般村'||inspectV39NumberedDialogue(definition).length)return fail(state,'未対応の会話定義です');
  const sessions=Object.values(sessionsOf(state)).filter(row=>row.contextId===villageId&&row.eventId===definition.ID);
  const active=sessions.find(row=>!row.closed);
  const quest=questOf(state,villageId),pending=quest?.dialogueEventId===definition.ID&&!quest.completed;
  const turn=state.timeline.turnNumber;
  const last=villageOf(state,villageId).eventCompletedTurnByPlayerId?.[state.activePlayerId]?.[definition.ID];
  const repeat=definition.再発生===true&&last!=null&&turn>=last+(definition.クールダウン||0)&&!pending;
  if(active&&!repeat)return {ok:true,state,session:active};
  if(active)state={...state,players:state.players.map(player=>player.id!==state.activePlayerId?player:{...player,
    factionState:{...player.factionState,eventDialogueById:{...player.factionState.eventDialogueById,[active.instanceId]:{...active,closed:true,closedTurn:turn}}}})};
  const closedTurn=Math.max(-1,...sessions.filter(row=>row.closed).map(row=>row.closedTurn??turn));
  if(!pending&&(last!=null&&(definition.再発生!==true||turn<last+(definition.クールダウン||0))
    ||definition.イベント種別!=='依頼'&&sessions.length&&(definition.再発生!==true||turn<closedTurn+(definition.クールダウン||0))))return fail(state,'完了済み、または再発生の待機中です');
  const pinned=pending?quest.numberedDefinition:definition;
  const opened=openV39NumberedDialogue(state,pinned,{contextId:villageId,instanceId:`${villageId}:${definition.ID}:${turn}:${sessions.length}`});
  if(!opened.ok)return opened;
  opened.session.definition=structuredClone(pinned);
  if(pending&&quest.dialogueStartNumber){opened.session.cursor=quest.dialogueStartNumber;opened.session.applied=[quest.dialogueStartNumber];}
  return opened;
}

export function viewV39VillageDialogue(state,instanceId,mapData) {
  const session=sessionsOf(state)[instanceId];if(!session?.definition)return {ok:false,reason:'会話がありません',choices:[]};
  const reason=accessReason(state,session.contextId);if(reason)return {ok:false,reason,choices:[]};
  if(session.closed)return {ok:true,closed:true,choices:[],canBack:false,answer:session.definition.選択肢.find(row=>row.番号===session.cursor)?.回答||'会話を終了しました'};
  return viewV39NumberedDialogue(state,session.definition,instanceId,adapters(session.definition,mapData));
}

export function chooseV39VillageDialogue(state,instanceId,number,mapData) {
  const session=sessionsOf(state)[instanceId];if(!session?.definition)return fail(state,'会話がありません');
  const reason=accessReason(state,session.contextId);if(reason)return fail(state,reason);
  const result=chooseV39NumberedDialogue(state,session.definition,instanceId,number,adapters(session.definition,mapData));
  if(result.ok&&result.session.closed)result.session.closedTurn=state.timeline.turnNumber;
  return result;
}

export function backV39VillageDialogue(state,instanceId) {
  const session=sessionsOf(state)[instanceId];if(!session?.definition)return fail(state,'会話がありません');
  const reason=accessReason(state,session.contextId);if(reason)return fail(state,reason);
  return backV39NumberedDialogue(state,session.definition,instanceId);
}
