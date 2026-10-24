import {getGameDataRows} from './game-data-registry.js';
import {hasV39FacilityPrerequisites} from './v39-facility-development-rules.js';
import development from '../../../config/v39-village-development.json';
import legacyPlanIds from '../../../config/v39-legacy-facility-plan-ids.json';
import {getHexDistance} from './hex-grid.js';
import {FOOD_RESOURCE_KEYS, inspectV39NeutralVillageEconomy, normalizeV39Village, facilityDefinitions,
  inspectV39Construction, startV39Construction, advanceConstruction} from './v39-economy-rules.js';
import {getSelectedSettlement} from './settlement-state.js';
import {resolveV39ConstructionMaterials} from './v39-construction-materials.js';
import {canV39UnitLeaveOrganicCorpse} from './v39-corpse-types.js';

const number=value=>Number(value)||0;
const alive=unit=>number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
const local=unit=>(unit.worldId||'surface')==='surface';
const plans=()=>getGameDataRows('村計画');
export const villageQuestTemplates=()=>getGameDataRows('村依頼ひな型');
export function villageDefenseTrainingTurns(fallback) {
  return Math.max(1,number(plans().find(row=>row.計画対象==='守備隊')?.目標ターン)||fallback);
}
function threats(state,village,row) {
  return (state.enemies||[]).filter(unit=>alive(unit)&&local(unit)&&!unit.victoryGuard
    &&(unit.aggressive===true||unit.metadata?.aggressive===true||unit.aggroTargetId)
    &&getHexDistance(unit,village)<=number(row.対象範囲||3))
    .sort((a,b)=>getHexDistance(a,village)-getHexDistance(b,village)||String(a.id).localeCompare(String(b.id)));
}
function needsHelp(village,targets) {
  const strength=unit=>number(unit.strength)||number(unit.status?.攻撃)+number(unit.level)*5;
  return targets.reduce((sum,unit)=>sum+strength(unit),0)>
    (village.defenseUnits||[]).filter(alive).reduce((sum,unit)=>sum+strength(unit),0);
}
function projectVillage(state,village,turn) {
  const base=normalizeV39Village({...village,placed:true,settlementId:village.id,
    populationByRace:{[village.race]:village.population},cityLevels:{...village.cityLevels,...village.researchLevels}},village.race);
  const player={id:village.id,race:village.race,factionState:{settlements:[base],selectedSettlementId:village.id,research:village.research||{}}};
  const owners={...state.territoryOwnerByTile};
  for(const key of village.territoryTileKeys||[])if(!owners[key])owners[key]=village.id;
  return {player,state:{...state,timeline:{...state.timeline,turnNumber:turn},players:[player],territoryOwnerByTile:owners}};
}
function inspectPlan(state,village,row,map,turn,{proactive=false,preferredTileKey=''}={}) {
  const enemies=threats(state,village,row);
  const common={definitionId:row.ID,name:row.名前,priority:row.優先度,stages:row.工程,needs:[],targetEnemyIds:[],blockers:[],stage:'準備'};
  if(row.判定基準==='守備兵不在') {
    if((village.defenseUnits||[]).some(alive)||!village.defenseTraining)return null;
    return {...common,stage:'訓練',remainingTurns:village.defenseTraining?Math.max(0,village.defenseTraining.readyTurn-turn):row.目標ターン};
  }
  if(row.判定基準==='周辺脅威あり') {
    if(!enemies.length)return null;
    return {...common,stage:'安全確保',targetEnemyIds:enemies.slice(0,row.数量上限||3).map(unit=>unit.id),help:needsHelp(village,enemies)};
  }
  if(row.判定基準==='食料備蓄不足') {
    const economy=inspectV39NeutralVillageEconomy(village,map,state),horizon=Math.max(1,row.目標ターン);
    const needs=FOOD_RESOURCE_KEYS.map(resource=>{
      const target=number(economy.maintenance[resource])*horizon;
      const available=number(village.foodStockByType?.[resource]);
      const net=number(economy.income.food[resource])-number(economy.maintenance[resource]);
      const shortage=Math.ceil(Math.max(0,target-available));
      return {resource,amount:Math.min(shortage,row.数量上限||100),help:shortage>Math.max(0,net)*horizon};
    }).filter(need=>need.amount>0);
    return needs.length?{...common,stage:'資材確保',needs}:null;
  }
  if(!['死亡者あり','施設未建設'].includes(row.判定基準))return null;
  const keys=new Set(village.territoryTileKeys||[]);
  const corpses=[...(state.enemies||[]),...(state.players||[]).flatMap(player=>player.factionState?.units||[]),
    ...(state.neutralVillages||[]).flatMap(other=>other.defenseUnits||[])];
  const found=corpses.some(unit=>!alive(unit)&&local(unit)&&canV39UnitLeaveOrganicCorpse(unit)&&keys.has(`${unit.x},${unit.y}`))
    ||Object.entries(state.groundLootByTile||{}).some(([key,loot])=>keys.has(key)&&number((loot.cargo||loot).resourcesByType?.死体)>0);
  const queue=(village.constructionQueue||[]).find(item=>item.facilityName===row.計画対象);
  if((village.buildings||[]).includes(row.計画対象)||!proactive&&!found&&!queue)return null;
  if(queue)return {...common,stage:'建設',remainingTurns:queue.remainingTurns};
  const definition=facilityDefinitions().find(item=>item.name===row.計画対象);
  if(!definition)return {...common,blockers:['施設定義がありません']};
  const payment=resolveV39ConstructionMaterials(definition.cost,village.materialStockByType);
  const needs=Object.entries(payment.cost).map(([resource,cost])=>({resource,amount:Math.ceil(Math.max(0,cost-number(village.materialStockByType?.[resource]))),help:true})).filter(need=>need.amount>0);
  const projected=projectVillage(state,village,turn);
  const choices=[...keys].map(key=>{const [x,y]=key.split(',').map(Number);return {x,y,key};})
    .filter(tile=>projected.state.territoryOwnerByTile[tile.key]===village.id);
  const checks=choices.map(tile=>({tile,check:inspectV39Construction(projected.state,projected.player,definition,tile,map)}))
    .sort((a,b)=>Number(b.tile.key===preferredTileKey)-Number(a.tile.key===preferredTileKey));
  const feasible=checks.find(item=>item.check.available)||checks.find(item=>item.check.reasons.every(reason=>reason.startsWith('資材不足:')));
  const blockers=feasible?[]:[...new Set(checks.flatMap(item=>item.check.reasons).filter(reason=>!reason.startsWith('資材不足:')))];
  return {...common,stage:enemies.length?'安全確保':needs.length?'資材確保':'建設',needs,blockers,
    targetEnemyIds:enemies.slice(0,row.数量上限||3).map(unit=>unit.id),help:needsHelp(village,enemies),
    tile:feasible?.tile,facilityName:row.計画対象};
}
export function inspectV39VillagePlans(state,village,map,turn=state.timeline?.turnNumber||1) {
  if(village.abandoned||!map?.grid)return [];
  // Urgent food, defense and threats continue while the long-term facility goal waits.
  const urgent=plans().filter(row=>row.ID!=='PLAN_VILLAGE_CEMETERY').map(row=>({row,plan:inspectPlan(state,village,row,map,turn)})).filter(item=>item.plan);
  const building=selectVillageFacilityPlan(state,village,map,turn);
  return [...urgent,...(building?[building]:[])]
    .sort((a,b)=>b.row.優先度-a.row.優先度||a.row.ID.localeCompare(b.row.ID));
}

function selectVillageFacilityPlan(state,village,map,turn) {
  const definitions=facilityDefinitions(), rows=getGameDataRows('施設'),byName=new Map(rows.map(row=>[row.施設名,row]));
  const has=name=>{
    const row=byName.get(name);if(!row)return false;
    return row.分類==='拠点規模'?number(village.scaleLevel||1)>=number(row.規模Lv):(village.buildings||[]).includes(row.施設名);
  };
  const templates=villageQuestTemplates().map(row=>row.ID);
  const cemetery=plans().find(row=>row.ID==='PLAN_VILLAGE_CEMETERY');
  // Preserve already accepted quest/plan identities; new facilities need only their name.
  const makeRow=definition=>definition.name==='墓地'&&cemetery?cemetery:{ID:legacyPlanIds[definition.name]||`FACILITY_${definition.name}`,名前:`${definition.name}の建設`,計画対象:definition.name,
    判定基準:'施設未建設',優先度:number(definition.row.自動建設優先度),対象範囲:3,数量上限:100,工程:['安全確保','資材確保','建設'],支援依頼ID:templates};
  const queued=village.constructionQueue?.[0];
  if(queued){const definition=definitions.find(row=>row.name===queued.facilityName);if(definition){const row=makeRow(definition);return {row,plan:inspectPlan(state,village,row,map,turn,{proactive:true})};}}
  if(!has('墓地')&&cemetery){return {row:cemetery,plan:inspectPlan(state,village,cemetery,map,turn,{proactive:true})};}
  const economy=inspectV39NeutralVillageEconomy(village,map,state),context=projectVillage(state,village,turn);
  const oldGoal=village.planSchedule?.active?.facilityName;
  const materialGoal=definitions.find(row=>row.name===oldGoal);
  const shortages=materialGoal?Object.entries(resolveV39ConstructionMaterials(materialGoal.cost,village.materialStockByType).cost)
    .filter(([key,cost])=>cost>number(village.materialStockByType?.[key])).map(([key])=>key):[];
  const foodFacility=(village.buildings||[]).some(name=>{const row=definitions.find(item=>item.name===name);return number(row?.row.農業)>0||FOOD_RESOURCE_KEYS.includes(row?.gatheringResource);});
  const candidates=[],blocked=[];
  for(const definition of definitions){
    const data=definition.row;if(!data.施設名||has(data.施設名)||!hasV39FacilityPrerequisites(village,data))continue;
    const row=makeRow(definition);
    const provisional=inspectPlan(state,village,row,map,turn,{proactive:true});
    if(!provisional?.tile||provisional.blockers.length){
      const foodCandidate=number(data.農業)>0||FOOD_RESOURCE_KEYS.includes(definition.gatheringResource);
      if(foodFacility||foodCandidate)blocked.push({row,plan:provisional});
      continue;
    }
    let best=null;
    for(const key of village.territoryTileKeys||[]){
      const [x,y]=key.split(',').map(Number),tile={x,y,key};
      const check=inspectV39Construction(context.state,context.player,definition,tile,map);
      if(check.reasons.some(reason=>!reason.startsWith('資材不足:')))continue;
      const projected={...village,buildings:[...(village.buildings||[]),definition.name],tileFacilityMap:{...village.tileFacilityMap,[key]:[definition.name]}};
      const after=inspectV39NeutralVillageEconomy(projected,map,state);
      const gains=Object.fromEntries([...FOOD_RESOURCE_KEYS,...Object.keys(economy.income.material)].map(resource=>[resource,
        number(after.income.food[resource]??after.income.material[resource])-number(economy.income.food[resource]??economy.income.material[resource])]));
      const foodGain=FOOD_RESOURCE_KEYS.reduce((sum,resource)=>sum+Math.max(0,gains[resource])*(number(economy.maintenance[resource])>0?2:1),0);
      const materialGain=shortages.reduce((sum,resource)=>sum+Math.max(0,gains[resource]),0);
      const production=number(data.農業)+number(data.林業)+number(data.工業)>0||!!definition.gatheringResource;
      if(production&&Math.max(...Object.values(gains))<=0)continue;
      if(!foodFacility&&foodGain<=0)continue;
      if(foodFacility&&production&&foodGain<=0&&materialGain<=0)continue;
      const score=number(data.自動建設優先度)+(!foodFacility?foodGain*100:foodGain)+materialGain*100+
        (definition.name===oldGoal?20:0);
      if(!best||score>best.score)best={score,key};
    }
    if(best)candidates.push({row,score:best.score,plan:inspectPlan(state,village,row,map,turn,{proactive:true,preferredTileKey:best.key})});
  }
  candidates.sort((a,b)=>b.score-a.score||a.row.ID.localeCompare(b.row.ID));
  if(candidates.length)return candidates[0];
  // Explain unavailable productive land instead of inventing income or building on unsuitable terrain.
  return blocked.find(item=>item.plan)||null;
}

export function inspectV39VillageDevelopment(state,village,map,turn=state.timeline?.turnNumber||1) {
  if(village.abandoned||!map?.grid)return [];
  const completed=village.planSchedule?.development?.completedById||{},result=[];
  for(const node of development.nodes){
    const row=plans().find(row=>row.ID===node.planId);
    const plan=row?inspectPlan(state,village,row,map,turn,{proactive:node.proactive}):null;
    const satisfied=!!row&&(row.判定基準==='守備兵不在'?(village.defenseUnits||[]).some(alive):!plan);
    // Safety, supplies and defense can become urgent again after a completed milestone.
    const done=satisfied||!!completed[node.id]&&node.proactive;
    const unlocked=node.requires.every(id=>result.some(prior=>prior.id===id&&prior.status==='completed'));
    result.push({...node,name:row?.名前||node.planId,status:!row?'unavailable':!unlocked?'locked':done?'completed':'active',
      completedTurn:completed[node.id]?.turn??null,stage:plan?.stage||'',needs:plan?.needs||[],blockers:plan?.blockers||[]});
  }
  return result;
}
export function advanceV39VillagePlans(state,village,map,turn) {
  if(village.abandoned||!map?.grid)return {state,village};
  const economy=inspectV39NeutralVillageEconomy(village,map,state);
  const food={...village.foodStockByType},materials={...village.materialStockByType};
  for(const key of FOOD_RESOURCE_KEYS)food[key]=Math.round(Math.max(0,number(food[key])+number(economy.income.food[key])-number(economy.maintenance[key]))*10)/10;
  for(const [key,value] of Object.entries(economy.income.material))materials[key]=Math.round((number(materials[key])+number(value))*10)/10;
  village={...village,foodStockByType:food,materialStockByType:materials};
  // Use the same queue advancement as player construction, once in the village turn stage.
  const projected=projectVillage(state,village,turn),base=getSelectedSettlement(projected.player.factionState);
  const paused=base.constructionQueue.filter(item=>projected.state.territoryOwnerByTile[item.tileKey]!==village.id);
  const advanced=advanceConstruction({...base,constructionQueue:base.constructionQueue.filter(item=>!paused.includes(item))});
  village={...village,...advanced.village,constructionQueue:[...advanced.village.constructionQueue,...paused]};
  const facilities={...state.facilitiesByTile};
  for(const item of advanced.completed)facilities[item.tileKey]=[...(facilities[item.tileKey]||[]),item.facilityName];
  state={...state,facilitiesByTile:facilities};
  if(advanced.completed.length){
    state={...state,territoryOwnerByTile:projected.state.territoryOwnerByTile};
    village={...village,planSchedule:{...village.planSchedule,lastCompleted:{turn,facilities:advanced.completed.map(item=>({facilityName:item.facilityName,tileKey:item.tileKey}))}}};
  }
  const flow=inspectV39VillageDevelopment(state,village,map,turn);
  const completedById={...village.planSchedule?.development?.completedById};
  for(const node of flow)if(node.status==='completed'&&!completedById[node.id])completedById[node.id]={turn};
  village={...village,planSchedule:{...village.planSchedule,development:{version:development.version,completedById}}};
  const candidates=inspectV39VillagePlans(state,village,map,turn),active=candidates[0];
  if(active) {
    const old=village.planSchedule?.active;
    const plan={...active.plan,instanceId:old?.definitionId===active.row.ID?old.instanceId:`${village.id}:${active.row.ID}:${turn}`,
      startedTurn:old?.definitionId===active.row.ID?old.startedTurn:turn};
    village={...village,planSchedule:{...village.planSchedule,active:plan,waiting:candidates.slice(1,3).map(item=>item.plan),lastTurn:turn}};
    if(plan.stage==='建設'&&plan.tile&&!plan.blockers.length&&!(village.constructionQueue||[]).length) {
      const context=projectVillage(state,village,turn);
      const started=startV39Construction(context.state,village.id,plan.facilityName,plan.tile,map,{confirmResidentialReplacement:true});
      if(started.ok) {
        const base=getSelectedSettlement(started.state.players[0].factionState);
        village={...village,materialStockByType:base.materialStockByType,constructionQueue:base.constructionQueue,
          territoryTileModeMap:base.territoryTileModeMap};
        village.planSchedule.active.remainingTurns=started.queueItem.remainingTurns;
      }
    }
  } else village={...village,planSchedule:{...village.planSchedule,active:null,waiting:[],lastTurn:turn}};
  return {state,village,completed:advanced.completed};
}
function interpolate(value,vars) {return String(value||'').replace(/\{([^}]+)\}/g,(_match,key)=>vars[key]??'');}
export function resolveV39VillagePlanQuest(state,village,template,map) {
  const selected=inspectV39VillagePlans(state,village,map).find(item=>item.row.支援依頼ID.includes(template.ID)&&!item.plan.blockers.length
    &&(template.計画対象==='不足資源'?item.plan.stage==='資材確保'&&item.plan.needs.some(need=>need.help):template.計画対象==='周辺脅威'&&item.plan.stage==='安全確保'&&item.plan.help));
  if(!selected||!selected.row.支援依頼ID.includes(template.ID)||selected.plan.blockers.length)return null;
  const {plan,row}=selected;
  const vars={計画名:row.名前};
  let quest;
  if(template.計画対象==='不足資源'&&plan.stage==='資材確保') {
    const need=plan.needs.find(item=>item.help);if(!need)return null;
    const amount=Math.max(1,Math.min(need.amount,template.数量上限||100,row.数量上限||100));
    vars.資源=need.resource;vars.数量=amount;
    quest={type:'delivery',stockKind:FOOD_RESOURCE_KEYS.includes(need.resource)?'food':'material',resourceKey:need.resource,required:amount,progress:0};
  } else if(template.計画対象==='周辺脅威'&&plan.stage==='安全確保'&&plan.help) {
    const ids=plan.targetEnemyIds.slice(0,template.数量上限||3);if(!ids.length)return null;
    vars.数量=ids.length;vars.対象=[...new Set(state.enemies.filter(unit=>ids.includes(unit.id)).map(unit=>unit.race||unit.name))].join('・');
    quest={type:'hunt',targetEnemyIds:ids,required:ids.length};
  } else return null;
  const definition={ID:template.ID,名前:interpolate(template.名前,vars),イベント種別:'依頼',発生条件:[],再発生:true,
    クールダウン:template.クールダウン,期限ターン:template.期限ターン,生成設定:{方式:'村計画'},
    目標:[{タイプ:quest.type==='hunt'?'討伐':'納品',設定:{部分納品:true}}],選択肢:[{効果:[{タイプ:'依頼開始'}]}],完了効果:template.完了効果};
  return {...quest,eventId:template.ID,label:definition.名前,description:interpolate(template.説明,vars),planDefinitionId:row.ID,eventDefinition:definition};
}

export function describeV39VillagePlan(village){
  const plan=village.planSchedule?.active,last=village.planSchedule?.lastCompleted;
  const remaining=plan?.remainingTurns;
  const progress=remaining==null?'':remaining>0?` / 残り${remaining}T`:' / 完了処理待ち';
  const finished=development.nodes.every(node=>village.planSchedule?.development?.completedById?.[node.id]);
  const current=plan?`${plan.name} / ${plan.stage}${progress}${plan.blockers?.length?' / '+plan.blockers.join(' / '):''}`:finished?'発展計画完了':'計画待機中';
  const completed=last?.facilities?.map(item=>`${item.facilityName} 完成（${item.tileKey}）`).join('・');
  if(completed)return `${current} / 直近: ${completed} T${last.turn}`;
  return village.buildings?.length?`${current} / 完成施設: ${village.buildings.join('・')}`:current;
}
