import npcBalance from '../../../../config/v39-npc-faction-ai.json';
import {advanceV39NpcCommerce} from '../../lib/v39-npc-commerce.js';
import {advanceV39NpcGrowth} from '../../lib/v39-npc-growth.js';
import {focusV39NpcFoodSettlement} from '../../lib/v39-npc-food-priority.js';
import {advanceV39NpcSubjectConversion} from '../../lib/v39-subject-conversion.js';
import {getV39VictoryLandmarkStatus} from '../../lib/v39-victory-rules.js';
import { getFactionSettlements } from "../../lib/settlement-state.js";
import { getV39LandExpansionCandidates, startV39LandExpansion } from "../../lib/v39-land-expansion-rules.js";
import { startV39Construction } from "../../lib/v39-economy-rules.js";
import { createV39Units } from "../../lib/v39-unit-creation-rules.js";
import {inspectV39NpcConstructionPlan,inspectV39NpcReinforcementPlan,inspectV39NpcDevelopmentPlan} from '../../lib/v39-npc-development-plan.js';
import {applyV39NpcCitySpecializations} from '../../lib/v39-npc-city-specialization.js';
import {startV39NpcResourceExpansion} from '../../lib/v39-npc-resource-expansion.js';
import {assignV39NpcResourceTeams,getV39NpcResourceUnitIds,advanceV39NpcResourceTeams} from '../../lib/v39-npc-resource-teams.js';
import { RESEARCH_CATEGORY_ORDER, researchTreeData } from "../../lib/research-tree-config.js";
import { isResearchCompleted, inspectResearchUnlock, normalizeResearchState, selectResearch } from "../../lib/research-progress.js";
import { getHexNeighborCoords, getHexOffsetNeighbors, normalizeWrappedCoordinate } from "../../lib/hex-grid.js";
import { getHexDistance } from "../../lib/hex-grid.js";
import { resolveV39UnitMovementStepCost } from "../../lib/v39-terrain-traversal.js";
import { applyV39SquadMovement, resolveV39SquadMovementGroup } from "../../lib/v39-squad-movement-rules.js";
import { refreshV39FactionIntelligence, collectV39FactionVision } from "../../lib/v39-faction-intelligence-rules.js";
import { canV39FactionAttack } from "../../lib/v39-diplomacy-rules.js";
import { isV39SupportSkill, resolveAttackApCost, resolveAttackRange, resolveAttackRows } from "../../lib/v39-combat-engine.js";
import { selectV39NpcResourceObjective, executeV39NpcResourceObjective, isV39NpcResourceReturnComplete } from '../../lib/v39-npc-resource-policy.js';

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const alive = unit => number(unit?.hp ?? unit?.currentHp) > 0 && text(unit?.state) !== "死亡";
const unitId = unit => text(unit?.id ?? unit?.unitId ?? unit?.characterId);
const coordKey = (x, y) => `${Math.floor(number(x))},${Math.floor(number(y))}`;

function playerFrom(state, playerId) {
  return state?.players?.find(player => text(player?.id) === text(playerId)) || null;
}

function decideAiObjective(state, player, mapData, turn = state.timeline?.turnNumber) {
  const hold=Object.entries(state.victoryLandmarksByTile||{}).find(([key])=>{
    const status=getV39VictoryLandmarkStatus(state,key,player.id);
    return status.controlled&&(status.interfered||status.securedTurns<status.requiredTurns);
  });
  if(hold){const [key,site]=hold;return {type:'victory-landmark',hold:true,targetTileKey:key,targetName:site.name,x:site.x,y:site.y};}
  const resourceObjective = selectV39NpcResourceObjective(state, player, mapData, npcBalance, turn);
  if (resourceObjective && resourceObjective.type !== 'resource-search') return resourceObjective;
  const knownFactions = Object.values(player?.factionState?.exploration?.discoveredFactionsByPlayerId || {});
  const hostileFaction = knownFactions
    .filter(record => canV39FactionAttack(state, player?.id, record?.playerId) && Number.isFinite(Number(record?.x)) && Number.isFinite(Number(record?.y)))
    .sort((a, b) => text(a?.playerId).localeCompare(text(b?.playerId)))[0] || null;
  const hostileObjective=hostileFaction?{
    type:"foreign-faction",
    targetPlayerId:text(hostileFaction.playerId),
    targetTileKey:text(hostileFaction.key),
    targetName:text(hostileFaction.playerName) || "他勢力",
    x:Math.floor(number(hostileFaction.x)),
    y:Math.floor(number(hostileFaction.y))
  }:null;
  const discovered = Object.values(player?.factionState?.exploration?.discoveredFeaturesByTile || {});
  const landmark = discovered
    .filter(feature => text(feature?.kind) === "victory-landmark" && Number.isFinite(Number(feature?.x)) && Number.isFinite(Number(feature?.y)))
    .filter(feature=>!getV39VictoryLandmarkStatus(state,feature.key,player.id).controlled)
    .sort((a, b) => getHexDistance(player.factionState.units.find(alive)||{},a)-getHexDistance(player.factionState.units.find(alive)||{},b)||text(a?.key).localeCompare(text(b?.key)))[0] || null;
  if (landmark) return {
    type:"victory-landmark",
    targetTileKey:text(landmark.key),
    targetName:text(landmark.name || landmark.featureName, "勝利対象土地"),
    x:Math.floor(number(landmark.x)),
    y:Math.floor(number(landmark.y))
  };
  return hostileObjective||resourceObjective||{ type:"explore", targetTileKey:"", targetName:"", x:null, y:null };
}

function worldWrapEnabled(mapData) {
  return mapData?.worldWrapEnabled === true;
}

function occupiedTileKeys(state, excludedUnitIds = []) {
  const excluded = new Set(excludedUnitIds.map(text));
  return new Set([
    ...(state?.players || []).flatMap(player => player?.factionState?.units || []),
    ...(state?.enemies || [])
  ].filter(unit => alive(unit) && (unit.worldId||'surface')===(state.activeWorldId||'surface') && !excluded.has(unitId(unit)))
    .map(unit => coordKey(unit?.x, unit?.y)));
}

function nextFormationForDirection(group, from, to, mapData) {
  const width = Math.floor(number(mapData?.w));
  const height = Math.floor(number(mapData?.h));
  const wrap = worldWrapEnabled(mapData);
  const direction = getHexOffsetNeighbors(from.x, from.y).findIndex(raw => {
    const x = wrap ? normalizeWrappedCoordinate(raw.x, width) : raw.x;
    const y = wrap ? normalizeWrappedCoordinate(raw.y, height) : raw.y;
    return x === to.x && y === to.y;
  });
  if (direction < 0) return null;
  const positions = [];
  for (const member of group.participants || []) {
    const raw = getHexOffsetNeighbors(member.x, member.y)[direction];
    const x = wrap ? normalizeWrappedCoordinate(raw.x, width) : raw.x;
    const y = wrap ? normalizeWrappedCoordinate(raw.y, height) : raw.y;
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    positions.push({ id:unitId(member), x, y });
  }
  return positions;
}

// Move toward an already known objective; surveying is not a movement prerequisite.
function moveAiExplorer(state, player, mapData, objective = decideAiObjective(state, player, mapData)) {
  if (!mapData?.grid || !number(mapData?.w) || !number(mapData?.h)) return null;
  const busy=new Set(player.factionState.aiState?.growthPlan?.busyIds||[]);
  const units = (player?.factionState?.units || []).filter(unit => alive(unit) && !unit.tradeAssignment&&!unit.transportAssignment&&!busy.has(unit.id)&&!unit?.surveyTask&&!unit.pendingWorldExit&&(unit.worldId||'surface')===(state.activeWorldId||'surface'));
  const workers=getV39NpcResourceUnitIds(player);
  const occupied = occupiedTileKeys(state);
  for (const unit of units) {
    if(!objective.actorId&&workers.has(unit.id))continue;
    if (objective.actorId && unit.id !== objective.actorId) continue;
    if (['resource-demand','resource-receive'].includes(objective.type) && getHexDistance(unit, objective) <= 1) continue;
    if (objective.type === 'resource-return' && isV39NpcResourceReturnComplete(player, objective)) continue;
    const group = resolveV39SquadMovementGroup(player.factionState, unitId(unit));
    if(group.participants?.some(member=>player.factionState.combatRuntime?.pendingActionsByUnitId?.[member.id]?.aimAfterCast))continue;
    if (!group.ok || group.moveAp <= 0) continue;
    const start = { x:group.x, y:group.y };
    if(objective.type==='victory-landmark'&&getHexDistance(start,objective)===0)continue;
    const directed = objective.x !== null && objective.y !== null && Number.isFinite(objective.x) && Number.isFinite(objective.y);
    const candidates = getHexNeighborCoords(mapData.w, mapData.h, start.x, start.y, worldWrapEnabled(mapData))
      .sort((a, b) => directed
        ? getHexDistance(a, objective) - getHexDistance(b, objective) || a.y - b.y || a.x - b.x
        : a.y - b.y || a.x - b.x);
    for (const target of candidates) {
      const positions = nextFormationForDirection(group, start, target, mapData);
      if (!positions || new Set(positions.map(position => coordKey(position.x, position.y))).size !== positions.length) continue;
      if (positions.some(position => occupied.has(coordKey(position.x, position.y)))) continue;
      let cost = 0;
      let valid = true;
      for (const member of group.participants) {
        const position = positions.find(row => row.id === unitId(member));
        const stepCost = resolveV39UnitMovementStepCost(mapData, member.x, member.y, position.x, position.y, member, state);
        if (!Number.isFinite(stepCost)) { valid = false; break; }
        cost = Math.max(cost, stepCost);
      }
      if (!valid || cost > group.moveAp) continue;
      const movement = applyV39SquadMovement(player.factionState, group, { ...target, positions }, cost,state);
      if (!movement.ok) continue;
      const players = state.players.map(row => row.id === player.id
        ? { ...row, factionState:movement.faction }
        : row);
      const purpose = objective.type === "victory-landmark" ? `勝利対象へ移動:${objective.targetName}`
        : objective.type === "foreign-faction" ? `他勢力へ移動:${objective.targetName}`
          : objective.type.startsWith('resource-') ? `資源確保へ移動:${objective.targetName}`
          : "探索移動";
      return { state:{ ...state, players }, command:`${purpose}:${coordKey(start.x, start.y)}→${target.key}` };
    }
  }
  return null;
}

function rememberNpcScoutVision(state, playerId, mapData) {
  const player = playerFrom(state, playerId);
  const scoped = { ...state, players:state.players.map(row => row.id !== playerId ? row : { ...row,
    factionState:{ ...row.factionState, units:row.factionState.units.filter(unit => (unit.worldId || 'surface') === 'surface') } }) };
  const { visible } = collectV39FactionVision(scoped, playerId, mapData);
  const explored = new Set([...(player.factionState.visibility?.exploredTileKeys || []), ...visible]);
  return { ...state, players:state.players.map(row => row.id !== playerId ? row : { ...row, factionState:{ ...row.factionState,
    visibility:{ ...row.factionState.visibility, visibleTileKeys:[...visible], exploredTileKeys:[...explored] }
  } }) };
}

// Search known, reachable ground for a route to the edge of sight. Do not use hidden village positions.
function findNpcScoutStep(state, player, mapData) {
  const explored = new Set(player.factionState.visibility?.exploredTileKeys || []);
  const settings = npcBalance.scouting || npcBalance.resourceScouting;
  const limit = Math.max(1, Math.floor(number(settings?.searchNodeLimit, 512)));
  const checkedGroups = new Set();
  const workers=getV39NpcResourceUnitIds(player);
  for (const unit of player.factionState.units || []) {
    if(workers.has(unit.id))continue;
    if (!alive(unit) || unit.tradeAssignment || unit.transportAssignment || player.factionState.aiState?.growthPlan?.busyIds?.includes(unit.id) || unit.surveyTask || unit.pendingWorldExit || (unit.worldId || 'surface') !== 'surface') continue;
    const group = resolveV39SquadMovementGroup(player.factionState, unit.id);
    if(group.participants?.some(member=>player.factionState.combatRuntime?.pendingActionsByUnitId?.[member.id]?.aimAfterCast))continue;
    if (!group.ok || group.moveAp <= 0) continue;
    const groupKey = group.participants.map(member => member.id).sort().join('|');
    if (checkedGroups.has(groupKey)) continue;
    checkedGroups.add(groupKey);
    const occupied = occupiedTileKeys(state, group.participants.map(member => member.id));
    for (const village of state.neutralVillages || []) for (const guard of village.defenseUnits || []) {
      if (alive(guard)) occupied.add(coordKey(guard.x, guard.y));
    }
    const start = { x:group.x, y:group.y, members:group.participants, first:null };
    const queue = [start], visited = new Set([coordKey(start.x, start.y)]);
    for (let i = 0; i < queue.length && i < limit; i++) {
      const current = queue[i];
      for (const target of getHexNeighborCoords(mapData.w, mapData.h, current.x, current.y, worldWrapEnabled(mapData))) {
        if (visited.has(target.key)) continue;
        const positions = nextFormationForDirection({ participants:current.members }, current, target, mapData);
        if (!positions || new Set(positions.map(row => coordKey(row.x, row.y))).size !== positions.length
          || positions.some(row => occupied.has(coordKey(row.x, row.y)))) continue;
        let cost = 0;
        for (const member of current.members) {
          const to = positions.find(row => row.id === member.id);
          cost = Math.max(cost, resolveV39UnitMovementStepCost(mapData, member.x, member.y, to.x, to.y, member, state));
        }
        if (!Number.isFinite(cost) || (!current.first && cost > group.moveAp)) continue;
        const first = current.first || { group, target:{ ...target, positions }, cost };
        if (!explored.has(target.key)) return first;
        visited.add(target.key);
        // Unknown terrain is an exploration goal, never a shortcut used to plan beyond sight.
        if (queue.length < limit) queue.push({ ...target, first,
          members:current.members.map(member => ({ ...member, ...positions.find(row => row.id === member.id) })) });
      }
    }
  }
  return null;
}

function scoutNpcMap(sourceState, player, mapData, turn, initialObjective) {
  if (!mapData?.grid || (sourceState.activeWorldId || 'surface') !== 'surface') return null;
  let state = rememberNpcScoutVision(sourceState, player.id, mapData);
  let objective = decideAiObjective(state, playerFrom(state, player.id), mapData, turn);
  const steps = [];
  const settings = npcBalance.scouting || npcBalance.resourceScouting;
  const maxSteps = Math.max(1, Math.floor(number(settings?.maxStepsPerTurn, 6)));
  const exploring = value => ['explore', 'resource-search'].includes(value?.type);
  for (let step = 0; step < maxSteps && exploring(objective); step++) {
    const current = playerFrom(state, player.id);
    if (planAiCombat(state, current, objective)) break;
    const route = findNpcScoutStep(state, current, mapData);
    if (!route) break;
    const moved = applyV39SquadMovement(current.factionState, route.group, route.target, route.cost, state);
    if (!moved.ok) break;
    state = { ...state, players:state.players.map(row => row.id !== player.id ? row : { ...row, factionState:moved.faction }) };
    state = rememberNpcScoutVision(state, player.id, mapData);
    const intelligence = refreshV39FactionIntelligence(state, player.id, mapData, turn);
    state = intelligence.state;
    steps.push(route.target.key);
    objective = decideAiObjective(state, playerFrom(state, player.id), mapData, turn);
  }
  const label = initialObjective.type === 'resource-search' ? '供給元の移動探索' : '探索移動';
  return { state, objective, command:steps.length ? `${label}:${steps.join('→')}${!exploring(objective)?` / 発見:${objective?.targetName || ''}`:''}`
    :!exploring(objective)?`${label}:発見 ${objective?.targetName || ''}`:`${label}:移動可能な未踏領域なし` };
}

function startAiConstruction(state, player, mapData) {
  const plan=inspectV39NpcConstructionPlan(state,player,mapData);
  if(plan.status!=='ready')return null;
  const result=startV39Construction(state,player.id,plan.name,plan.tile,mapData);
  return result.ok?{state:result.state,command:`建設:${plan.name}@${plan.tileKey}`}:null;
}

function startAiUnitCreation(state, player) {
  const plan=inspectV39NpcReinforcementPlan(state,player);
  if(plan.status!=='ready')return null;
  const result=createV39Units(state,player.id,plan.request);
  return result.ok?{state:result.state,command:`訓練開始:${result.queuedUnits[0]?.name || plan.className}`}:null;
}

// 戦争相手または勝利地点の守護者だけを既存の勢力戦闘処理へ渡す。ダメージ処理・反撃・死亡処理は重複しない。
function planAiCombat(state, player, objective) {
  const attackers = (player?.factionState?.units || []).filter(unit=>alive(unit)&&(unit.worldId||'surface')===(state.activeWorldId||'surface')&&!unit.pendingWorldExit)
    .sort((left, right) => text(left?.id).localeCompare(text(right?.id), "ja"));
  for (const attacker of attackers) {
    const pending=player.factionState.combatRuntime?.pendingActionsByUnitId?.[attacker.id];
    if(pending?.aimAfterCast&&Number(pending.resolvesAtTurn)>Number(state.timeline.turnNumber))continue;
    const rows = (pending?.aimAfterCast?[pending.skillRow]:resolveAttackRows(attacker))
      .filter(row => !isV39SupportSkill(row, attacker))
      .filter(row => pending?.aimAfterCast||number(attacker?.ap ?? attacker?.currentAp) >= resolveAttackApCost(row, attacker));
    for (const skillRow of rows) {
      const range = resolveAttackRange(skillRow, attacker, window.__v39FieldRuntime?.mapData);
      const foreignTargets = (state?.players || [])
        .filter(targetPlayer => targetPlayer?.id !== player?.id && canV39FactionAttack(state, player?.id, targetPlayer?.id))
        .flatMap(targetPlayer => (targetPlayer?.factionState?.units || []).map(unit => ({ ...unit, targetPlayerId:targetPlayer.id, targetType:"foreign-faction" })));
      const guardTargets = objective?.type === "victory-landmark"
        ? (state?.enemies || []).filter(enemy => text(enemy?.victoryLandmarkKey) === text(objective?.targetTileKey))
          .map(enemy => ({ ...enemy, targetType:"victory-guard" }))
        : [];
      const targets = [...foreignTargets, ...guardTargets]
        .filter(unit=>alive(unit)&&(unit.worldId||'surface')===(state.activeWorldId||'surface'))
        .filter(target => getHexDistance(attacker, target) <= range)
        .sort((left, right) => getHexDistance(attacker, left) - getHexDistance(attacker, right)
          || text(left?.id).localeCompare(text(right?.id), "ja"));
      const target = targets[0];
      if (!target) continue;
      return {
        playerId:player.id,
        attackerId:unitId(attacker),
        targetUnitId:unitId(target),
        target:{ x:target.x, y:target.y },
        targetType:text(target.targetType),
        skillRow
      };
    }
  }
  return null;
}

function planAiTerritoryAssault(state, player) {
  const attackers = (player?.factionState?.units || []).filter(alive)
    .sort((left, right) => text(left?.id).localeCompare(text(right?.id), "ja"));
  for (const attacker of attackers) {
    const tileKey = coordKey(attacker?.x, attacker?.y);
    const ownerPlayerId = text(state?.territoryOwnerByTile?.[tileKey]);
    const territory = state?.territoryStateByTile?.[tileKey];
    if (!ownerPlayerId || ownerPlayerId === text(player?.id) || territory?.raided === true) continue;
    if (!canV39FactionAttack(state, player?.id, ownerPlayerId)) continue;
    const skillRow = resolveAttackRows(attacker)
      .filter(row => !isV39SupportSkill(row, attacker))
      .find(row => number(attacker?.ap ?? attacker?.currentAp) >= resolveAttackApCost(row, attacker));
    if (!skillRow) continue;
    return { playerId:player.id, attackerId:unitId(attacker), ownerPlayerId, tileKey, skillRow };
  }
  return null;
}

function selectAiResearch(state, player) {
  let research = normalizeResearchState(player?.factionState?.research);
  const units = (player?.factionState?.units || []).filter(alive).sort((a, b) => number(b?.level) - number(a?.level));
  const commands = [];
  for (const category of RESEARCH_CATEGORY_ORDER) {
    if (research.selection?.[category]) continue;
    let selected = null;
    for (const levelRow of researchTreeData.categories?.[category]?.levels || []) {
      const assignee = units[0];
      if (!assignee) continue;
      const item = (levelRow.items || []).find(candidate => !isResearchCompleted(research, category, levelRow.level, candidate.id)
        && inspectResearchUnlock(research,candidate.id,researchTreeData).unlocked);
      if (!item) continue;
      selected = selectResearch(research, category, item.id, assignee, researchTreeData);
      if (selected.changed) {
        research = selected.state;
        commands.push(`研究:${item.name}`);
      }
      break;
    }
  }
  if (!commands.length) return null;
  const players = state.players.map(row => row.id === player.id
    ? { ...row, factionState:{ ...row.factionState, research } }
    : row);
  return { state:{ ...state, players }, commands };
}

function storeAiResult(state, playerId, turn, commands, objective, mapData) {
  const players = state.players.map(player => {
    if (player.id !== playerId) return player;
    const current = player?.factionState?.aiState || {};
    const history = [...(Array.isArray(current.history) ? current.history : []), { turn, commands:[...commands] }].slice(-100);
    const developmentPlan=inspectV39NpcDevelopmentPlan(state,player,mapData);
    developmentPlan.resourceGoals.push(...(current.growthPlan?.equipment?.shortages||[]));
    return {
      ...player,
      factionState:{ ...player.factionState, aiState:{ ...current, objective:{ ...objective }, developmentPlan, lastProcessedTurn:turn, lastCommands:[...commands], history } }
    };
  });
  return { ...state, players };
}

function startAiLandExpansion(state, player, mapData, goals=[],foodBalances=[]) {
  if((goals.some(row=>row.missing>0)||foodBalances.some(row=>row.active))&&npcBalance.resourceExpansion.enabled){
    const result=startV39NpcResourceExpansion(state,player.id,mapData,goals,{foodBalances});
    return result.commands.length?{state:result.state,command:result.commands.join(' / ')}:null;
  }
  for (const settlement of getFactionSettlements(player.factionState)) {
    const tile = getV39LandExpansionCandidates(state, player.id, settlement.settlementId, mapData)[0];
    if (!tile) continue;
    const result = startV39LandExpansion(state, player.id, settlement.settlementId, tile, mapData);
    if (result.ok) return { state:result.state, command:`開拓:${result.project.tileKey}` };
  }
  return null;
}

export function runV39FactionAiTurn(sourceState, turnNumber, mapData = window.__v39FieldRuntime?.mapData) {
  let state = sourceState;
  const turn = Math.max(1, Math.floor(number(turnNumber, state?.timeline?.turnNumber || 1)));
  const reports = [];
  if(mapData?.hegemonyInterior){
    for(const source of state.players.filter(player=>player.isPlayer===false)){
      if(!source.factionState.units.some(alive))continue;
      const stamp=source.factionState.aiState?.lastHegemonyTurnByWorld?.[state.activeWorldId];if(stamp>=turn)continue;
      const guards=state.enemies.filter(alive),target=guards[0]||mapData.entrances[0];
      const objective={type:'victory-landmark',targetTileKey:mapData.hegemonyLandmarkKey,x:target.x,y:target.y,targetName:mapData.hegemonyAreaName};
      const combat=planAiCombat(state,source,objective);
      if(!combat){const moved=moveAiExplorer(state,source,mapData,objective);if(moved)state=moved.state;}
      state={...state,players:state.players.map(player=>player.id!==source.id?player:{...player,factionState:{...player.factionState,aiState:{...player.factionState.aiState,
        lastHegemonyTurnByWorld:{...player.factionState.aiState?.lastHegemonyTurnByWorld,[state.activeWorldId]:turn}}}})};
      reports.push({playerId:source.id,combatActions:combat?[combat]:[],commands:['覇権地奥地の攻略'],turnNumber:turn});
    }
    return {state,reports};
  }
  for (const playerId of (state?.players || []).filter(player => player?.isPlayer === false).map(player => player.id)) {
    let player = playerFrom(state, playerId);
    if (!player || number(player?.factionState?.aiState?.lastProcessedTurn) >= turn) continue;
    const commands = [];
    const combatActions = [];
    const intelligence = refreshV39FactionIntelligence(state, playerId, mapData, turn);
    state = intelligence.state;
    player = playerFrom(state, playerId);
    for (const discovery of intelligence.discoveries) commands.push(`勢力発見:${discovery.playerName}`);
    const subjectConversion=advanceV39NpcSubjectConversion(state,playerId);
    if(subjectConversion){state=subjectConversion.state;player=playerFrom(state,playerId);commands.push(subjectConversion.message);}
    state=focusV39NpcFoodSettlement(state,playerId,mapData);player=playerFrom(state,playerId);
    const development=inspectV39NpcDevelopmentPlan(state,player,mapData);
    const growth=advanceV39NpcGrowth(state,playerId,mapData,turn,development);
    state=growth.state;player=playerFrom(state,playerId);commands.push(...growth.commands);
    development.resourceGoals.push(...growth.resourceGoals);
    const equipmentBudget=player.factionState.aiState?.growthPlan?.equipment;
    if(equipmentBudget){
      const base=getFactionSettlements(player.factionState).find(base=>(base.settlementId||base.id)===player.factionState.selectedSettlementId);
      const budget=development.supplyBudgetBySettlement[base?.settlementId||base?.id];
      if(budget)for(const [name,amount] of Object.entries(equipmentBudget.cost))budget[name]=number(budget[name])+number(amount);
    }
    const commerce=advanceV39NpcCommerce(state,playerId,mapData,turn,development);
    state=commerce.state;player=playerFrom(state,playerId);commands.push(...commerce.commands);
    for(const food of development.foodBalances.filter(row=>row.active))commands.push(`食料優先:${food.name} / ${food.status==='deficit'?'通常食料の収支赤字':'備蓄不足'}${food.queuedUnits?' / 訓練中の兵の維持費を含む':''}`);
    const specialization=applyV39NpcCitySpecializations(state,playerId,mapData,development.citySpecializations);
    state=specialization.state;player=playerFrom(state,playerId);commands.push(...specialization.commands);
    state=assignV39NpcResourceTeams(state,playerId,development.resourceGoals,mapData,{supplyBudgetBySettlement:development.supplyBudgetBySettlement}).state;
    const work=advanceV39NpcResourceTeams(state,playerId,mapData,turn);
    state=work.state;player=playerFrom(state,playerId);commands.push(...work.commands);
    let objective = decideAiObjective(state, player, mapData, turn);
    if (objective.type === "victory-landmark") commands.push(`目的:勝利対象 ${objective.targetName}`);
    if (objective.type === "foreign-faction") commands.push(`目的:他勢力 ${objective.targetName}`);
    if (objective.resource || objective.type === 'resource-return') commands.push(`目的:資源確保 ${objective.resource || '持帰り'} / ${objective.targetName}`);
    const resourceAction = executeV39NpcResourceObjective(state, playerId, objective, turn);
    if (resourceAction) { state = resourceAction.state; player = playerFrom(state, playerId); commands.push(resourceAction.command); }
    const immediateCombat=planAiCombat(state,player,objective);
    for (const action of [
      () => immediateCombat||resourceAction?null:['explore','resource-search'].includes(objective.type)
        ?scoutNpcMap(state, player, mapData, turn, objective):moveAiExplorer(state, player, mapData, objective),
      () => startAiLandExpansion(state, player, mapData,development.resourceGoals,development.foodBalances),
      () => startAiUnitCreation(state, player),
      () => startAiConstruction(state, player, mapData)
    ]) {
      const result = action();
      if (!result) continue;
      state = result.state;
      player = playerFrom(state, playerId);
      if (result.objective) objective = result.objective;
      commands.push(result.command);
    }
    if (!resourceAction) {
      const arrived = executeV39NpcResourceObjective(state, playerId, objective, turn);
      if (arrived) { state = arrived.state; player = playerFrom(state, playerId); commands.push(arrived.command); }
    }
    const researchResult = selectAiResearch(state, player);
    if (researchResult) {
      state = researchResult.state;
      commands.push(...researchResult.commands);
    }
    const combatAction = planAiCombat(state, playerFrom(state, playerId), objective);
    if (combatAction) {
      combatActions.push(combatAction);
      commands.push(`攻撃準備:${text(combatAction.skillRow?.名前)}→${text(combatAction.targetUnitId)}`);
    }
    const territoryAction = combatAction ? null : planAiTerritoryAssault(state, playerFrom(state, playerId));
    if (territoryAction) commands.push(`領土攻撃準備:${text(territoryAction.skillRow?.名前)}@${territoryAction.tileKey}`);
    state = storeAiResult(state, playerId, turn, commands, objective, mapData);
    reports.push({ playerId, turn, commands, objective, combatActions, territoryActions:territoryAction ? [territoryAction] : [] });
  }
  return { state, reports };
}

function handleTurn(event) {
  const state = window.getV39GameState?.();
  if (!state) return;
  const result = runV39FactionAiTurn(state, event?.detail?.turnNumber, window.__v39FieldRuntime?.mapData);
  if (!result.reports.length) return;
  window.setV39GameState?.({ players:result.state.players, neutralVillages:result.state.neutralVillages,
    settlements:result.state.settlements, diplomacyRelations:result.state.diplomacyRelations,
    groundLootByTile:result.state.groundLootByTile }, { reason:"faction-ai-turn" });
  for (const report of result.reports) window.depositV39PlayerCargo?.(report.playerId);
  for (const action of result.reports.flatMap(report => report.combatActions || [])) {
    window.executeV39FactionCombatAction?.(action);
  }
  for (const action of result.reports.flatMap(report => report.territoryActions || [])) {
    window.executeV39FactionTerritoryAssault?.({ ...action, turnNumber:event?.detail?.turnNumber });
  }
  for (const report of result.reports) window.dispatchEvent(new CustomEvent("v39:faction-ai-action", { detail:report }));
}

window.addEventListener("v39:turn-stage-ai", handleTurn);
window.runV39FactionAiTurn = runV39FactionAiTurn;
