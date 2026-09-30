import { enemySpawnData } from "../../lib/game-data-registry.js";
import { getHexNeighborCoords } from "../../lib/hex-grid.js";
import { V39_VICTORY_GUARD_BALANCE } from "../../lib/v39-gameplay-balance.js";
import { createV39EventEnemy } from "../ai/v39-enemy-spawn.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
const keyOf = (x, y) => `${integer(x)},${integer(y)}`;
const living = unit => number(unit?.hp ?? unit?.currentHp) > 0 && text(unit?.state) !== "死亡";

function guardDefinitionFor(landmark) {
  const terrain = text(landmark?.terrain);
  return (enemySpawnData || [])
    .filter(row => text(row?.出現地形) === terrain)
    .filter(row => text(row?.種族) && text(row?.種族名 || row?.種族))
    .filter(row => number(row?.Lv_Max) > 0)
    .sort((left, right) => number(right?.Lv_Max) - number(left?.Lv_Max)
      || text(left?.ID).localeCompare(text(right?.ID), "ja"))[0] || null;
}

function createGuardUnit(landmark, definition, { id, x, y, level, minion = false, nestId, squadId }) {
  const race = text(definition?.種族, text(definition?.種族名));
  const className = text(definition?.サブクラス, race);
  const enemy = createV39EventEnemy({
    id,
    name:minion ? `${text(definition?.種族名, race)}の配下` : `${landmark.name}の守護者`,
    race,
    className,
    level,
    x,
    y,
    metadata:{
      image:text(definition?.画像),
      aggressive:true,
      spawnTerrain:text(landmark?.terrain),
      sourceDefinitionId:text(definition?.ID),
      spawnType:minion ? "勝利対象配下" : "勝利対象守護者"
    }
  });
  if (!enemy) return null;
  return {
    ...enemy,
    strongEnemy:minion !== true,
    strongMinion:minion === true,
    strongGroupId:`victory-guard-group:${landmark.id}`,
    strongLeaderId:minion ? `victory-guard:${landmark.id}:boss` : null,
    strongGroupType:"群体",
    strongGroupExpectedMinionCount:V39_VICTORY_GUARD_BALANCE.minionCount,
    strongGroupCountSource:"勝利対象守護設定",
    strongGroupMinionSource:"同種",
    nestType:text(definition?.巣, "守護の巣"),
    nestId,
    enemySquadId:squadId,
    territoryCenterX:integer(landmark?.x),
    territoryCenterY:integer(landmark?.y),
    territoryRadius:V39_VICTORY_GUARD_BALANCE.territoryRadius,
    victoryLandmarkKey:text(landmark?.key),
    victoryGuard:true
  };
}

// 勝利対象1件ごとに既存の敵・巣・部隊状態へ守護編成を追加する。
export function spawnV39VictoryLandmarkGuards(state, mapData) {
  const existingEnemies = Array.isArray(state?.enemies) ? state.enemies : [];
  const existingNests = Array.isArray(state?.enemyNests) ? state.enemyNests : [];
  const existingSquads = Array.isArray(state?.enemySquads) ? state.enemySquads : [];
  const occupied = new Set(existingEnemies.filter(living).map(unit => keyOf(unit?.x, unit?.y)));
  const enemies = [...existingEnemies];
  const enemyNests = [...existingNests];
  const enemySquads = [...existingSquads];
  const reports = [];
  for (const landmark of Object.values(state?.victoryLandmarksByTile || {})) {
    const landmarkKey = text(landmark?.key);
    if (!landmarkKey || existingNests.some(nest => text(nest?.victoryLandmarkKey) === landmarkKey)) continue;
    const definition = guardDefinitionFor(landmark);
    if (!definition || occupied.has(landmarkKey)) continue;
    const nestId = `victory-guard-nest:${landmark.id}`;
    const squadId = `victory-guard-squad:${landmark.id}`;
    const boss = createGuardUnit(landmark, definition, {
      id:`victory-guard:${landmark.id}:boss`, x:landmark.x, y:landmark.y,
      level:Math.max(1, integer(definition?.Lv_Max, 1)), nestId, squadId
    });
    if (!boss) continue;
    const members = [boss];
    occupied.add(landmarkKey);
    const minionLevel = Math.max(1, number(boss?.level, 1) - V39_VICTORY_GUARD_BALANCE.minionLevelOffset);
    const neighbors = getHexNeighborCoords(mapData?.w, mapData?.h, landmark.x, landmark.y, mapData?.worldWrapEnabled === true);
    for (const neighbor of neighbors) {
      if (members.length > V39_VICTORY_GUARD_BALANCE.minionCount || occupied.has(neighbor.key)) continue;
      const minion = createGuardUnit(landmark, definition, {
        id:`victory-guard:${landmark.id}:minion-${members.length}`, x:neighbor.x, y:neighbor.y,
        level:minionLevel, minion:true, nestId, squadId
      });
      if (!minion) continue;
      members.push(minion);
      occupied.add(neighbor.key);
    }
    enemies.push(...members);
    enemyNests.push({
      id:nestId,
      name:`${landmark.name}の守護巣`,
      nestType:text(definition?.巣, "守護の巣"),
      race:text(definition?.種族, text(definition?.種族名)),
      sourceDefinitionId:text(definition?.ID),
      victoryLandmarkKey:landmarkKey,
      victoryGuard:true,
      squadId,
      x:integer(landmark.x), y:integer(landmark.y),
      territoryRadius:V39_VICTORY_GUARD_BALANCE.territoryRadius,
      scaleLevel:1, scaleName:"守護", militaryLevel:1,
      population:members.length,
      unitIds:members.map(unit => unit.id), everHadUnits:true,
      foodStockByType:{}, materialStockByType:{}, equipmentInventory:[]
    });
    enemySquads.push({ id:squadId, nestId, unitIds:members.map(unit => unit.id), cargo:{ resourcesByType:{}, equipmentInventory:[] } });
    reports.push({ landmarkKey, landmarkName:landmark.name, nestId, bossId:boss.id, minionCount:members.length - 1 });
  }
  return { state:{ ...state, enemies, enemyNests, enemySquads }, reports };
}

function install() {
  const spawnGuards = () => {
    const state = window.getV39GameState?.();
    const result = spawnV39VictoryLandmarkGuards(state, window.__v39FieldRuntime?.mapData);
    if (!result?.reports?.length) return;
    window.setV39GameState?.({ enemies:result.state.enemies, enemyNests:result.state.enemyNests, enemySquads:result.state.enemySquads }, { reason:"victory-guard-spawned" });
    for (const report of result.reports) window.appendV39ActivityLog?.((state?.players || []).map(player => player.id), "勝利対象", `${report.landmarkName}の守護者が出現`, report);
  };
  window.addEventListener("v39:enemies-spawned", spawnGuards);
  // 勝利対象は初期拠点配置後に生成するため、通常敵の生成後でもここから守護者を追加する。
  window.addEventListener("v39:exploration-sites-generated", spawnGuards);
  window.spawnV39VictoryLandmarkGuards = () => {
    const state = window.getV39GameState?.();
    const result = spawnV39VictoryLandmarkGuards(state, window.__v39FieldRuntime?.mapData);
    if (result?.reports?.length) window.setV39GameState?.({ enemies:result.state.enemies, enemyNests:result.state.enemyNests, enemySquads:result.state.enemySquads }, { reason:"victory-guard-spawned-manual" });
    return result;
  };
}

install();
