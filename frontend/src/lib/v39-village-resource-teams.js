import balance from '../../../config/v39-npc-faction-ai.json';
import {normalizeV39Village} from './v39-economy-rules.js';
import {inspectV39VillagePlans} from './v39-village-plans.js';
import {inspectV39NpcReinforcementPlan} from './v39-npc-development-plan.js';
import {assignV39NpcResourceTeams,advanceV39NpcResourceTeams} from './v39-npc-resource-teams.js';
import {createV39Units} from './v39-unit-creation-rules.js';
import {advanceV39RecruitTraining} from './v39-recruit-training.js';
import {depositV39FactionCargo} from './v39-cargo-deposit.js';
import {getHexNeighborCoords} from './hex-grid.js';
import {resolveV39UnitMovementStepCost} from './v39-terrain-traversal.js';
import {advanceV39LandExpansionProjects} from './v39-land-expansion-rules.js';
import {inspectV39NpcResourceExpansion,startV39NpcResourceExpansion} from './v39-npc-resource-expansion.js';
import {rememberV39ResourceTeamVision} from './v39-resource-team-movement.js';

const alive=unit=>Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
const key=tile=>`${tile.x},${tile.y}`;
export function advanceV39VillageResourceTeams(source,village,map,turn){
  if(village.abandoned||village.incidentTest||!map?.grid||(source.activeWorldId||'surface')!=='surface'||Number(village.resourceOperations?.lastProcessedTurn)>=turn)return {state:source,village,reports:[]};
  const goals=inspectV39VillagePlans(source,village,map,turn).flatMap(({plan})=>(plan.needs||[]).map(need=>({name:need.resource,missing:need.amount,settlementId:village.id})));
  if(!goals.length&&!village.resourceOperations&&!village.landExpansionProjects?.length)return {state:source,village,reports:[]};
  const operations=village.resourceOperations||{},id=village.id;
  const units=(village.defenseUnits||[]).map(unit=>Number(unit.lastDefenseTurn||0)<turn&&Number(unit.lastResourceTurn||0)<turn
    ?{...unit,ap:unit.maxAp||100,currentAp:unit.maxAp||100}:unit);
  const assigned=new Set((operations.squads||[]).flatMap(row=>row.unitIds||[]));
  const squads=(operations.squads||[]).map(row=>({...row,unitIds:row.unitIds.filter(uid=>units.some(unit=>unit.id===uid))}));
  let solo=squads.find(row=>row.id==='solo');if(!solo){solo={id:'solo',unitIds:[],cargoByUnitId:{}};squads.push(solo);}
  solo.unitIds=[...solo.unitIds,...units.filter(unit=>!assigned.has(unit.id)).map(unit=>unit.id)];
  const base=normalizeV39Village({...village,placed:true,settlementId:id,
    populationByRace:village.populationByRace||{[village.race]:village.population},cityLevels:{...village.cityLevels,...village.researchLevels}},village.race);
  const player={id,race:village.race,isPlayer:false,factionState:{...operations,settlements:[base],selectedSettlementId:id,units,squads}};
  const owners={...source.territoryOwnerByTile};
  for(const tile of village.territoryTileKeys||[])if(!owners[tile])owners[tile]=id;
  // Remove the shadowed guards from collision lists, and discard the shadow player after execution.
  let state={...source,territoryOwnerByTile:owners,territoryStateByTile:{...source.territoryStateByTile},timeline:{...source.timeline,turnNumber:turn},players:[...(source.players||[]),player],
    neutralVillages:(source.neutralVillages||[]).filter(row=>row.id!==id)};
  state=rememberV39ResourceTeamVision(state,id,map);
  const advanced=advanceV39LandExpansionProjects(state,state.players.find(row=>row.id===id),base,map);
  const expanded={...advanced.settlement,territoryTileKeys:[...new Set([...(village.territoryTileKeys||[]),...advanced.completed.map(row=>row.tileKey)])]};
  state={...state,players:state.players.map(row=>row.id===id?{...row,factionState:{...row.factionState,settlements:[expanded]}}:row)};
  const expansion=startV39NpcResourceExpansion(state,id,map,goals);
  state=expansion.state;
  const occupied=new Set([...(source.players||[]).flatMap(row=>row.factionState.units||[]),...(source.enemies||[]),
    ...(source.neutralVillages||[]).flatMap(row=>row.defenseUnits||[])].filter(alive).map(key));
  const spots=[{x:village.x,y:village.y},...getHexNeighborCoords(map.w,map.h,village.x,village.y,false)];
  const deployment=new Map();
  const trained=advanceV39RecruitTraining({...state,players:[state.players.find(row=>row.id===id)]},turn,{canDeploy:unit=>{
    const spot=spots.find(tile=>!occupied.has(key(tile))&&owners[key(tile)]===id
      &&Number.isFinite(resolveV39UnitMovementStepCost(map,village.x,village.y,tile.x,tile.y,unit)));
    if(!spot)return false;
    occupied.add(key(spot));deployment.set(unit.id,spot);return true;
  }}).state.players[0];
  state={...state,players:state.players.map(row=>row.id===id?trained:row)};
  let current=state.players.find(row=>row.id===id),queue=[...(current.factionState.unitTrainingQueue||[])];
  const placed=current.factionState.units.filter(unit=>{
    if(units.some(old=>old.id===unit.id))return true;
    const spot=deployment.get(unit.id);
    if(!spot){const pending=operations.unitTrainingQueue?.find(entry=>entry.unit.id===unit.id);if(pending)queue.push(pending);return false;}
    Object.assign(unit,spot,{squadId:'solo',neutral:true,isNeutralVillageGuard:true,neutralVillageId:id,ownerNeutralVillageId:id});occupied.add(key(spot));
    solo.unitIds.push(unit.id);return true;
  });
  state={...state,players:state.players.map(row=>row.id===id?{...row,factionState:{...row.factionState,units:placed,unitTrainingQueue:queue,squads}}:row)};
  state=assignV39NpcResourceTeams(state,id,goals,map,{maxTeams:balance.resourceTeams.villageMaxTeams,minimumUnits:balance.resourceTeams.reserveUnits}).state;
  current=state.players.find(row=>row.id===id);
  const recruitment=inspectV39NpcReinforcementPlan(state,current,{foodPolicy:false});
  const reports=[...advanced.completed.map(project=>({type:'village-resource-expansion-completed',villageId:id,tileKey:project.tileKey})),
    ...expansion.commands.map(message=>({type:'village-resource-expansion-started',villageId:id,message}))];
  if(goals.length&&recruitment.status==='ready'&&recruitment.request.mode==='army'){
    const result=createV39Units(state,id,recruitment.request);
    if(result.ok){state=result.state;reports.push({type:'village-resource-training',villageId:id,unitId:result.queuedUnits[0]?.id});}
  }
  const result=advanceV39NpcResourceTeams(state,id,map,turn);
  state=depositV39FactionCargo(result.state,id).state;
  current=state.players.find(row=>row.id===id);const faction=current.factionState,settlement=faction.settlements[0];
  const workerIds=new Set((faction.aiState.resourceTeams||[]).flatMap(team=>team.unitIds));
  const defenseUnits=faction.units.map(unit=>workerIds.has(unit.id)?{...unit,lastResourceTurn:turn,lastDefenseTurn:turn}:unit);
  const {units:ignored,settlements:ignoredBases,...persist}=faction;
  const nextVillage={...village,population:settlement.population,populationByRace:settlement.populationByRace,
    foodStockByType:settlement.foodStockByType,materialStockByType:settlement.materialStockByType,equipmentInventory:settlement.equipmentInventory,
    territoryTileKeys:settlement.territoryTileKeys,territoryTileModeMap:settlement.territoryTileModeMap,landExpansionProjects:settlement.landExpansionProjects,
    defenseUnits,resourceOperations:{...persist,resourceExpansion:inspectV39NpcResourceExpansion(state,current,map,goals).map(({tile,...summary})=>summary),
      recruitment:{status:recruitment.status,reasons:recruitment.reasons,className:recruitment.className},lastCommands:[...expansion.commands,...result.commands],lastProcessedTurn:turn}};
  reports.push(...result.commands.map(message=>({type:'village-resource-task',villageId:id,message})));
  return {state:{...state,players:state.players.filter(row=>row.id!==id),neutralVillages:source.neutralVillages},village:nextVillage,reports};
}
