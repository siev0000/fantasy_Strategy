import {isV39VillageContactUnit} from './v39-village-contacts.js';
import config from '../../../config/v39-quest-rewards.json';
import {resolveV39ImmediateSoulAmount} from './v39-soul-conversion.js';
import {addV39SoulApp,resolveV39VillageSoulApp} from './v39-soul-app.js';
import {isV39Undead} from './v39-corpse-types.js';
import {findV39VillageQuest,syncV39VillageQuestLog} from './v39-village-quest-log.js';
import {FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS} from './v39-economy-rules.js';
import {getSelectedSettlement,replaceFactionSettlement} from './settlement-state.js';
import {chargeV39Negotiation,resolveV39NegotiationSkill} from './v39-negotiation-rules.js';
import {collectV39TradeResourceKnowledge} from './v39-trade-knowledge.js';
import {V39_QUEST_BALANCE} from './v39-gameplay-balance.js';
import expeditionDefaults from '../../../config/v39-expedition-defaults.json';

const n=value=>Number(value)||0;
const fail=(state,reason)=>({ok:false,state,reason});
const resourceField=name=>FOOD_RESOURCE_KEYS.includes(name)?'foodStockByType':'materialStockByType';
export const describeV39QuestReward=reward=>Array.isArray(reward)?reward.map(describeV39QuestReward).join(' / '):reward?`${reward.kind==='population'?`${reward.name}の人口`:reward.name} ${reward.amount}${reward.kind==='population'?'人':''}`:'物資報酬なし';
export const v39QuestRewardFingerprint=quest=>JSON.stringify([quest.eventId||quest.ID,quest.type,quest.resourceKey||'',n(quest.required)]);
const updateVillage=(state,village)=>({...state,neutralVillages:state.neutralVillages.map(v=>v.id===village.id?village:v),settlements:(state.settlements||[]).map(v=>v.id===village.id?village:v)});

export function getV39AgreedQuestReward(state,village,playerId,quest){
  const offer=village.questRewardOffersByPlayerId?.[playerId]?.[quest.eventId];
  return offer?.status==='agreed'&&offer.fingerprint===v39QuestRewardFingerprint(quest)&&n(state.timeline?.turnNumber)<offer.expiresTurn?offer:null;
}
export function freezeV39QuestReward(state,village,playerId,quest){
  if(quest.automaticRewardItems!==undefined)quest={...quest,relationReward:getV39QuestRelationReward(quest)};
  const offer=getV39AgreedQuestReward(state,village,playerId,quest);
  if(!offer){
    const rewards=quest.automaticRewardItems;
    if(!rewards?.length)return {quest,village};
    if(!rewardsAvailable(village,rewards))return {ok:false,quest,village,reason:'村の報酬在庫が変わりました。依頼一覧を更新してください'};
    const reserved={...village,foodStockByType:{...village.foodStockByType},materialStockByType:{...village.materialStockByType}};
    for(const reward of rewards)reserved[resourceField(reward.name)][reward.name]=n(reserved[resourceField(reward.name)][reward.name])-reward.amount;
    return {village:reserved,quest:{...quest,rewardTerms:structuredClone(rewards),rewardEscrow:{status:'held',items:structuredClone(rewards)}}};
  }
  return {quest:{...quest,rewardTerms:structuredClone(offer.reward)},village:{...village,questRewardOffersByPlayerId:{...village.questRewardOffersByPlayerId,[playerId]:{...village.questRewardOffersByPlayerId[playerId],[quest.eventId]:{...offer,status:'used'}}}}};
}
export function getV39QuestRewardItems(quest){
  if(quest.rewardTerms)return Array.isArray(quest.rewardTerms)?quest.rewardTerms:[quest.rewardTerms];
  if(quest.automaticRewardItems)return quest.automaticRewardItems;
  if(quest.rewardResourceKey&&n(quest.rewardAmount)>0)return [{kind:'resource',name:quest.rewardResourceKey,amount:n(quest.rewardAmount)}];
  const definition=quest.numberedDefinition;
  if(definition){
    const choice=definition.選択肢?.find(row=>row.効果?.some(term=>term.タイプ==='依頼完了'));
    return (choice?.報酬||[]).filter(term=>term.タイプ==='資源').map(term=>({kind:'resource',name:term.名前,amount:n(term.数量)}));
  }
  return (quest.eventDefinition?.完了効果||[]).filter(term=>term.タイプ==='魂要求権付与').map(term=>({kind:'legacySoul',name:'魂要求権',amount:n(term.設定?.数量)}));
}
export function getV39QuestRelationReward(quest){
  if(typeof quest.relationReward==='number'&&Number.isFinite(quest.relationReward))return quest.relationReward;
  const terms=quest.numberedDefinition?.選択肢?.find(row=>row.効果?.some(t=>t.タイプ==='依頼完了'))?.報酬||quest.eventDefinition?.完了効果;
  const base=terms?terms.filter(t=>t.タイプ==='一般村友好度変更').reduce((sum,t)=>sum+n(t.設定?.値),0)
    :['watch','construction'].includes(quest.type)?expeditionDefaults.village.関係値報酬:V39_QUEST_BALANCE.villageRelationGain;
  if(quest.automaticRewardItems===undefined||base<=0)return base;
  return Math.min(config.relationScaling.maximumReward,Math.max(base,Math.round(base*resolveV39QuestEffort(quest))));
}
export function resolveV39QuestEffort(quest){
  const count=Math.max(1,n(quest.required));
  if(quest.supportGoals?.length)return quest.supportGoals.reduce((sum,goal)=>sum+resolveV39QuestEffort(goal),0);
  if(quest.type==='contract')return count*Math.max(1,n(quest.amountPerPeriod)/config.relationScaling.deliveryReferenceAmount);
  if(quest.type==='delivery')return Math.max(1,count/config.relationScaling.deliveryReferenceAmount);
  if(quest.type==='watch')return Math.max(1,count/config.relationScaling.watchReferenceTurns);
  return count;
}
export function buildV39NumberedRewardQuest(definition){
  const goal=definition?.目標?.[0];
  if(definition?.イベント種別!=='依頼'||definition.目標?.length!==1||!['納品','討伐'].includes(goal?.タイプ))return null;
  if(definition.選択肢?.filter(row=>row.効果?.some(term=>term.タイプ==='依頼完了')).length!==1)return null;
  return {eventId:definition.ID,type:goal.タイプ==='納品'?'delivery':'hunt',resourceKey:goal.タイプ==='納品'?goal.設定.対象:'',required:n(goal.設定.数量),numberedDefinition:definition};
}
export function getV39QuestRewardResources(state,playerId=state.activePlayerId){
  const player=state.players.find(p=>p.id===playerId),contracts=state.players.flatMap(p=>p.factionState.tradeContracts||[]).filter(c=>c.sides?.some(s=>s.kind==='player'&&s.partyId===playerId));
  const known=new Set(collectV39TradeResourceKnowledge(player?.factionState,contracts));
  return [...new Set([...FOOD_RESOURCE_KEYS,...MATERIAL_RESOURCE_KEYS])].filter(name=>name!=='魂'&&known.has(name));
}
function rewardAvailable(village,reward){
  if(reward.kind==='resource')return n(village[resourceField(reward.name)]?.[reward.name])>=reward.amount;
  return n(village.populationByRace?.[reward.name])>=reward.amount&&n(village.population)-reward.amount>=config.minimumVillagePopulation;
}
function normalizeRewards(value){
  const rows=Array.isArray(value)?value:[value],merged=new Map();
  if(!rows.length)return null;
  for(const row of rows){
    if(!row||!['resource','population'].includes(row.kind)||typeof row.name!=='string'||!row.name||!Number.isSafeInteger(Number(row.amount))||Number(row.amount)<1)return null;
    const key=JSON.stringify([row.kind,row.name]),amount=(merged.get(key)?.amount||0)+Number(row.amount);
    if(!Number.isSafeInteger(amount)||amount>config.maximumAmount)return null;
    merged.set(key,{kind:row.kind,name:row.name,amount});
  }
  // The same basket in a different order must not bypass the retry restriction.
  return [...merged.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,reward])=>reward);
}
function rewardsAvailable(village,rewards){
  const population=rewards.filter(r=>r.kind==='population').reduce((sum,r)=>sum+r.amount,0);
  return rewards.every(r=>rewardAvailable(village,r))&&(!population||n(village.population)-population>=config.minimumVillagePopulation);
}
export function requestV39QuestRewardChange(state,playerId,villageId,quest,request,random=Math.random){
  const village=state.neutralVillages?.find(v=>v.id===villageId),player=state.players.find(p=>p.id===playerId),actor=player?.factionState.units.find(u=>u.id===request.unitId);
  if(!village||village.abandoned)return fail(state,'交渉できる村がありません');
  if((state.activeWorldId||'surface')!=='surface'||!isV39VillageContactUnit(actor,village))return fail(state,'村の領土内または隣接マスにいる交渉役を選択してください');
  const pending=findV39VillageQuest(village,playerId,quest?.eventId);
  if(pending?.accepted&&!pending.completed)return fail(state,'受注後の報酬は変更できません');
  if(!quest?.eventId||!['delivery','hunt','watch','construction','composite','contract'].includes(quest.type))return fail(state,'依頼を選択してください');
  const rewards=normalizeRewards(request.rewards??request);
  if(!rewards)return fail(state,'要求する報酬と数量を指定してください');
  const known=getV39QuestRewardResources(state,playerId);
  if(rewards.some(reward=>reward.kind==='resource'?!known.includes(reward.name):!Object.hasOwn(village.populationByRace||{},reward.name)))return fail(state,'要求できる報酬を選択してください');
  if(!['normal','intimidation'].includes(request.mode))return fail(state,'交渉方法を選択してください');
  const charged=chargeV39Negotiation(state,playerId,actor.id,villageId,['quest-reward',v39QuestRewardFingerprint(quest),rewards,request.mode]);
  if(!charged.ok)return charged;
  let next=charged.state,updated=next.neutralVillages.find(v=>v.id===villageId);
  const intimidated=request.mode==='intimidation',relation=n(village.relationsByPlayerId?.[playerId]);
  if(intimidated){updated={...updated,relationsByPlayerId:{...updated.relationsByPlayerId,[playerId]:Math.max(-100,relation-config.intimidationRelationCost)}};next=updateVillage(next,updated);}
  const rewardValue=r=>r.amount*(r.kind==='population'?config.populationValue:1);
  const value=rewards.reduce((sum,r)=>sum+rewardValue(r),0),base=Math.max(config.minimumBudget,n(quest.required)*config.objectiveBudgetRate,getV39QuestRewardItems(quest).reduce((sum,r)=>sum+rewardValue(r),0));
  const strength=(village.defenseUnits||[]).filter(u=>n(u.hp??u.currentHp)>0).reduce((sum,u)=>sum+n(u.strength||u.status?.攻撃),0);
  const bonus=intimidated?Math.max(-config.maximumStrengthBonus,Math.min(config.maximumStrengthBonus,(n(actor.status?.攻撃)-strength)/config.strengthDivisor)):0;
  const chance=Math.max(config.minimumChance,Math.min(config.maximumChance,config.baseChance+resolveV39NegotiationSkill(state,playerId,actor,intimidated?'威圧':'交渉')/config.skillDivisor+relation/config.relationDivisor+bonus-Math.max(0,value-base)*config.extraValuePenalty));
  if(!rewardsAvailable(village,rewards)||random()>=chance)return {ok:true,accepted:false,state:next,message:'村は報酬の変更を断りました。現在の条件は維持されます。'};
  const reward=rewards.length===1?rewards[0]:rewards;
  const offer={status:'agreed',reward,fingerprint:v39QuestRewardFingerprint(quest),expiresTurn:n(state.timeline?.turnNumber)+config.offerValidTurns};
  updated={...updated,questRewardOffersByPlayerId:{...updated.questRewardOffersByPlayerId,[playerId]:{...updated.questRewardOffersByPlayerId?.[playerId],[quest.eventId]:offer}}};
  return {ok:true,accepted:true,state:updateVillage(next,updated),message:`報酬を ${describeV39QuestReward(reward)} に変更しました。受注時に確定します。`};
}
export function payV39QuestReward(state,playerId,villageId,reward,{quest}={}){
  const rewards=normalizeRewards(reward);
  if(!rewards||rewards.some(r=>r.kind==='resource'&&(![...FOOD_RESOURCE_KEYS,...MATERIAL_RESOURCE_KEYS].includes(r.name)||r.name==='魂')))return fail(state,'確定した報酬のデータが不正です');
  const village=state.neutralVillages.find(v=>v.id===villageId);
  if(quest?.rewardEscrow?.status==='held'){
    const pending=findV39VillageQuest(village,playerId,quest.eventId),player=state.players.find(row=>row.id===playerId),bank=getSelectedSettlement(player?.factionState);
    if(!bank||!pending?.accepted||pending.completed||pending.id!==quest.id||pending.rewardEscrow?.status!=='held'
      ||JSON.stringify(normalizeRewards(pending.rewardEscrow.items))!==JSON.stringify(rewards)
      ||rewards.some(row=>row.kind!=='resource'))return fail(state,'取り分けた報酬を確認できません');
    const received={...bank,foodStockByType:{...bank.foodStockByType},materialStockByType:{...bank.materialStockByType}};
    for(const item of rewards)received[resourceField(item.name)][item.name]=n(received[resourceField(item.name)][item.name])+item.amount;
    const paidVillage=syncV39VillageQuestLog({...village,questsByPlayerId:{...village.questsByPlayerId,[playerId]:{...pending,rewardEscrow:{...pending.rewardEscrow,status:'paid'}}}});
    const next=updateVillage(state,paidVillage);
    return {ok:true,state:{...next,players:next.players.map(row=>row.id===playerId?{...row,factionState:replaceFactionSettlement(row.factionState,received,{ownerPlayerId:playerId})}:row)}};
  }
  if(!village||!rewardsAvailable(village,rewards))return fail(state,'村が確定した報酬を用意できません。納品・完了は行っていません。');
  let next=state;
  for(const item of rewards){
    const result=paySingleReward(next,playerId,villageId,item);
    if(!result.ok)return {...result,state};
    next=result.state;
  }
  return {ok:true,state:next};
}

export function releaseV39QuestReward(village,quest){
  if(quest.rewardEscrow?.status!=='held')return {village,quest};
  const restored={...village,foodStockByType:{...village.foodStockByType},materialStockByType:{...village.materialStockByType}};
  for(const item of quest.rewardEscrow.items||[])if(item.kind==='resource'&&[...FOOD_RESOURCE_KEYS,...MATERIAL_RESOURCE_KEYS].includes(item.name))
    restored[resourceField(item.name)][item.name]=n(restored[resourceField(item.name)][item.name])+n(item.amount);
  return {village:restored,quest:{...quest,rewardEscrow:{...quest.rewardEscrow,status:'returned'}}};
}
function paySingleReward(state,playerId,villageId,reward){
  if(!reward||!['resource','population'].includes(reward.kind)||!Number.isSafeInteger(reward.amount)||reward.amount<1||!reward.name||reward.kind==='resource'&&(![...FOOD_RESOURCE_KEYS,...MATERIAL_RESOURCE_KEYS].includes(reward.name)||reward.name==='魂'))return fail(state,'確定した報酬のデータが不正です');
  const village=state.neutralVillages.find(v=>v.id===villageId),player=state.players.find(p=>p.id===playerId),bank=getSelectedSettlement(player?.factionState);
  if(!village||!bank||!rewardAvailable(village,reward))return fail(state,'村が確定した報酬を用意できません。納品・完了は行っていません。');
  let paid,received,soulApp=0;
  if(reward.kind==='population'){
    paid={...village,population:village.population-reward.amount,populationByRace:{...village.populationByRace,[reward.name]:n(village.populationByRace[reward.name])-reward.amount}};
    const souls=isV39Undead({race:reward.name})?0:resolveV39ImmediateSoulAmount(player,reward.amount);
    if(souls>0)soulApp=resolveV39VillageSoulApp(player,village,state.gameSettings)*reward.amount;
    received=souls>0?{...bank,foodStockByType:{...bank.foodStockByType,魂:n(bank.foodStockByType?.魂)+souls}}
      :{...bank,population:n(bank.population)+reward.amount,populationByRace:{...bank.populationByRace,[reward.name]:n(bank.populationByRace?.[reward.name])+reward.amount}};
  }else{
    const field=resourceField(reward.name);paid={...village,[field]:{...village[field],[reward.name]:n(village[field]?.[reward.name])-reward.amount}};
    received={...bank,[field]:{...bank[field],[reward.name]:n(bank[field]?.[reward.name])+reward.amount}};
  }
  const next=updateVillage(state,paid);
  return {ok:true,state:{...next,players:next.players.map(p=>p.id!==playerId?p:{...p,factionState:addV39SoulApp(replaceFactionSettlement(p.factionState,received,{ownerPlayerId:playerId}),[soulApp])})}};
}
