import { startV39SurveyTask } from "../../lib/v39-exploration-rules.js";
import { facilityDefinitions, inspectV39Construction, startV39Construction } from "../../lib/v39-economy-rules.js";
import { createV39Units, getV39UnitCreationOptions, inspectV39UnitCreation } from "../../lib/v39-unit-creation-rules.js";
import { RESEARCH_CATEGORY_ORDER, researchTreeData } from "../../lib/research-tree-config.js";
import { isResearchCompleted, isResearchLevelUnlocked, normalizeResearchState, selectResearch } from "../../lib/research-progress.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const alive = unit => number(unit?.hp ?? unit?.currentHp) > 0 && text(unit?.state) !== "死亡";

function playerFrom(state, playerId) {
  return state?.players?.find(player => text(player?.id) === text(playerId)) || null;
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

function storeAiResult(state, playerId, turn, commands) {
  const players = state.players.map(player => {
    if (player.id !== playerId) return player;
    const current = player?.factionState?.aiState || {};
    const history = [...(Array.isArray(current.history) ? current.history : []), { turn, commands:[...commands] }].slice(-100);
    return {
      ...player,
      factionState:{ ...player.factionState, aiState:{ ...current, lastProcessedTurn:turn, lastCommands:[...commands], history } }
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
    for (const action of [
      () => startAiSurvey(state, player),
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
    state = storeAiResult(state, playerId, turn, commands);
    reports.push({ playerId, turn, commands });
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
