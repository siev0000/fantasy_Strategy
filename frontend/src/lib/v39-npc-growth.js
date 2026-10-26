import balance from '../../../config/v39-npc-faction-ai.json';
import {getGameDataRows} from './game-data-registry.js';
import {getSelectedSettlement} from './settlement-state.js';
import {canV39FactionAttack} from './v39-diplomacy-rules.js';
import {getHexDistance} from './hex-grid.js';
import {getV39ClassPromotionOptions,acquireV39UpperClass} from './v39-class-progression.js';
import {craftV39Equipment,changeV39UnitEquipment,rerollV39MobEquipment,createV39EquipmentEntry,V39_EQUIPMENT_RARITIES,getV39EquipmentRarity} from './v39-equipment-rules.js';
import {isMobUnit} from '../composables/unitCoreUtils.js';
import {isV39UnitInsideSettlement} from './v39-transport-rules.js';
import {getV39SquadMemberRestriction} from './v39-squad-edit-rules.js';
import {getV39NpcUnitCargo,getV39NpcResourceUnitIds,getV39NpcIncomingResource} from './v39-npc-resource-teams.js';
import {isV39CargoEmpty} from './v39-logistics-state.js';
import {getV39DiscoveryRequirement,createV39DiscoveryCheck} from './v39-research-discovery.js';
import {v39SpecialtyDefinitions,parseV39SpecialtyTerrainConditions} from './v39-specialty-rules.js';
import {createV39ClimateLookup,matchesV39ClimateConditions} from './v39-climate-conditions.js';
import {getV39SurveyTileKeys,startV39SurveyTask,inspectV39Survey} from './v39-exploration-rules.js';
import {moveV39ResourceTeam} from './v39-resource-team-movement.js';
import {researchTreeData} from './research-tree-config.js';
import {normalizeResearchState,findResearchItem,isResearchCompleted,inspectResearchUnlock,selectResearch,resolveCompletedResearchLevel} from './research-progress.js';

const n=value=>Number(value)||0;
const playerOf=(state,id)=>state.players.find(row=>row.id===id);
const alive=unit=>n(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
const key=tile=>`${tile.x},${tile.y}`;
const patchAi=(state,id,patch)=>({...state,players:state.players.map(row=>row.id!==id?row:{...row,factionState:{...row.factionState,aiState:{...row.factionState.aiState,...patch}}})});
const researchItems=Object.entries(researchTreeData.categories).flatMap(([categoryKey,category])=>category.levels.flatMap(level=>level.items.map(item=>({categoryKey,level:level.level,item}))));

export function inspectV39NpcEquipmentPlan(player,development){
  const base=getSelectedSettlement(player.factionState);if(!base?.placed)return null;
  const settlementId=base.settlementId||base.id;
  const reserve=development.supplyBudgetBySettlement?.[settlementId]||{};
  for(const unit of player.factionState.units||[]){
    if(!alive(unit)||unit.summon||unit.isSummoned||(unit.worldId||'surface')!=='surface'||getV39SquadMemberRestriction(player.factionState,unit,'surface')||unit.surveyTask)continue;
    const equipment=unit.equipment||[];
    if(!equipment.length)continue;
    const mob=isMobUnit(unit),current=mob?Math.max(...equipment.map(item=>getV39EquipmentRarity(item.quality).level)):0;
    const item=mob?null:equipment.find(item=>V39_EQUIPMENT_RARITIES.some(rarity=>rarity.level>getV39EquipmentRarity(item.quality).level)&&!item.enchantments?.length);
    const rarity=V39_EQUIPMENT_RARITIES.find(row=>row.level>(mob?current:getV39EquipmentRarity(item?.quality).level));
    if(!rarity||!mob&&!item)continue;
    const templates=mob?(()=>{const row=getGameDataRows('クラス').find(row=>row.名前===unit.className);return ['武器1','武器2','頭','体','足','装飾1','装飾2'].map(slot=>createV39EquipmentEntry(row?.[slot],rarity.key,slot)).filter(Boolean);})()
      :[createV39EquipmentEntry(item.name,rarity.key,item.slot)].filter(Boolean);
    if(!templates.length)continue;
    const inventory=mob?null:base.equipmentInventory?.find(entry=>entry.count>0&&entry.name===item.name&&entry.quality===rarity.key);
    const cost={};if(!inventory)for(const template of templates)for(const [name,amount] of Object.entries(template.craftCostMaterial))cost[name]=n(cost[name])+n(amount);
    const shortages=Object.entries(cost).filter(([,amount])=>amount>0).map(([name,amount])=>{
      const stock=n(base.materialStockByType?.[name]),required=amount+n(reserve[name]);
      return {name,stock,required,missing:Math.max(0,required-stock),settlementId,purpose:'装備更新',priority:-1};
    }).filter(row=>row.missing>0);
    return {unitId:unit.id,name:item?.name||'固定装備一新',slot:item?.slot,rarity:rarity.key,level:rarity.level,mob,cost,shortages,inventoryKey:inventory?.key,
      atBase:isV39UnitInsideSettlement(unit,base),
      researchReady:!!inventory||Math.max(n(base.cityLevels?.鍛冶Lv),resolveCompletedResearchLevel(player.factionState.research,'鍛冶Lv'))>=rarity.level};
  }
  return null;
}

// Follow the data's prerequisite graph; never complete a research node by assigning its level directly.
export function selectV39NpcRequiredResearch(source,requests,assignee){
  let research=normalizeResearchState(source);const commands=[];
  const done=row=>isResearchCompleted(research,row.categoryKey,row.level,row.item.id);
  const next=(row,seen=new Set())=>{
    if(!row||done(row)||seen.has(row.item.id))return null;
    const path=new Set([...seen,row.item.id]);
    for(const id of row.item.prerequisiteIds||[]){const parent=findResearchItem(id);if(parent&&!done(parent)){const choice=next(parent,path);if(choice)return choice;}}
    if(inspectResearchUnlock(research,row.item.id).unlocked)return row;
    return researchItems.find(candidate=>candidate.categoryKey===row.categoryKey&&candidate.level<row.level&&!done(candidate)&&inspectResearchUnlock(research,candidate.item.id).unlocked)||null;
  };
  for(const request of requests){
    const target=researchItems.find(row=>(row.categoryKey===request.category||row.item.id.startsWith(`${request.category.replace(/Lv$/,'')}Lv:`))&&row.level>=request.level);
    const chosen=next(target);if(!chosen||research.selection[chosen.categoryKey]||!assignee)continue;
    const selected=selectResearch(research,chosen.categoryKey,chosen.item.id,assignee);
    if(selected.changed){research=selected.state;commands.push(`優先研究:${chosen.item.name}`);}
  }
  return {research,commands};
}

export function inspectV39NpcRareResourcePlan(state,player,map,goals){
  const definitions=v39SpecialtyDefinitions(),check=createV39DiscoveryCheck(player.factionState),exploration=player.factionState.exploration||{};
  if(!map?.grid)return null;
  const need=goals.find(goal=>goal.missing>getV39NpcIncomingResource(player,goal.settlementId,goal.name)&&definitions.some(row=>row.名前===goal.name&&row.分類==='特殊資源'));
  if(!need)return null;
  const definition=definitions.find(row=>row.名前===need.name),requirement=getV39DiscoveryRequirement(definition);
  if(!check.feature(definition))return {resource:need.name,status:'研究待ち',requirement};
  const discovered=Object.entries(exploration.discoveredSpecialtiesByTile||{}).find(([,site])=>site.name===need.name);
  if(discovered)return {resource:need.name,status:state.territoryOwnerByTile?.[discovered[0]]===player.id?'産出待ち':'発見済み・確保待ち',tileKey:discovered[0],requirement};
  const surveyed=new Set(exploration.surveyedTileKeys||[]),conditions=parseV39SpecialtyTerrainConditions(definition.出現地形),climateAt=createV39ClimateLookup(map);
  const blocked=player.factionState.aiState?.growthPlan?.surveyBlockedUntilByTile||{};
  const candidates=(player.factionState.visibility?.exploredTileKeys||[]).filter(tileKey=>!surveyed.has(tileKey)&&n(blocked[tileKey])<=n(state.timeline?.turnNumber)).map(tileKey=>{
    const [x,y]=tileKey.split(',').map(Number);return {x,y,key:tileKey};
  }).filter(tile=>{
    const terrains=[map.grid?.[tile.y]?.[tile.x],map.specialMap?.[tile.y]?.[tile.x]],height=n(map.heightLevelMap?.[tile.y]?.[tile.x]);
    return conditions.some(condition=>terrains.includes(condition.terrain)&&height>=condition.min&&height<=condition.max)
      &&(definition.最低高度==null||definition.最低高度===''||height>=n(definition.最低高度))&&(definition.最高高度==null||definition.最高高度===''||height<=n(definition.最高高度))
      &&matchesV39ClimateConditions(definition,climateAt(tile.x,tile.y));
  });
  const actor=player.factionState.units.find(alive);
  candidates.sort((a,b)=>getHexDistance(actor||{},a)-getHexDistance(actor||{},b)||a.key.localeCompare(b.key));
  return {resource:need.name,status:candidates.length?'調査候補あり':'適地未発見',requirement,candidates:candidates.slice(0,balance.growth.surveyCandidateLimit)};
}

export function advanceV39NpcGrowth(source,playerId,map,turn,development){
  let state=source,player=playerOf(state,playerId);const commands=[],context={aiTurn:true,turnNumber:turn};
  if(!balance.growth.enabled||player?.isPlayer!==false||(state.activeWorldId||'surface')!=='surface')return {state,commands,resourceGoals:[],busyIds:[]};
  let promotionReturn=null;
  for(const unit of player.factionState.units.filter(alive)){
    if(unit.summon||unit.isSummoned)continue;
    const promotion=getV39ClassPromotionOptions(state,playerId,unit,context).find(row=>row.available);
    if(!promotion){
      if(!promotionReturn&&!unit.surveyTask&&!getV39SquadMemberRestriction(player.factionState,unit,'surface')
        &&!getV39NpcResourceUnitIds(player).has(unit.id)&&isV39CargoEmpty(getV39NpcUnitCargo(player,unit))){
        const base=player.factionState.settlements.find(base=>base.placed&&(base.worldId||'surface')==='surface'
          &&!isV39UnitInsideSettlement(unit,base)&&getV39ClassPromotionOptions(state,playerId,{...unit,x:base.x,y:base.y},context).some(row=>row.available));
        if(base)promotionReturn={unit,base};
      }
      continue;
    }
    const result=acquireV39UpperClass(state,playerId,unit.id,promotion.row.名前,context);
    if(result.ok){state=result.state;commands.push(`上位職取得:${unit.name} / ${result.message}`);break;}
  }
  player=playerOf(state,playerId);
  const equipment=inspectV39NpcEquipmentPlan(player,development),requests=[];
  if(equipment&&!equipment.researchReady)requests.push({category:'鍛冶Lv',level:equipment.level});
  const equipmentReady=!player.factionState.aiState?.lastEquipmentTurn||turn>=n(player.factionState.aiState.lastEquipmentTurn)+balance.growth.equipmentCooldownTurns;
  if(equipment?.atBase&&equipment.researchReady&&!equipment.shortages.length&&equipmentReady){
    let result;
    if(equipment.mob)result=rerollV39MobEquipment(state,playerId,{unitId:equipment.unitId,rarity:equipment.rarity});
    else{
      const crafted=equipment.inventoryKey?{ok:true,state}:craftV39Equipment(state,playerId,{name:equipment.name,rarity:equipment.rarity,count:1});
      if(crafted.ok)result=changeV39UnitEquipment(crafted.state,playerId,{unitId:equipment.unitId,slot:equipment.slot,name:equipment.name,rarity:equipment.rarity,inventoryKey:equipment.inventoryKey});
    }
    if(result?.ok){state=patchAi(result.state,playerId,{lastEquipmentTurn:turn});commands.push(`装備更新:${equipment.unitId} / ${equipment.name} / ${equipment.rarity}`);}
  }
  player=playerOf(state,playerId);
  const resourceGoals=equipment?.shortages||[];
  const rare=inspectV39NpcRareResourcePlan(state,player,map,[...development.resourceGoals,...resourceGoals]);
  if(rare?.status==='研究待ち')requests.unshift(rare.requirement);
  const research=selectV39NpcRequiredResearch(player.factionState.research,requests,player.factionState.units.filter(alive).sort((a,b)=>n(b.level)-n(a.level))[0]);
  if(research.commands.length){state={...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:{...row.factionState,research:research.research}}:row)};commands.push(...research.commands);}
  const busyIds=[];
  const surveyBlockedUntilByTile=Object.fromEntries(Object.entries(player.factionState.aiState?.growthPlan?.surveyBlockedUntilByTile||{}).filter(([,until])=>n(until)>turn));
  const reserveGroup=actor=>{
    const squad=player.factionState.squads?.find(row=>row.id!=='solo'&&row.unitIds?.includes(actor.id));
    busyIds.push(...(squad?.unitIds||[actor.id]));
  };
  const threatened=actor=>[...(state.enemies||[]),...(state.neutralVillages||[]).filter(village=>village.hostilePlayerIds?.includes(playerId)).flatMap(village=>village.defenseUnits||[]),
    ...state.players.filter(row=>row.id!==playerId&&canV39FactionAttack(state,playerId,row.id)).flatMap(row=>row.factionState.units||[])]
    .some(enemy=>alive(enemy)&&(enemy.worldId||'surface')==='surface'&&getHexDistance(actor,enemy)<=5);
  if(promotionReturn&&!threatened(promotionReturn.unit)){
    const {unit,base}=promotionReturn;reserveGroup(unit);
    for(let step=0;step<balance.scouting.maxStepsPerTurn;step++){
      const current=playerOf(state,playerId).factionState.units.find(row=>row.id===unit.id);
      if(isV39UnitInsideSettlement(current,base))break;
      const moved=moveV39ResourceTeam(state,playerId,unit.id,base,map);if(!moved)break;state=moved;
    }
    commands.push(`上位職取得のため帰還:${unit.name}→${base.name}`);
  }
  if(equipment&&!equipment.atBase&&equipment.researchReady&&!equipment.shortages.length
    &&equipmentReady){
    const actor=player.factionState.units.find(row=>row.id===equipment.unitId),workers=getV39NpcResourceUnitIds(player);
    if(!busyIds.includes(actor.id)&&!threatened(actor)&&!workers.has(actor.id)&&isV39CargoEmpty(getV39NpcUnitCargo(player,actor))){
      const base=getSelectedSettlement(player.factionState);reserveGroup(actor);
      for(let step=0;step<balance.scouting.maxStepsPerTurn;step++){
        if(isV39UnitInsideSettlement(playerOf(state,playerId).factionState.units.find(row=>row.id===actor.id),base))break;
        const moved=moveV39ResourceTeam(state,playerId,actor.id,base,map);if(!moved)break;state=moved;
      }
      commands.push(`装備更新のため帰還:${actor.name}→${base.name}`);
    }
  }
  if(rare?.candidates?.length){
    player=playerOf(state,playerId);const workers=getV39NpcResourceUnitIds(player);
    const available=unit=>alive(unit)&&(unit.worldId||'surface')==='surface'&&!unit.movementHold&&!busyIds.includes(unit.id)&&!workers.has(unit.id)&&!getV39SquadMemberRestriction(player.factionState,unit,'surface')&&isV39CargoEmpty(getV39NpcUnitCargo(player,unit));
    const actor=player.factionState.units.find(unit=>unit.surveyTask&&alive(unit)&&(unit.worldId||'surface')==='surface')||player.factionState.units.find(available);
    if(actor){
      reserveGroup(actor);
      if(!actor.surveyTask){
        const target=rare.candidates[0],within=getV39SurveyTileKeys(actor,map).includes(target.key);
        if(!within){for(let step=0;step<balance.scouting.maxStepsPerTurn;step++){
          const moved=moveV39ResourceTeam(state,playerId,actor.id,{type:'resource-survey',x:target.x,y:target.y},map);if(!moved)break;state=moved;
          const current=playerOf(state,playerId).factionState.units.find(row=>row.id===actor.id);if(getV39SurveyTileKeys(current,map).includes(target.key))break;
        }}
        const current=playerOf(state,playerId).factionState.units.find(row=>row.id===actor.id);
        if(!within&&current.x===actor.x&&current.y===actor.y&&n(current.ap??current.currentAp)>0){
          surveyBlockedUntilByTile[target.key]=turn+balance.growth.surveyRetryTurns;rare.status='経路待ち・別候補へ';
        }
        if(getV39SurveyTileKeys(current,map).includes(target.key)){
          const survey=startV39SurveyTask(state,playerId,current.id,current,map,context);
          if(survey.ok){state=survey.state;commands.push(`上位資源調査:${rare.resource}@${key(current)}`);}
        }
      }
      rare.actorId=actor.id;
      const current=playerOf(state,playerId).factionState.units.find(row=>row.id===actor.id);
      if(actor.surveyTask&&inspectV39Survey(state,playerId,current.id,current,map,context).available){
        const continued=startV39SurveyTask(state,playerId,current.id,current,map,context);
        if(continued.ok){state=continued.state;commands.push(`上位資源調査を継続:${rare.resource}@${key(current)}`);}
      }
    }else rare.status='調査要員待ち';
  }
  const {candidates,...rareSummary}=rare||{};
  state=patchAi(state,playerId,{growthPlan:{equipment,rare:rare?rareSummary:null,researchRequests:requests,busyIds,surveyBlockedUntilByTile}});
  if(rare)commands.push(`上位資源:${rare.resource} / ${rare.status}`);
  return {state,commands,resourceGoals,busyIds};
}
