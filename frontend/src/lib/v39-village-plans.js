import {getGameDataRows} from './game-data-registry.js';
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
function inspectPlan(state,village,row,map,turn) {
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
    const economy=inspectV39NeutralVillageEconomy(village,map),horizon=Math.max(1,row.目標ターン);
    const needs=FOOD_RESOURCE_KEYS.map(resource=>{
      const target=number(economy.maintenance[resource])*horizon;
      const available=number(village.foodStockByType?.[resource]);
      const net=number(economy.income.food[resource])-number(economy.maintenance[resource]);
      const shortage=Math.ceil(Math.max(0,target-available));
      return {resource,amount:Math.min(shortage,row.数量上限||100),help:shortage>Math.max(0,net)*horizon};
    }).filter(need=>need.amount>0);
    return needs.length?{...common,stage:'資材確保',needs}:null;
  }
  if(row.判定基準!=='死亡者あり')return null;
  const keys=new Set(village.territoryTileKeys||[]);
  const corpses=[...(state.enemies||[]),...(state.players||[]).flatMap(player=>player.factionState?.units||[]),
    ...(state.neutralVillages||[]).flatMap(other=>other.defenseUnits||[])];
  const found=corpses.some(unit=>!alive(unit)&&local(unit)&&canV39UnitLeaveOrganicCorpse(unit)&&keys.has(`${unit.x},${unit.y}`))
    ||Object.entries(state.groundLootByTile||{}).some(([key,loot])=>keys.has(key)&&number((loot.cargo||loot).resourcesByType?.死体)>0);
  const queue=(village.constructionQueue||[]).find(item=>item.facilityName===row.計画対象);
  if((village.buildings||[]).includes(row.計画対象)||!found&&!queue)return null;
  if(queue)return {...common,stage:'建設',remainingTurns:queue.remainingTurns};
  const definition=facilityDefinitions().find(item=>item.name===row.計画対象);
  if(!definition)return {...common,blockers:['施設定義がありません']};
  const payment=resolveV39ConstructionMaterials(definition.cost,village.materialStockByType);
  const needs=Object.entries(payment.cost).map(([resource,cost])=>({resource,amount:Math.ceil(Math.max(0,cost-number(village.materialStockByType?.[resource]))),help:true})).filter(need=>need.amount>0);
  const projected=projectVillage(state,village,turn);
  const choices=[...keys].map(key=>{const [x,y]=key.split(',').map(Number);return {x,y,key};})
    .filter(tile=>projected.state.territoryOwnerByTile[tile.key]===village.id);
  const checks=choices.map(tile=>({tile,check:inspectV39Construction(projected.state,projected.player,definition,tile,map)}));
  const feasible=checks.find(item=>item.check.available)||checks.find(item=>item.check.reasons.every(reason=>reason.startsWith('資材不足:')));
  const blockers=feasible?[]:[...new Set(checks.flatMap(item=>item.check.reasons).filter(reason=>!reason.startsWith('資材不足:')))];
  return {...common,stage:enemies.length?'安全確保':needs.length?'資材確保':'建設',needs,blockers,
    targetEnemyIds:enemies.slice(0,row.数量上限||3).map(unit=>unit.id),help:needsHelp(village,enemies),
    tile:feasible?.tile,facilityName:row.計画対象};
}
export function inspectV39VillagePlans(state,village,map,turn=state.timeline?.turnNumber||1) {
  if(village.abandoned||!map?.grid)return [];
  return plans().map(row=>({row,plan:inspectPlan(state,village,row,map,turn)})).filter(item=>item.plan)
    .sort((a,b)=>b.row.優先度-a.row.優先度||a.row.ID.localeCompare(b.row.ID));
}
export function advanceV39VillagePlans(state,village,map,turn) {
  if(village.abandoned||!map?.grid)return {state,village};
  const economy=inspectV39NeutralVillageEconomy(village,map);
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
  if(advanced.completed.length)state={...state,territoryOwnerByTile:projected.state.territoryOwnerByTile};
  const candidates=inspectV39VillagePlans(state,village,map,turn),active=candidates[0];
  if(active) {
    const old=village.planSchedule?.active;
    const plan={...active.plan,instanceId:old?.definitionId===active.row.ID?old.instanceId:`${village.id}:${active.row.ID}:${turn}`,
      startedTurn:old?.definitionId===active.row.ID?old.startedTurn:turn};
    village={...village,planSchedule:{active:plan,waiting:candidates.slice(1,3).map(item=>item.plan),lastTurn:turn}};
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
  } else village={...village,planSchedule:{active:null,waiting:[],lastTurn:turn}};
  return {state,village};
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
