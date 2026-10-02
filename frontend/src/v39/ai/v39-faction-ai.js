import { inspectV39Survey, startV39SurveyTask } from "../../lib/v39-exploration-rules.js";
import { facilityDefinitions, inspectV39Construction, startV39Construction } from "../../lib/v39-economy-rules.js";
import { createV39Units, getV39UnitCreationOptions, inspectV39UnitCreation } from "../../lib/v39-unit-creation-rules.js";
import { RESEARCH_CATEGORY_ORDER, researchTreeData } from "../../lib/research-tree-config.js";
import { isResearchCompleted, isResearchLevelUnlocked, normalizeResearchState, selectResearch } from "../../lib/research-progress.js";
import { getHexNeighborCoords, getHexOffsetNeighbors, normalizeWrappedCoordinate } from "../../lib/hex-grid.js";
import { getHexDistance } from "../../lib/hex-grid.js";
import { resolveV39UnitMovementStepCost } from "../../lib/v39-terrain-traversal.js";
import { applyV39SquadMovement, resolveV39SquadMovementGroup } from "../../lib/v39-squad-movement-rules.js";
import { refreshV39FactionIntelligence } from "../../lib/v39-faction-intelligence-rules.js";
import { canV39FactionAttack } from "../../lib/v39-diplomacy-rules.js";
import { isV39SupportSkill, resolveAttackApCost, resolveAttackRange, resolveAttackRows } from "../../lib/v39-combat-engine.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const alive = unit => number(unit?.hp ?? unit?.currentHp) > 0 && text(unit?.state) !== "死亡";
const unitId = unit => text(unit?.id ?? unit?.unitId ?? unit?.characterId);
const coordKey = (x, y) => `${Math.floor(number(x))},${Math.floor(number(y))}`;

function playerFrom(state, playerId) {
  return state?.players?.find(player => text(player?.id) === text(playerId)) || null;
}

function decideAiObjective(state, player) {
  const knownFactions = Object.values(player?.factionState?.exploration?.discoveredFactionsByPlayerId || {});
  const hostileFaction = knownFactions
    .filter(record => canV39FactionAttack(state, player?.id, record?.playerId) && Number.isFinite(Number(record?.x)) && Number.isFinite(Number(record?.y)))
    .sort((a, b) => text(a?.playerId).localeCompare(text(b?.playerId)))[0] || null;
  if (hostileFaction) return {
    type:"foreign-faction",
    targetPlayerId:text(hostileFaction.playerId),
    targetTileKey:text(hostileFaction.key),
    targetName:text(hostileFaction.playerName) || "他勢力",
    x:Math.floor(number(hostileFaction.x)),
    y:Math.floor(number(hostileFaction.y))
  };
  const discovered = Object.values(player?.factionState?.exploration?.discoveredFeaturesByTile || {});
  const landmark = discovered
    .filter(feature => text(feature?.kind) === "victory-landmark" && Number.isFinite(Number(feature?.x)) && Number.isFinite(Number(feature?.y)))
    .sort((a, b) => text(a?.key).localeCompare(text(b?.key)))[0] || null;
  if (landmark) return {
    type:"victory-landmark",
    targetTileKey:text(landmark.key),
    targetName:text(landmark.name || landmark.featureName, "勝利対象土地"),
    x:Math.floor(number(landmark.x)),
    y:Math.floor(number(landmark.y))
  };
  return { type:"explore", targetTileKey:"", targetName:"", x:null, y:null };
}

function startAiSurvey(state, player) {
  const unit = (player?.factionState?.units || []).filter(alive).find(candidate =>
    number(candidate?.x, -1) >= 0 && number(candidate?.y, -1) >= 0
    && inspectV39Survey(state, player.id, candidate.id, candidate).available);
  if (!unit) return null;
  const result = startV39SurveyTask(state, player.id, unit.id, { x:unit.x, y:unit.y });
  return result.ok ? { state:result.state, command:`調査:${result.task.key}` } : null;
}

function worldWrapEnabled(mapData) {
  return mapData?.worldWrapEnabled === true;
}

function occupiedTileKeys(state, excludedUnitIds = []) {
  const excluded = new Set(excludedUnitIds.map(text));
  return new Set([
    ...(state?.players || []).flatMap(player => player?.factionState?.units || []),
    ...(state?.enemies || [])
  ].filter(unit => alive(unit) && !excluded.has(unitId(unit)))
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

// NPCは未調査情報だけを目的にし、地形は既存の移動命令を検証するためだけに読む。
function moveAiExplorer(state, player, mapData, objective = decideAiObjective(state, player)) {
  if (!mapData?.grid || !number(mapData?.w) || !number(mapData?.h)) return null;
  const surveyed = new Set(player?.factionState?.exploration?.surveyedTileKeys || []);
  const units = (player?.factionState?.units || []).filter(unit => alive(unit) && !unit?.surveyTask);
  const occupied = occupiedTileKeys(state);
  for (const unit of units) {
    const group = resolveV39SquadMovementGroup(player.factionState, unitId(unit));
    if (!group.ok || group.moveAp <= 0) continue;
    const start = { x:group.x, y:group.y };
    const candidates = getHexNeighborCoords(mapData.w, mapData.h, start.x, start.y, worldWrapEnabled(mapData))
      .filter(tile => objective.type === "victory-landmark" || objective.type === "foreign-faction" || !surveyed.has(tile.key))
      .sort((a, b) => objective.type === "victory-landmark" || objective.type === "foreign-faction"
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
        const stepCost = resolveV39UnitMovementStepCost(mapData, member.x, member.y, position.x, position.y, member);
        if (!Number.isFinite(stepCost)) { valid = false; break; }
        cost = Math.max(cost, stepCost);
      }
      if (!valid || cost > group.moveAp) continue;
      const movement = applyV39SquadMovement(player.factionState, group, { ...target, positions }, cost);
      if (!movement.ok) continue;
      const players = state.players.map(row => row.id === player.id
        ? { ...row, factionState:movement.faction }
        : row);
      const purpose = objective.type === "victory-landmark" ? `勝利対象へ移動:${objective.targetName}`
        : objective.type === "foreign-faction" ? `他勢力へ移動:${objective.targetName}`
          : "探索移動";
      return { state:{ ...state, players }, command:`${purpose}:${coordKey(start.x, start.y)}→${target.key}` };
    }
  }
  return null;
}

function startAiConstruction(state, player, mapData) {
  const keys = Object.entries(state?.territoryOwnerByTile || {})
    .filter(([, owner]) => text(owner) === text(player.id))
    .map(([key]) => key)
    .sort();
  for (const definition of facilityDefinitions()) for (const key of keys) {
    const [x, y] = key.split(",").map(Number);
    const tile = { x, y };
    if (!inspectV39Construction(state, player, definition, tile, mapData).available) continue;
    const result = startV39Construction(state, player.id, definition.name, tile, mapData);
    if (result.ok) return { state:result.state, command:`建設:${definition.name}@${key}` };
  }
  return null;
}

function startAiUnitCreation(state, player) {
  const options = getV39UnitCreationOptions(player);
  for (const mode of ["army", "normal"]) for (const classRow of options.classes || []) for (const race of options.races || []) {
    const request = { mode, className:text(classRow?.名前), race, count:1 };
    if (!inspectV39UnitCreation(state, player, request).available) continue;
    const result = createV39Units(state, player.id, request);
    if (result.ok) return { state:result.state, command:`生成:${result.createdUnits[0]?.name || request.className}` };
  }
  return null;
}

// 戦争相手または勝利地点の守護者だけを既存の勢力戦闘処理へ渡す。ダメージ処理・反撃・死亡処理は重複しない。
function planAiCombat(state, player, objective) {
  const attackers = (player?.factionState?.units || []).filter(alive)
    .sort((left, right) => text(left?.id).localeCompare(text(right?.id), "ja"));
  for (const attacker of attackers) {
    const rows = resolveAttackRows(attacker)
      .filter(row => !isV39SupportSkill(row, attacker))
      .filter(row => number(attacker?.ap ?? attacker?.currentAp) >= resolveAttackApCost(row, attacker));
    for (const skillRow of rows) {
      const range = resolveAttackRange(skillRow, attacker);
      const foreignTargets = (state?.players || [])
        .filter(targetPlayer => targetPlayer?.id !== player?.id && canV39FactionAttack(state, player?.id, targetPlayer?.id))
        .flatMap(targetPlayer => (targetPlayer?.factionState?.units || []).map(unit => ({ ...unit, targetPlayerId:targetPlayer.id, targetType:"foreign-faction" })));
      const guardTargets = objective?.type === "victory-landmark"
        ? (state?.enemies || []).filter(enemy => text(enemy?.victoryLandmarkKey) === text(objective?.targetTileKey))
          .map(enemy => ({ ...enemy, targetType:"victory-guard" }))
        : [];
      const targets = [...foreignTargets, ...guardTargets]
        .filter(alive)
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
      const assignee = units.find(unit => isResearchLevelUnlocked(research, category, levelRow.level, number(unit?.level), researchTreeData));
      if (!assignee) continue;
      const item = (levelRow.items || []).find(candidate => !isResearchCompleted(research, category, levelRow.level, candidate.id));
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

function storeAiResult(state, playerId, turn, commands, objective) {
  const players = state.players.map(player => {
    if (player.id !== playerId) return player;
    const current = player?.factionState?.aiState || {};
    const history = [...(Array.isArray(current.history) ? current.history : []), { turn, commands:[...commands] }].slice(-100);
    return {
      ...player,
      factionState:{ ...player.factionState, aiState:{ ...current, objective:{ ...objective }, lastProcessedTurn:turn, lastCommands:[...commands], history } }
    };
  });
  return { ...state, players };
}

export function runV39FactionAiTurn(sourceState, turnNumber, mapData = window.__v39FieldRuntime?.mapData) {
  let state = sourceState;
  const turn = Math.max(1, Math.floor(number(turnNumber, state?.timeline?.turnNumber || 1)));
  const reports = [];
  for (const playerId of (state?.players || []).filter(player => player?.isPlayer === false).map(player => player.id)) {
    let player = playerFrom(state, playerId);
    if (!player || number(player?.factionState?.aiState?.lastProcessedTurn) >= turn) continue;
    const commands = [];
    const combatActions = [];
    const intelligence = refreshV39FactionIntelligence(state, playerId, mapData, turn);
    state = intelligence.state;
    player = playerFrom(state, playerId);
    for (const discovery of intelligence.discoveries) commands.push(`勢力発見:${discovery.playerName}`);
    const objective = decideAiObjective(state, player);
    if (objective.type === "victory-landmark") commands.push(`目的:勝利対象 ${objective.targetName}`);
    if (objective.type === "foreign-faction") commands.push(`目的:他勢力 ${objective.targetName}`);
    for (const action of [
      () => startAiSurvey(state, player),
      () => moveAiExplorer(state, player, mapData, objective),
      () => startAiConstruction(state, player, mapData),
      () => startAiUnitCreation(state, player)
    ]) {
      const result = action();
      if (!result) continue;
      state = result.state;
      player = playerFrom(state, playerId);
      commands.push(result.command);
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
    state = storeAiResult(state, playerId, turn, commands, objective);
    reports.push({ playerId, turn, commands, objective, combatActions, territoryActions:territoryAction ? [territoryAction] : [] });
  }
  return { state, reports };
}

function handleTurn(event) {
  const state = window.getV39GameState?.();
  if (!state) return;
  const result = runV39FactionAiTurn(state, event?.detail?.turnNumber, window.__v39FieldRuntime?.mapData);
  if (!result.reports.length) return;
  window.setV39GameState?.({ players:result.state.players }, { reason:"faction-ai-turn" });
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
