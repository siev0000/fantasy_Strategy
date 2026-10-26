import {describeV39VillagePlan} from '../../lib/v39-village-plans.js';
import {describeV39NpcObjective} from '../../lib/v39-npc-objective-label.js';
import {getV39RecordedResourceDelta} from '../../lib/v39-resource-delta-view.js';

const n=value=>Number(value)||0;
const alive=unit=>n(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
export function simulationActors(state,map){
  const players=(state.players||[]).filter(player=>player.isPlayer===false).map(player=>({
    id:player.id,name:player.label||player.id,kind:'勢力',race:player.race,
    units:player.factionState?.units||[],bases:player.factionState?.settlements||[],
    goal:describeV39NpcObjective(player.factionState?.aiState?.objective),
    ai:player.factionState?.aiState||{},queue:player.factionState?.unitTrainingQueue||[],research:player.factionState?.research,
    trades:player.factionState?.tradeContracts||[]
  }));
  const villages=(state.neutralVillages||[]).map(village=>({id:`village:${village.id}`,name:village.name||village.id,kind:'村',race:village.race,
    units:village.defenseUnits||[],bases:[village],queue:village.resourceOperations?.unitTrainingQueue||[],
    goal:describeV39VillagePlan(village,state,map),ai:{lastProcessedTurn:village.resourceOperations?.lastProcessedTurn,lastCommands:village.resourceOperations?.lastCommands||[],developmentPlan:{construction:village.planSchedule?.active}},
  }));
  return [...players,...villages].map(actor=>{
    const units=actor.units.filter(alive).map(unit=>({id:unit.id,name:unit.name,x:unit.x,y:unit.y,worldId:unit.worldId||'surface',hp:n(unit.hp??unit.currentHp),ap:n(unit.ap??unit.currentAp)}));
    const stocks={},stockDeltas={},stockBases=actor.bases.filter(base=>base.placed!==false);
    for(const base of stockBases)for(const bag of [base.foodStockByType,base.materialStockByType])for(const [key,value] of Object.entries(bag||{}))stocks[key]=(stocks[key]||0)+Number(value);
    for(const key of Object.keys(stocks)){
      const values=stockBases.map(base=>getV39RecordedResourceDelta(base,key));
      stockDeltas[key]=values.some(value=>value===null)?null:Math.round(values.reduce((sum,value)=>sum+value,0)*100)/100;
    }
    const buildings=actor.bases.flatMap(base=>base.buildings||[]);
    const pending=actor.bases.flatMap(base=>[...(base.constructionQueue||[]),...(base.landExpansionProjects||[])]);
    const plan=actor.ai.developmentPlan;
    return {id:actor.id,name:actor.name,kind:actor.kind,race:actor.race,goal:actor.goal||actor.ai.lastObjective?.label||actor.ai.lastObjective?.type||'目標未設定',
      units,stocks,stockDeltas,population:actor.bases.reduce((sum,base)=>sum+n(base.population),0),buildings,
      pending:pending.map(item=>({name:item.facilityName||'開拓',tileKey:item.tileKey,remainingTurns:item.remainingTurns})),
      training:actor.queue.map(item=>({name:item.unit?.name||item.className||'訓練',progress:item.progressExp,required:item.requiredExp})),
      reasons:[...(plan?.construction?.reasons||[]),...(plan?.reinforcement?.reasons||[])],
      commands:[...(actor.ai.lastCommands||[])],processedTurn:n(actor.ai.lastProcessedTurn),food:structuredClone(plan?.foodBalances||[]),
      needs:(plan?.resourceGoals||[]).map(row=>({name:row.name,stock:row.stock,required:row.required,missing:row.missing,purpose:row.purpose})),
      nextConstruction:plan?.construction?.name||plan?.construction?.facilityName||'',
      research:structuredClone(actor.research||null),growth:structuredClone(actor.ai.growthPlan||null),
      trades:actor.trades?.map(row=>({id:row.id,status:row.status,completedCycles:row.completedCycles,reason:row.reason,sides:row.sides.map(side=>({partyId:side.partyId,stage:side.stage,goods:side.goods}))}))||[],
      task:structuredClone(actor.ai.objective||actor.ai.lastObjective||null)};
  });
}

export function compareSimulationActors(before,after,history=[]){
  const changes=[],issues=[];
  for(const actor of after){
    const previous=before.find(row=>row.id===actor.id),prefix=`${actor.kind} ${actor.name}`;
    const add=(category,message)=>changes.push({actorId:actor.id,category,message});
    if(!previous){add('変化',`${prefix} が出現`);continue;}
    if(actor.processedTurn!==previous.processedTurn)for(const message of actor.commands)add(categoryOf(message),message);
    for(const unit of actor.units){
      const old=previous.units.find(row=>row.id===unit.id);
      if(!old)add('徴兵',`${unit.name||unit.id} が加入 (${unit.x},${unit.y})`);
      else{
        if(old.x!==unit.x||old.y!==unit.y||old.worldId!==unit.worldId)add('移動',`${unit.name||unit.id}: ${old.worldId}(${old.x},${old.y}) → ${unit.worldId}(${unit.x},${unit.y})`);
        if(old.hp!==unit.hp)add('戦闘',`${unit.name||unit.id}: HP ${old.hp} → ${unit.hp}（回復・災害を含む）`);
      }
    }
    for(const unit of previous.units)if(!actor.units.some(row=>row.id===unit.id))add('変化',`${unit.name||unit.id} が一覧から離脱（死亡・移籍・格納など）`);
    const remaining=[...previous.buildings];
    for(const name of actor.buildings){const index=remaining.indexOf(name);if(index<0)add('建設',`${name} 完成`);else remaining.splice(index,1);}
    if(previous.population!==actor.population)add('変化',`人口 ${previous.population} → ${actor.population}`);
    if(!changes.some(row=>row.actorId===actor.id))add('判断',actor.reasons.join(' / ')||actor.goal||'記録できる行動なし');
    for(const [name,value] of Object.entries(actor.stocks))if(!Number.isFinite(value)||value<0)issues.push({actorId:actor.id,severity:Number.isFinite(value)?'要確認':'異常',message:`${name} の在庫が ${value}`});
    if(new Set(actor.units.map(unit=>unit.id)).size!==actor.units.length)issues.push({actorId:actor.id,severity:'異常',message:'生存ユニットIDが重複'});
    const recent=history.slice(-4).map(frame=>frame.actors.find(row=>row.id===actor.id)).filter(Boolean);
    const activity=row=>JSON.stringify([row.units.map(unit=>[unit.id,unit.x,unit.y,unit.worldId,unit.hp]),row.pending,row.training,row.buildings,row.goal]);
    if(recent.length===4&&recent.every(row=>activity(row)===activity(actor))&&actor.units.some(unit=>unit.ap>0))
      issues.push({actorId:actor.id,severity:'要確認',message:'5ターン連続で位置・戦力・工事進捗・目標に変化なし（待機理由を確認）'});
    if(recent.length===4){
      const pos=row=>JSON.stringify(row.units.map(unit=>[unit.id,unit.worldId,unit.x,unit.y]));
      if(pos(actor)===pos(recent[0])&&pos(actor)===pos(recent[2])&&pos(recent[1])===pos(recent[3])&&pos(actor)!==pos(recent[1]))
        issues.push({actorId:actor.id,severity:'要確認',message:'位置が交互に戻っている可能性（往復経路を確認）'});
    }
  }
  for(const actor of before)if(!after.some(row=>row.id===actor.id))changes.push({actorId:actor.id,category:'変化',message:`${actor.name} が一覧から消失`});
  return {changes,issues};
}
export function categoryOf(message){
  if(/建設|完成|開拓/.test(message))return '建設';
  if(/訓練|徴兵|増強/.test(message))return '徴兵';
  if(/調達|採取|搬入|輸送|回収/.test(message))return '調達';
  if(/攻撃|戦闘|襲撃|撃破|宣戦/.test(message))return '戦闘';
  if(/移動|探索|帰還|入場/.test(message))return '移動';
  return '判断';
}
