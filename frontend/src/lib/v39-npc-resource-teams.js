import balance from '../../../config/v39-npc-faction-ai.json';
import {getFactionSettlements,replaceFactionSettlement} from './settlement-state.js';
import {getHexDistance} from './hex-grid.js';
import {collectV39FactionVision} from './v39-faction-intelligence-rules.js';
import {inspectV39Gather,gatherV39Resources} from './v39-gather-rules.js';
import {recoverV39GroundLootState} from './v39-ground-loot-recovery.js';
import {getV39EditableSquads,editV39Squad,getV39SquadMemberRestriction} from './v39-squad-edit-rules.js';
import {advanceV39SquadRallies} from './v39-squad-coordination.js';
import {normalizeV39Cargo,isV39CargoEmpty,resolveV39UnitCargoCapacity,addV39CargoToFactionUnit,setV39CargoDeliveryTarget} from './v39-logistics-state.js';
import {moveV39ResourceTeam,rememberV39ResourceTeamVision} from './v39-resource-team-movement.js';
import {isV39UnitInsideSettlement,loadV39SettlementResource,V39_TRANSPORT_RESOURCE_KEYS} from './v39-transport-rules.js';
import {FOOD_RESOURCE_KEYS} from './v39-economy-rules.js';
import {isV39HarvestResource} from './v39-specialty-rules.js';

const n=value=>Number(value)||0;
const key=unit=>`${unit.x},${unit.y}`;
const alive=unit=>n(unit?.hp??unit?.currentHp)>0&&unit.state!=='死亡';
const getPlayer=(state,id)=>state.players.find(row=>row.id===id);
export function getV39NpcResourceUnitIds(player){
  return new Set((player?.factionState.aiState?.resourceTeams||[]).flatMap(row=>row.unitIds||[]));
}
export function getV39NpcUnitCargo(player,unit){
  const squad=player.factionState.squads?.find(row=>row.unitIds?.includes(unit.id));
  return normalizeV39Cargo(squad?.id==='solo'?squad.cargoByUnitId?.[unit.id]:squad?.cargo);
}

export function getV39NpcIncomingResource(player,settlementId,resource){
  const seen=new Set();let total=0;
  for(const contract of player.factionState.tradeContracts||[]){
    if(contract.status!=='active'||contract.ownerId!==player.id||contract.sides?.[0]?.settlementId!==settlementId)continue;
    total+=n(contract.sides[1]?.goods?.[resource]);
  }
  for(const team of player.factionState.aiState?.resourceTeams||[]){
    if(team.settlementId!==settlementId)continue;
    const actor=player.factionState.units.find(unit=>unit.id===team.actorId);if(!alive(actor))continue;
    const squad=player.factionState.squads?.find(row=>row.unitIds?.includes(actor.id));
    const id=squad?.id==='solo'?actor.id:squad?.id;
    if(!id||seen.has(id))continue;seen.add(id);
    total+=n(getV39NpcUnitCargo(player,actor).resourcesByType[resource]);
  }
  return total;
}

export function selectV39NpcInternalSupply(player,team){
  if(player?.isPlayer!==false||!balance.internalSupply.enabled||!V39_TRANSPORT_RESOURCE_KEYS.includes(team.resource))return null;
  const actor=player.factionState.units.find(unit=>unit.id===team.actorId);if(!alive(actor))return null;
  const bases=getFactionSettlements(player.factionState),destination=bases.find(base=>(base.settlementId||base.id)===team.settlementId);
  if(!destination?.placed||(destination.worldId||'surface')!==(actor.worldId||'surface'))return null;
  const needed=Math.max(0,n(team.missing)-getV39NpcIncomingResource(player,team.settlementId,team.resource));
  if(!needed)return null;
  const field=FOOD_RESOURCE_KEYS.includes(team.resource)?'foodStockByType':'materialStockByType';
  const budgets=player.factionState.aiState?.supplyBudgetBySettlement||{};
  const source=bases.filter(base=>base!==destination&&base.placed&&(base.worldId||'surface')===(actor.worldId||'surface')
    &&(!base.ownerPlayerId||base.ownerPlayerId===player.id)&&Number.isInteger(base.x)&&Number.isInteger(base.y)
    &&budgets[base.settlementId||base.id]&&n(base[field]?.[team.resource])>n(budgets[base.settlementId||base.id][team.resource]))
    .sort((a,b)=>getHexDistance(actor,a)-getHexDistance(actor,b)||(a.settlementId||a.id).localeCompare(b.settlementId||b.id))[0];
  if(!source)return null;
  return {type:'resource-team-supply',resource:team.resource,actorId:actor.id,x:source.x,y:source.y,targetName:source.name,
    sourceSettlementId:source.settlementId||source.id,destinationSettlementId:team.settlementId,destinationName:destination.name,maxAmount:needed};
}

// Multiple purposes may describe the same stock requirement; do not count it twice.
export function inspectV39NpcResourceWorkforce(goals,player,{maxTeams=balance.resourceTeams.maxTeams,minimumUnits=balance.unitTarget}={}){
  const cfg=balance.resourceTeams,needs=new Map(),destinations=getFactionSettlements(player.factionState);
  for(const goal of goals||[]){
    const destination=destinations.find(base=>(base.settlementId||base.id)===goal.settlementId);
    if(destination&&(destination.worldId||'surface')!=='surface')continue;
    const missing=Math.max(0,n(goal.missing));if(!missing)continue;
    const id=`${goal.settlementId||''}:${goal.name}`;
    const prior=needs.get(id);
    needs.set(id,{resource:goal.name,settlementId:goal.settlementId,missing:Math.max(missing,n(prior?.missing)),priority:Math.max(n(goal.priority),n(prior?.priority))});
  }
  const jobs=[];
  for(const need of [...needs.values()].sort((a,b)=>b.priority-a.priority||b.missing-a.missing||a.resource.localeCompare(b.resource))){
    const count=Math.min(cfg.maxTeamsPerResource,Math.ceil(need.missing/cfg.resourcesPerArmy));
    for(let i=0;i<count;i++)jobs.push({...need,id:`resource:${need.settlementId||'home'}:${need.resource}:${i}`});
  }
  const carrying=(player?.factionState.aiState?.resourceTeams||[]).filter(team=>!jobs.some(job=>job.id===team.id)
    &&team.unitIds?.some(id=>{const unit=player.factionState.units.find(row=>row.id===id);return alive(unit)&&!isV39CargoEmpty(getV39NpcUnitCargo(player,unit));}));
  const candidateJobs=[...carrying,...jobs],assignments=candidateJobs.slice(0,maxTeams);
  return {jobs:assignments,candidateJobs,targetUnits:assignments.length?Math.min(cfg.maxUnits,Math.max(minimumUnits,cfg.reserveUnits+assignments.length)):minimumUnits};
}

export function assignV39NpcResourceTeams(state,playerId,goals,map,options={}){
  let player=getPlayer(state,playerId);
  if(player?.isPlayer!==false||(state.activeWorldId||'surface')!=='surface')return {state,teams:[]};
  if(options.supplyBudgetBySettlement)player={...player,factionState:{...player.factionState,aiState:{...player.factionState.aiState,supplyBudgetBySettlement:options.supplyBudgetBySettlement}}};
  const cfg=balance.resourceTeams,work=inspectV39NpcResourceWorkforce(goals,player,options);
  const old=player.factionState.aiState?.resourceTeams||[],all=getV39EditableSquads(player.factionState);
  const eligible=unit=>alive(unit)&&!unit.isSovereign&&!unit.isNamed&&!unit.summon&&!unit.surveyTask
    &&!player.factionState.aiState?.growthPlan?.busyIds?.includes(unit.id)
    &&!getV39SquadMemberRestriction(player.factionState,unit,'surface')
    &&Number.isInteger(unit.x)&&Number.isInteger(unit.y)
    &&['army','elite_army'].includes(unit.combatProfile?.mode);
  const candidates=player.factionState.units.filter(eligible).sort((a,b)=>a.id.localeCompare(b.id));
  const living=player.factionState.units.filter(alive).length;
  const reserve=balance.foodPriority.enabled&&goals.some(goal=>n(goal.priority)===1)
    ?Math.min(cfg.reserveUnits,Math.max(0,n(balance.foodPriority.constructionReserveUnits??cfg.reserveUnits))):cfg.reserveUnits;
  const capacity=Math.max(0,living-reserve),used=new Set(),teams=[];
  const jobs=work.candidateJobs.map(job=>{
    const actor=candidates.find(unit=>old.find(row=>row.id===job.id)?.unitIds?.includes(unit.id))
      ||candidates.find(unit=>isV39CargoEmpty(getV39NpcUnitCargo(player,unit)))||candidates[0];
    const objective=actor&&selectV39NpcTeamResourceObjective(state,player,{...job,actorId:actor.id},map);
    // Returning real cargo first; known obtainable supplies outrank searches with no source.
    const priority=objective?.type==='resource-team-return'?3:['resource-team-supply','resource-team-loot','resource-team-gather'].includes(objective?.type)?2:objective?.type==='resource-team-search'?1:0;
    return {job,priority};
  }).sort((a,b)=>b.priority-a.priority||n(b.job.priority)-n(a.job.priority)).slice(0,options.maxTeams??cfg.maxTeams);
  for(const {job} of jobs){
    const prior=old.find(row=>row.id===job.id);
    let members=(prior?.unitIds||[]).map(id=>candidates.find(unit=>unit.id===id)).filter(unit=>unit&&!used.has(unit.id));
    if(!members.length){
      const reusable=all.find(squad=>squad.npcResourceTeam&&squad.unitIds.length<=capacity-used.size&&isV39CargoEmpty(squad.cargo)
        &&squad.unitIds.every(id=>!used.has(id)&&candidates.some(unit=>unit.id===id)));
      const unit=candidates.find(unit=>!used.has(unit.id)&&all.find(row=>row.unitIds.includes(unit.id))?.id==='solo');
      if(reusable)members=reusable.unitIds.map(id=>candidates.find(unit=>unit.id===id));
      else if(unit)members=[unit];
    }
    members=members.slice(0,Math.max(0,capacity-used.size));
    for(const member of members)used.add(member.id);
    teams.push({...job,unitIds:members.map(unit=>unit.id),actorId:members[0]?.id||'',role:'探索',status:members.length?'準備':'軍隊訓練待ち'});
  }
  // Reinforce already staffed jobs only after each resource has a worker.
  for(const team of teams){
    if(!team.actorId||teams.some(row=>!row.actorId)||used.size>=capacity)continue;
    const actor=player.factionState.units.find(unit=>unit.id===team.actorId);
    if(!isV39CargoEmpty(getV39NpcUnitCargo(player,actor)))continue;
    const escort=candidates.find(unit=>!used.has(unit.id)&&all.find(row=>row.unitIds.includes(unit.id))?.id==='solo'
      &&getHexDistance(actor,unit)<=1);
    if(!escort||team.unitIds.length>=cfg.escortMembers)continue;
    const edit=editV39Squad(state,playerId,{unitIds:[...team.unitIds,escort.id],label:`${team.resource}確保隊`,movementLeaderId:actor.id},map,{aiTurn:true});
    if(edit.ok){
      state={...edit.state,players:edit.state.players.map(row=>row.id!==playerId?row:{...row,factionState:{...row.factionState,
        squads:row.factionState.squads.map(squad=>squad.id===edit.squadId?{...squad,npcResourceTeam:true}:squad)}})};
      player=getPlayer(state,playerId);team.unitIds.push(escort.id);used.add(escort.id);
    }
  }
  // Release assignment metadata, not squads/cargo, when a deficit has been resolved.
  state={...state,players:state.players.map(row=>row.id!==playerId?row:{...row,factionState:{...row.factionState,
    aiState:{...row.factionState.aiState,resourceTeams:teams,resourceUnitTarget:work.targetUnits,
      supplyBudgetBySettlement:options.supplyBudgetBySettlement||row.factionState.aiState?.supplyBudgetBySettlement||{}}}})};
  return {state,teams};
}

export function selectV39NpcTeamResourceObjective(state,player,team,map,reservedTiles=new Set()){
  const actor=player.factionState.units.find(unit=>unit.id===team.actorId);
  if(!alive(actor))return null;
  const home=getFactionSettlements(player.factionState).find(base=>base.placed&&(base.settlementId||base.id)===team.settlementId)
    ||getFactionSettlements(player.factionState).find(base=>base.placed&&(base.worldId||'surface')==='surface');
  if(!isV39CargoEmpty(getV39NpcUnitCargo(player,actor)))return home?{type:'resource-team-return',actorId:actor.id,x:home.x,y:home.y,targetName:home.name,resource:team.resource}:null;
  if(n(team.missing)>0&&getV39NpcIncomingResource(player,team.settlementId,team.resource)>=n(team.missing))
    return {type:'resource-team-supply-wait',actorId:actor.id,x:actor.x,y:actor.y,targetName:'不足分は搬入中',resource:team.resource};
  const supply=selectV39NpcInternalSupply(player,team);if(supply)return supply;
  const periodic=Object.entries(player.factionState.exploration?.discoveredSpecialtiesByTile||{}).find(([tile,site])=>site.name===team.resource&&isV39HarvestResource(site)
    &&(!state.territoryOwnerByTile?.[tile]||state.territoryOwnerByTile[tile]===player.id));
  if(periodic)return {type:'resource-team-supply-wait',actorId:actor.id,x:actor.x,y:actor.y,targetName:'発見済み資源の領有・周期産出待ち',resource:team.resource};
  const vision=player.factionState.visibility?.visibleTileKeys
    ?new Set(player.factionState.visibility.visibleTileKeys):collectV39FactionVision(state,player.id,map).visible;
  const explored=new Set([...(player.factionState.visibility?.exploredTileKeys||[]),...vision]);
  const loot=Object.entries(state.groundLootByTile||{}).filter(([tile,row])=>!reservedTiles.has(tile)&&row.discoveredByPlayerIds?.includes(player.id)&&n(row.cargo?.resourcesByType?.[team.resource])>0)
    .map(([tile])=>{const [x,y]=tile.split(',').map(Number);return {x,y};}).sort((a,b)=>getHexDistance(actor,a)-getHexDistance(actor,b))[0];
  if(loot)return {type:'resource-team-loot',actorId:actor.id,...loot,targetName:`${team.resource}の残留品`,resource:team.resource};
  const tiles=[...explored].map(tile=>{const [x,y]=tile.split(',').map(Number);return {x,y};})
    .filter(tile=>!reservedTiles.has(key(tile))&&!state.territoryOwnerByTile?.[key(tile)]
      &&!(state.players||[]).some(row=>n(row.factionState.exploration?.gatheredAtTurnByTile?.[key(tile)])===n(state.timeline?.turnNumber))
      &&(String(map.grid?.[tile.y]?.[tile.x]).includes('森')
      ||player.factionState.exploration?.discoveredFeaturesByTile?.[key(tile)]?.name?.includes('洞窟')))
    .sort((a,b)=>getHexDistance(actor,a)-getHexDistance(actor,b)).slice(0,balance.resourceTeams.sourceCandidateLimit);
  for(const tile of tiles){
    const trial={...state,players:state.players.map(row=>row.id!==player.id?row:{...row,factionState:{...row.factionState,
      units:row.factionState.units.map(unit=>unit.id!==actor.id?unit:{...unit,...tile})}})};
    const check=inspectV39Gather(trial,player.id,actor.id,map,{aiTurn:true,resource:team.resource});
    if(n(check.yields[team.resource])>0)return {type:'resource-team-gather',actorId:actor.id,...tile,targetName:`${team.resource}の採取地`,resource:team.resource};
  }
  return {type:'resource-team-search',actorId:actor.id,targetName:`${team.resource}の供給元探索`,resource:team.resource,x:null,y:null};
}

export function executeV39NpcTeamResourceAction(state,playerId,objective,map,task){
  if(!objective||getPlayer(state,playerId)?.isPlayer!==false)return null;
  const actor=getPlayer(state,playerId).factionState.units.find(row=>row.id===objective.actorId);
  if(!actor||actor.x!==objective.x||actor.y!==objective.y)return null;
  const player=getPlayer(state,playerId),team=task||player.factionState.aiState?.resourceTeams?.find(row=>row.actorId===actor.id);
  if(objective.type==='resource-team-supply'){
    const current=team&&selectV39NpcInternalSupply(player,team);
    if(!current||current.sourceSettlementId!==objective.sourceSettlementId)return null;
    const source=getFactionSettlements(player.factionState).find(base=>(base.settlementId||base.id)===current.sourceSettlementId);
    if(!isV39UnitInsideSettlement(actor,source))return null;
    const squad=player.factionState.squads.find(row=>row.unitIds?.includes(actor.id));
    if(!squad)return null;
    const crew=squad.id==='solo'?[actor]:player.factionState.units.filter(unit=>squad.unitIds.includes(unit.id)&&alive(unit));
    if(crew.some(unit=>(unit.worldId||'surface')!==(source.worldId||'surface')||!isV39UnitInsideSettlement(unit,source)&&getHexDistance(unit,source)>1))return null;
    const capacity=crew.reduce((sum,unit)=>sum+resolveV39UnitCargoCapacity(unit,state),0);
    const cargo=getV39NpcUnitCargo(player,actor),reserve=n(player.factionState.aiState.supplyBudgetBySettlement[current.sourceSettlementId]?.[current.resource]);
    const loaded=loadV39SettlementResource(source,player.race,current.resource,cargo,capacity,{maxAmount:current.maxAmount,minimumStock:reserve});
    if(!loaded.amount)return null;
    let faction=replaceFactionSettlement(player.factionState,loaded.settlement,{ownerPlayerId:playerId,select:false});
    const added=addV39CargoToFactionUnit(faction,actor.id,{resourcesByType:{[current.resource]:loaded.amount}});
    if(!added.ok)return null;
    faction=setV39CargoDeliveryTarget(added.faction,actor.id,current.destinationSettlementId);
    return {state:{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:faction}:row)},
      command:`拠点間調達:${current.targetName}→${current.destinationName||current.destinationSettlementId} / ${current.resource}${loaded.amount}`};
  }
  const result=objective.type==='resource-team-gather'?gatherV39Resources(state,playerId,actor.id,map,{aiTurn:true,resource:objective.resource})
    :objective.type==='resource-team-loot'?recoverV39GroundLootState(state,playerId,actor.id,key(actor)):null;
  if(!result?.ok)return null;
  const faction=result.state.players.find(row=>row.id===playerId).factionState;
  const tagged=team?.settlementId?setV39CargoDeliveryTarget(faction,actor.id,team.settlementId):faction;
  return {state:{...result.state,players:result.state.players.map(row=>row.id===playerId?{...row,factionState:tagged}:row)},command:`資源取得:${objective.resource}@${key(actor)}`};
}

export function prepareV39NpcResourceRallies(state,playerId,map,turn){
  return advanceV39SquadRallies(state,playerId,map,turn).state;
}

export function advanceV39NpcResourceTeams(source,playerId,map,turn){
  let state=rememberV39ResourceTeamVision(prepareV39NpcResourceRallies(source,playerId,map,turn),playerId,map);
  const commands=[],teams=[],reservedTiles=new Set();
  for(const original of getPlayer(state,playerId).factionState.aiState.resourceTeams||[]){
    const team={...original};
    if(!team.actorId){teams.push(team);continue;}
    if(team.unitIds.some(id=>getPlayer(state,playerId).factionState.units.find(unit=>unit.id===id)?.squadMoveMode==='gather')){
      teams.push({...team,status:'集合待ち'});continue;
    }
    for(let i=0;i<balance.resourceTeams.maxStepsPerTurn;i++){
      const objective=selectV39NpcTeamResourceObjective(state,getPlayer(state,playerId),team,map,reservedTiles);
      if(!objective){team.status='供給先なし';break;}
      team.objective=objective;team.role=objective.type==='resource-team-search'?'探索':objective.type==='resource-team-return'?'運搬':objective.type==='resource-team-supply'?'拠点間調達':'取得';
      if(objective.type==='resource-team-supply-wait'){team.role='待機';team.status=objective.targetName;break;}
      const action=executeV39NpcTeamResourceAction(state,playerId,objective,map,team);
      if(action){state=action.state;commands.push(action.command);team.status='持帰り';continue;}
      const moved=moveV39ResourceTeam(state,playerId,team.actorId,objective,map);
      if(!moved){
        const actor=getPlayer(state,playerId).factionState.units.find(unit=>unit.id===team.actorId);
        team.status=objective.type==='resource-team-return'?(key(actor)===key(objective)?'搬入待ち':'帰還AP・経路待ち')
          :objective.type==='resource-team-search'?'供給元未発見・探索待ち':'AP・経路待ち';break;
      }
      state=moved;team.status='移動中';
    }
    if(team.objective)commands.push(`資源任務:${team.resource} / ${team.role} / ${team.status} / ${team.unitIds.join('・')}`);
    if(['resource-team-gather','resource-team-loot'].includes(team.objective?.type))reservedTiles.add(key(team.objective));
    teams.push(team);
  }
  return {state:{...state,players:state.players.map(row=>row.id!==playerId?row:{...row,factionState:{...row.factionState,
    aiState:{...row.factionState.aiState,resourceTeams:teams}}})},commands};
}
