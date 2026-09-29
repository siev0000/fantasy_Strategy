import { startV39SurveyTask } from "../../lib/v39-exploration-rules.js";
import { facilityDefinitions, inspectV39Construction, startV39Construction } from "../../lib/v39-economy-rules.js";
import { createV39Units, getV39UnitCreationOptions, inspectV39UnitCreation } from "../../lib/v39-unit-creation-rules.js";
import { RESEARCH_CATEGORY_ORDER, researchTreeData } from "../../lib/research-tree-config.js";
import { isResearchCompleted, isResearchLevelUnlocked, normalizeResearchState, selectResearch } from "../../lib/research-progress.js";
import { getHexNeighborCoords, getHexOffsetNeighbors, normalizeWrappedCoordinate } from "../../lib/hex-grid.js";
import { getHexDistance } from "../../lib/hex-grid.js";
import { resolveV39UnitMovementStepCost } from "../../lib/v39-terrain-traversal.js";
import { applyV39SquadMovement, resolveV39SquadMovementGroup } from "../../lib/v39-squad-movement-rules.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const alive = unit => number(unit?.hp ?? unit?.currentHp) > 0 && text(unit?.state) !== "死亡";
const unitId = unit => text(unit?.id ?? unit?.unitId ?? unit?.characterId);
const coordKey = (x, y) => `${Math.floor(number(x))},${Math.floor(number(y))}`;

function playerFrom(state, playerId) {
  return state?.players?.find(player => text(player?.id) === text(playerId)) || null;
}

function decideAiObjective(player) {
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
  const surveyed = new Set(player?.factionState?.exploration?.surveyedTileKeys || []);
  const unit = (player?.factionState?.units || []).filter(alive).find(candidate => {
    const key = `${Math.floor(number(candidate?.x, -1))},${Math.floor(number(candidate?.y, -1))}`;
    return !candidate?.surveyTask && !surveyed.has(key) && number(candidate?.x, -1) >= 0 && number(candidate?.y, -1) >= 0;
  });
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
function moveAiExplorer(state, player, mapData, objective = decideAiObjective(player)) {
  if (!mapData?.grid || !number(mapData?.w) || !number(mapData?.h)) return null;
  const surveyed = new Set(player?.factionState?.exploration?.surveyedTileKeys || []);
  const units = (player?.factionState?.units || []).filter(unit => alive(unit) && !unit?.surveyTask);
  const occupied = occupiedTileKeys(state);
  for (const unit of units) {
    const group = resolveV39SquadMovementGroup(player.factionState, unitId(unit));
    if (!group.ok || group.moveAp <= 0) continue;
    const start = { x:group.x, y:group.y };
    const candidates = getHexNeighborCoords(mapData.w, mapData.h, start.x, start.y, worldWrapEnabled(mapData))
      .filter(tile => objective.type === "victory-landmark" || !surveyed.has(tile.key))
      .sort((a, b) => objective.type === "victory-landmark"
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
      const purpose = objective.type === "victory-landmark" ? `勝利対象へ移動:${objective.targetName}` : "探索移動";
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
    const objective = decideAiObjective(player);
    if (objective.type === "victory-landmark") commands.push(`目的:勝利対象 ${objective.targetName}`);
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
    state = storeAiResult(state, playerId, turn, commands, objective);
    reports.push({ playerId, turn, commands, objective });
  }
  return { state, reports };
}

function handleTurn(event) {
  const state = window.getV39GameState?.();
  if (!state) return;
  const result = runV39FactionAiTurn(state, event?.detail?.turnNumber, window.__v39FieldRuntime?.mapData);
  if (!result.reports.length) return;
  window.setV39GameState?.({ players:result.state.players }, { reason:"faction-ai-turn" });
  for (const report of result.reports) window.dispatchEvent(new CustomEvent("v39:faction-ai-action", { detail:report }));
}

window.addEventListener("v39:turn-stage-ai", handleTurn);
window.runV39FactionAiTurn = runV39FactionAiTurn;
