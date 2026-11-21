import {resolveCompletedResearchLevel} from "./research-progress.js";
import {normalizeGameStartSettings} from "./game-start-settings.js";
import {isV39TerritoryPhase,usesV39OperationPhases} from "./v39-operation-phases.js";
import {normalizeV39ProductionPointUnits,V39_PRODUCTION_POINT_UNIT} from "./v39-production-point-scale.js";
import {getV39ProductionUnitBonus} from "./v39-production-unit-support.js";

const whole = value => Math.max(0, Math.floor(Number(value) || 0));
const pointFields = {work:"work",enchantMagicUsed:"magic",enchantFaithUsed:"faith"};
const progressFields = Object.values(pointFields);
export const V39_PRODUCTION_BALANCE = Object.freeze({base:5, populationStep:25, facilityPointsPerTurn:10*V39_PRODUCTION_POINT_UNIT});

export function v39ProductionResearchLevel(player, village, name) {
  return Math.max(whole(village?.cityLevels?.[name+"Lv"]), resolveCompletedResearchLevel(player?.factionState?.research,name));
}

export function v39EnchantmentPointLimit(player, village, key, turn) {
  const research = v39ProductionResearchLevel(player,village,key==="enchantFaithUsed"?"信仰":"魔法");
  const base=Math.max(1,research)*(1+Math.floor(whole(village?.population)/V39_PRODUCTION_BALANCE.populationStep))*V39_PRODUCTION_POINT_UNIT;
  return base+getV39ProductionUnitBonus(village,pointFields[key],turn);
}

export function v39EnchantmentPoints(player, village, key, turn) {
  const usage=normalizeV39ProductionPointUnits(village)?.equipmentActionUsage;
  const max=v39EnchantmentPointLimit(player,village,key,turn);
  const used=Number(usage?.turn)===Number(turn)?whole(usage[key]):0;
  return {max,used,remaining:Math.max(0,max-used)};
}

export function v39ProductionPoints(player, village, turn) {
  village=normalizeV39ProductionPointUnits(village);
  const {base,populationStep}=V39_PRODUCTION_BALANCE;
  const max=(base+Math.floor(whole(village?.population)/populationStep)+v39ProductionResearchLevel(player,village,"鍛冶"))*V39_PRODUCTION_POINT_UNIT
    +getV39ProductionUnitBonus(village,"work",turn);
  const usage=village?.productionWorkUsage;
  const used=usage?.turn===turn?whole(usage?.used):0;
  return {max,remaining:Math.max(0,max-used)};
}

export function newV39ProductionOrder(village) {
  return whole(village?.productionOrder)+1;
}

export function v39FacilityProductionProgress(item) {
  if(item.workRequired>0)return item;
  const rate=V39_PRODUCTION_BALANCE.facilityPointsPerTurn;
  const total=Math.max(1,whole(item.totalTurns||item.remainingTurns));
  return {...item,workRequired:total*rate,workProgress:Math.max(0,total-whole(item.remainingTurns))*rate};
}

export function formatV39FacilityProductionProgress(item) {
  return item.workRequired>0?`製作 ${whole(item.workProgress)}/${item.workRequired}`:`残${whole(item.remainingTurns)}T`;
}

export function v39ProductionJobComplete(job) {
  return progressFields.every(field=>whole(job[field+"Progress"])>=whole(job[field+"Required"]));
}

// Share equally. Remainders and redistributed surplus always go to the oldest orders first.
export function allocateV39ProductionPoints(jobs, budget, field="work") {
  const grants=new Map();
  const pending=[...jobs].sort((a,b)=>whole(a.workOrder)-whole(b.workOrder))
    .map(job=>({id:job.id,left:whole(job[field+"Required"])-whole(job[field+"Progress"])}))
    .filter(job=>job.left>0);
  let remaining=whole(budget);
  while(remaining&&pending.length){
    const share=Math.floor(remaining/pending.length),extra=remaining%pending.length;
    for(const [index,job] of pending.entries()){
      const points=Math.min(job.left,share+(index<extra?1:0));
      if(!points)continue;
      job.left-=points;
      grants.set(job.id,(grants.get(job.id)||0)+points);
      remaining-=points;
    }
    for(let index=pending.length-1;index>=0;index--)if(!pending[index].left)pending.splice(index,1);
  }
  return grants;
}

export function advanceV39ProductionWork(player,village,turn,mode){
  village=normalizeV39ProductionPointUnits(village);
  const planning=mode==="planning";
  const usage=village.productionWorkUsage?.turn===turn?village.productionWorkUsage:{turn,used:0};
  const phaseKey=planning?"phaseDone":"economyDone";
  if(usage[phaseKey])return village;
  let equipment=(village.equipmentProductionQueue||[]).map(job=>planning?job:
    {...job,workProgress:whole(job.workProgress)+whole(job.pendingWork),pendingWork:0});
  let construction=(village.constructionQueue||[]).map(v39FacilityProductionProgress);
  if(planning&&!construction.length)return village;
  if(!equipment.length&&!construction.length)return village;
  const facilities=mode==="economy"?[]:construction;
  const work=allocateV39ProductionPoints([...facilities,...equipment],v39ProductionPoints(player,village,turn).remaining);
  if(facilities.length)construction=construction.map(job=>{
    const workProgress=whole(job.workProgress)+(work.get(job.id)||0);
    return {...job,workProgress,remainingTurns:Math.max(1,Math.ceil((job.workRequired-workProgress)/V39_PRODUCTION_BALANCE.facilityPointsPerTurn))};
  });
  equipment=equipment.map(job=>planning
    ? {...job,pendingWork:whole(job.pendingWork)+(work.get(job.id)||0)}
    : {...job,workProgress:whole(job.workProgress)+(work.get(job.id)||0)});
  let actionUsage=village.equipmentActionUsage;
  if(!planning&&equipment.length){
    actionUsage=actionUsage?.turn===turn?{...actionUsage}:{turn};
    for(const key of ["enchantMagicUsed","enchantFaithUsed"]){
      const field=pointFields[key];
      const grants=allocateV39ProductionPoints(equipment,v39EnchantmentPointLimit(player,village,key,turn)-whole(actionUsage[key]),field);
      equipment=equipment.map(job=>({...job,[field+"Progress"]:whole(job[field+"Progress"])+(grants.get(job.id)||0)}));
      actionUsage[key]=whole(actionUsage[key])+[...grants.values()].reduce((sum,points)=>sum+points,0);
    }
  }
  return {...village,constructionQueue:construction,equipmentProductionQueue:equipment,equipmentActionUsage:actionUsage,
    productionWorkUsage:{...usage,[phaseKey]:true,used:whole(usage.used)+[...work.values()].reduce((sum,points)=>sum+points,0)}};
}

export function forecastV39ProductionWork(player,village,state){
  const dates=new Map();
  const phased=usesV39OperationPhases(state);
  const interval=normalizeGameStartSettings(state.gameSettings).maxCombatTurnsPerWorldTurn;
  let phase=isV39TerritoryPhase(state);
  let elapsed=whole(state.timeline?.expeditionTurns);
  let turn=Math.max(1,whole(state.timeline?.turnNumber));
  let simulated=village;
  const finish=(queue,finishedTurn)=>queue.filter(job=>{
    if(!v39ProductionJobComplete(job))return true;
    dates.set(job.id,finishedTurn);
    return false;
  });
  for(let index=0;index<240&&(simulated.constructionQueue?.length||simulated.equipmentProductionQueue?.length);index++,turn++){
    if(phase){
      simulated=advanceV39ProductionWork(player,simulated,turn,"planning");
      simulated={...simulated,constructionQueue:finish(simulated.constructionQueue||[],turn)};
    }
    simulated=advanceV39ProductionWork(player,simulated,turn,phased?"economy":"standard");
    simulated={...simulated,
      constructionQueue:phased?simulated.constructionQueue:finish(simulated.constructionQueue||[],turn+1),
      equipmentProductionQueue:finish(simulated.equipmentProductionQueue||[],turn+1)
    };
    phase=phased&&++elapsed>=interval;
    if(phase)elapsed=0;
  }
  return dates;
}
