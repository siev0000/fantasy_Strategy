import config from '../../../config/v39-initial-subjects.json';
import {isV39SubjectRuler,normalizeV39SubjectPopulation} from './v39-initial-subjects.js';
import {getFactionSettlements,replaceFactionSettlement} from './settlement-state.js';
import {normalizeV39Village} from './v39-economy-rules.js';
import {rescaleV39PopulationGrowthForPopulationChange} from './v39-population-economy.js';
import {resolveV39PersonSoulAmount} from './v39-soul-conversion.js';
import {inspectV39NpcResourceNeeds} from './v39-npc-resource-policy.js';

export function convertV39SubjectPopulation(state,playerId,settlementId,{race,count,resource,aiTurn=false}={}){
  const fail=reason=>({ok:false,state,reason});
  const player=state.players?.find(row=>row.id===playerId);
  if(!player||!isV39SubjectRuler(player.race))return fail('魔族の勢力で実行してください');
  if(aiTurn?player.isPlayer!==false||!['player','enemy','resolution'].includes(state.timeline?.phase)
    :state.activePlayerId!==playerId||state.timeline?.phase!=='player')return fail('自勢力の行動中に実行してください');
  const base=getFactionSettlements(player.factionState).find(row=>(row.settlementId||row.id)===settlementId);
  if(!base?.placed||(base.ownerPlayerId&&base.ownerPlayerId!==playerId)
    ||(base.worldId||'surface')!==(state.activeWorldId||'surface'))return fail('現在のワールドの自拠点を選んでください');
  const subjects=normalizeV39SubjectPopulation(base.populationByRace,base.subjectPopulationByRace);
  if(!Number.isSafeInteger(count)||count<=0||count>Number(subjects[race]||0))return fail('奴隷住民の保有人数以内で指定してください');
  if(!['魂','死体'].includes(resource))return fail('魂または死体を選んでください');
  const amount=resource==='魂'?resolveV39PersonSoulAmount(player,count):count*config.corpsesPerPerson;
  if(!Number.isFinite(amount)||amount<=0)return fail('変換量が設定されていません');
  const populationByRace={...base.populationByRace,[race]:base.populationByRace[race]-count};
  const next=normalizeV39Village({...base,populationByRace,
    ...(aiTurn?{lastNpcSubjectConversionTurn:Number(state.timeline?.turnNumber)||1}:{}),
    subjectPopulationByRace:{...subjects,[race]:subjects[race]-count},
    populationGrowthByRace:rescaleV39PopulationGrowthForPopulationChange(populationByRace,base.populationGrowthByRace),
    foodStockByType:{...base.foodStockByType,[resource]:Number(base.foodStockByType?.[resource]||0)+amount}},player.race);
  const faction=replaceFactionSettlement(player.factionState,next,{ownerPlayerId:playerId,select:false});
  const players=state.players.map(row=>row.id===playerId?{...row,factionState:faction}:row);
  const settlements=(state.settlements||[]).map(row=>(row.settlementId||row.id)===settlementId?{...row,...next}:row);
  return {ok:true,state:{...state,players,settlements},amount,
    message:`${base.name}: 奴隷住民 ${race}${count}人 → ${resource}${amount}`};
}

export function advanceV39NpcSubjectConversion(state,playerId){
  const player=state.players?.find(row=>row.id===playerId),settings=config.npc;
  if(!settings.enabled||player?.isPlayer!==false||!isV39SubjectRuler(player.race))return null;
  for(const need of inspectV39NpcResourceNeeds(player)){
    const base=getFactionSettlements(player.factionState).find(row=>row.settlementId===need.settlementId);
    if((base?.worldId||'surface')!==(state.activeWorldId||'surface')
      ||Number(base.lastNpcSubjectConversionTurn)>=Number(state.timeline?.turnNumber||1))continue;
    for(const [race,held] of Object.entries(normalizeV39SubjectPopulation(base.populationByRace,base.subjectPopulationByRace))){
      const count=Math.min(settings.maximumPerTurn,held-settings.minimumRemaining);
      if(count<=0)continue;
      const result=convertV39SubjectPopulation(state,playerId,need.settlementId,{race,count,resource:need.resource,aiTurn:true});
      if(result.ok)return result;
    }
  }
  return null;
}
