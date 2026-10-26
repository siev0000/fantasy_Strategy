import balance from '../../../config/v39-npc-faction-ai.json';
import {getV39CityRaceAffinity} from './v39-race-definitions.js';
export {getV39CityRaceAffinity} from './v39-race-definitions.js';
import {inspectV39CitySpecializations,selectV39CitySpecialization} from './v39-city-specialization-rules.js';
import {inspectV39NeutralVillageEconomy} from './v39-economy-rules.js';
import {getHexDistance} from './hex-grid.js';
import {canV39FactionAttack} from './v39-diplomacy-rules.js';
import {collectV39FactionVision} from './v39-faction-intelligence-rules.js';
import {resolveDetectionGroupSense} from './v39-detection-rules.js';

const n=value=>Number(value)||0;
const alive=unit=>n(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
const weighted=(definition,weights)=>Object.entries(weights||{}).reduce((score,[key,weight])=>score+n(definition[key])*weight,0);
export function inspectV39NpcCitySpecializations(state,player,map,context={}){
  if(player?.isPlayer!==false)return [];
  const cfg=balance.citySpecialization,worldId=state.activeWorldId||'surface';
  const vision=collectV39FactionVision(state,player.id,map);
  const detected=unit=>{
    const key=`${unit.x},${unit.y}`;
    return vision.visible.has(key)&&n(vision.detectionByTile.get(key))>=resolveDetectionGroupSense([unit],{turnNumber:state.timeline?.turnNumber,mapData:map}).stealth;
  };
  return (player.factionState.settlements||[]).filter(city=>city.placed&&(city.worldId||'surface')===worldId).map(city=>{
    const options=inspectV39CitySpecializations(state,player,city,map),currentId=city.citySpecializationId||'';
    const economy=inspectV39NeutralVillageEconomy({...city,race:player.race},map,state);
    const foodShortage=context.foodBalances?context.foodBalances.some(row=>row.settlementId===(city.settlementId||city.id)&&row.active):n(economy.shortageTotal)>0;
    const materialShortage=context.materialShortage&&context.materialSettlementId===(city.settlementId||city.id);
    const threat=(state.enemies||[]).some(unit=>alive(unit)&&unit.aggressive===true&&(unit.worldId||'surface')===worldId&&detected(unit)&&getHexDistance(unit,city)<=cfg.threatRange)
      ||(state.players||[]).some(other=>other.id!==player.id&&canV39FactionAttack(state,other.id,player.id)
        &&(other.factionState.units||[]).some(unit=>alive(unit)&&(unit.worldId||'surface')===worldId&&detected(unit)&&getHexDistance(unit,city)<=cfg.threatRange));
    const researching=Object.values(player.factionState.research?.selection||{}).some(Boolean);
    const score=option=>{
      const definition=option.definition,affinity=getV39CityRaceAffinity(city,option.id,player.race);
      let value=affinity*cfg.preferredCityBonus+weighted(definition,cfg.baseWeights);
      if(foodShortage)value+=weighted(definition,cfg.foodShortageWeights);
      if(materialShortage)value+=weighted(definition,cfg.materialShortageWeights);
      if(context.reinforcementNeeded)value+=weighted(definition,cfg.reinforcementWeights);
      if(threat)value+=weighted(definition,cfg.threatWeights);
      if(researching)value+=weighted(definition,cfg.researchWeights);
      if(player.factionState.research?.selection?.['魔法'])value+=weighted(definition,cfg.magicResearchWeights);
      return {id:option.id,score:Math.round(value*100)/100,affinity:Math.round(affinity*100),available:option.available};
    };
    const ranked=options.map(score).sort((a,b)=>b.score-a.score||Number(b.id===currentId)-Number(a.id===currentId)||a.id.localeCompare(b.id));
    const current=ranked.find(row=>row.id===currentId),best=ranked.find(row=>row.available),remaining=options[0]?.remainingTurns||0;
    const change=!!best&&best.id!==currentId&&(!current||best.score-current.score>=cfg.minimumSwitchGain);
    return {settlementId:city.settlementId||city.id,name:city.name,currentId,targetId:change?best.id:currentId,
      status:change?'ready':remaining?'waiting':best?'maintain':'blocked',remainingTurns:remaining,
      score:change?best.score:current?.score||0,affinity:change?best.affinity:current?.affinity||0,
      reasons:[foodShortage?'食料不足':'',materialShortage?'建設資材不足':'',context.reinforcementNeeded?'戦力増強':'',threat?'周辺脅威':'',researching?'研究中':''].filter(Boolean),
      candidates:ranked};
  });
}
export function applyV39NpcCitySpecializations(state,playerId,map,plans){
  if(state.players?.find(player=>player.id===playerId)?.isPlayer!==false)return {state,commands:[]};
  let working=state;const commands=[];
  for(const plan of plans||[]){
    if(plan.status!=='ready')continue;
    const result=selectV39CitySpecialization(working,playerId,plan.settlementId,plan.targetId,map);
    if(!result.ok)continue;
    working=result.state;commands.push(`都市特化:${plan.name||plan.settlementId}→${plan.targetId}（種族適性${plan.affinity}%${plan.reasons.length?' / '+plan.reasons.join('・'):''}）`);
  }
  return {state:working,commands};
}
