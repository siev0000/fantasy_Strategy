const SAVE_FORMAT = "fantasy-strategy-v39";
import { getGameDataRows } from "../../lib/game-data-registry.js";

const SAVE_VERSION = 3;

const skillByName = new Map(getGameDataRows("スキル一覧").map(row => [String(row?.名前 || "").trim(), row]).filter(([name]) => name));

function stripDefinitionSnapshots(value, key = "") {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (["derivedCharacter", "raceRow", "classRow", "secondClassRow", "skillRow"].includes(key)) return undefined;
  if (key === "source" && !Array.isArray(value)) return undefined;
  if (value instanceof Set || value instanceof Map) return value;
  if (Array.isArray(value)) return value.map(item => stripDefinitionSnapshots(item)).filter(item => item !== undefined);
  return Object.fromEntries(Object.entries(value)
    .map(([childKey, childValue]) => [childKey, stripDefinitionSnapshots(childValue, childKey)])
    .filter(([, childValue]) => childValue !== undefined));
}

function hydratePendingAction(action, context) {
  if (!action || typeof action !== "object") return action;
  const skillName = String(action.skillName || action.skillRow?.名前 || "").trim();
  const skillRow = skillByName.get(skillName);
  if (!skillRow) {
    console.error("[セーブ読込] スキル参照が見つかりません", { 対象:context, 項目名:"skillName", 値:skillName });
    return null;
  }
  return { ...action, skillName, skillRow };
}

function hydrateRuntimeDefinitions(gameState) {
  const players = (gameState?.players || []).map(player => {
    const runtime = player?.factionState?.combatRuntime || {};
    const pendingActionsByUnitId = Object.fromEntries(Object.entries(runtime.pendingActionsByUnitId || {})
      .map(([unitId, action]) => [unitId, hydratePendingAction(action, `プレイヤー:${player.id}/ユニット:${unitId}`)])
      .filter(([, action]) => action));
    return { ...player, factionState:{ ...player.factionState, combatRuntime:{ ...runtime, pendingActionsByUnitId } } };
  });
  const enemyRuntime = gameState?.enemyCombatRuntime || {};
  const pendingActionsByEnemyId = Object.fromEntries(Object.entries(enemyRuntime.pendingActionsByEnemyId || {})
    .map(([enemyId, action]) => [enemyId, hydratePendingAction(action, `敵:${enemyId}`)])
    .filter(([, action]) => action));
  return { ...gameState, players, enemyCombatRuntime:{ ...enemyRuntime, pendingActionsByEnemyId } };
}

function encodeSpecialValues(_key, value) {
  if (value instanceof Set) return { __v39Type:"Set", values:[...value] };
  if (value instanceof Map) return { __v39Type:"Map", entries:[...value.entries()] };
  return value;
}

function decodeSpecialValues(_key, value) {
  if (value?.__v39Type === "Set" && Array.isArray(value.values)) return new Set(value.values);
  if (value?.__v39Type === "Map" && Array.isArray(value.entries)) return new Map(value.entries);
  return value;
}

function activeViewSnapshot() {
  const scene = window.__v39FieldRuntime?.game?.scene?.getScenes?.(true)?.[0];
  const camera = scene?.cameras?.main;
  return {
    camera:camera ? { scrollX:camera.scrollX, scrollY:camera.scrollY, zoom:camera.zoom } : null,
    selectedTile:scene?.v39SelectedTile ? { ...scene.v39SelectedTile } : null
  };
}

export function createV39SaveData() {
  const runtime = window.__v39FieldRuntime;
  const state = window.getV39GameState?.();
  if (!state) throw new Error("ゲーム状態が初期化されていません");
  return {
    format:SAVE_FORMAT,
    version:SAVE_VERSION,
    savedAt:new Date().toISOString(),
    gameState:stripDefinitionSnapshots(state),
    field:runtime?.mapData ? { settings:runtime.settings || {}, mapData:runtime.mapData } : null,
    view:activeViewSnapshot()
  };
}

export function exportV39SaveJson(space = 2) {
  return JSON.stringify(createV39SaveData(), encodeSpecialValues, space);
}

function validateSaveData(save) {
  if (!save || save.format !== SAVE_FORMAT) throw new Error("v39用のセーブデータではありません");
  if (Number(save.version) > SAVE_VERSION) throw new Error(`未対応のセーブバージョンです: ${save.version}`);
  if (!save.gameState || !Array.isArray(save.gameState.players)) throw new Error("プレイヤー状態がありません");
  if (save.field && !Array.isArray(save.field?.mapData?.grid)) throw new Error("マップ状態が不正です");
  return save;
}

const integer = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
const legacyRemainingTurns = (deadlineMs, currentMs) => Math.max(0, Math.ceil((Number(deadlineMs) - Number(currentMs)) / 1000) || 0);

function migrateDeadlineRecord(record, currentMs, currentTurn) {
  return Object.fromEntries(Object.entries(record || {}).map(([ownerId, deadlines]) => [ownerId,
    Object.fromEntries(Object.entries(deadlines || {}).map(([name, deadlineMs]) => [name,
      currentTurn + legacyRemainingTurns(deadlineMs, currentMs)]))
  ]));
}

function migrateEffectRecord(record, currentMs, currentTurn) {
  return Object.fromEntries(Object.entries(record || {}).map(([ownerId, effects]) => [ownerId,
    (Array.isArray(effects) ? effects : []).map(effect => {
      const { expiresAtMs, ...rest } = effect || {};
      return { ...rest, expiresAtTurn:currentTurn + legacyRemainingTurns(expiresAtMs, currentMs) };
    })
  ]));
}

function migratePendingRecord(record, currentMs, currentTurn) {
  return Object.fromEntries(Object.entries(record || {}).map(([ownerId, pending]) => {
    if (!pending || typeof pending !== "object") return [ownerId, pending];
    const { startedAtMs, resolvesAtMs, ...rest } = pending;
    return [ownerId, {
      ...rest,
      startedTurn:currentTurn,
      resolvesAtTurn:currentTurn + legacyRemainingTurns(resolvesAtMs, currentMs)
    }];
  }));
}

function migrateDeadUnit(unit, savedAtMs, currentTurn) {
  if (!unit || typeof unit !== "object") return unit;
  const { diedAtMs, deadAtMs, deadExpireAtMs, ...rest } = unit;
  if (!deadExpireAtMs) return unit;
  const diedAtTurn = Math.max(1, integer(unit?.deathTurn, currentTurn));
  return {
    ...rest,
    deathTurn:diedAtTurn,
    diedAtTurn,
    deadExpireTurn:currentTurn + legacyRemainingTurns(deadExpireAtMs, savedAtMs)
  };
}

function migrateGameStateTiming(gameState, savedAt) {
  const timeline = gameState?.timeline || {};
  const { elapsedMs:legacyElapsedMs, lastTurnAdvancedAtMs:_legacyTurnAdvancedAtMs, ...turnTimeline } = timeline;
  const currentTurn = Math.max(1, integer(timeline.turnNumber, 1));
  const currentMs = Math.max(0, Number(legacyElapsedMs) || 0);
  const savedAtMs = Number.isFinite(Date.parse(savedAt || "")) ? Date.parse(savedAt) : Date.now();
  const players = (gameState?.players || []).map(player => {
    const faction = player?.factionState || {};
    const runtime = faction.combatRuntime || {};
    return {
      ...player,
      factionState:{
        ...faction,
        units:(faction.units || []).map(unit => migrateDeadUnit(unit, savedAtMs, currentTurn)),
        deadUnitReserve:(faction.deadUnitReserve || []).map(entry => ({ ...entry, unit:migrateDeadUnit(entry?.unit, savedAtMs, currentTurn) })),
        combatRuntime:{
          ...runtime,
          pendingActionsByUnitId:migratePendingRecord(runtime.pendingActionsByUnitId, currentMs, currentTurn),
          cooldownsByUnitId:migrateDeadlineRecord(runtime.cooldownsByUnitId, currentMs, currentTurn),
          activeEffectsByUnitId:migrateEffectRecord(runtime.activeEffectsByUnitId, currentMs, currentTurn)
        }
      }
    };
  });
  const enemyRuntime = gameState?.enemyCombatRuntime || {};
  const { lastActionAtMsByEnemyId:_legacyEnemyActions, ...turnEnemyRuntime } = enemyRuntime;
  return {
    ...gameState,
    players,
    enemies:(gameState?.enemies || []).map(unit => migrateDeadUnit(unit, savedAtMs, currentTurn)),
    enemyCombatRuntime:{
      ...turnEnemyRuntime,
      pendingActionsByEnemyId:migratePendingRecord(enemyRuntime.pendingActionsByEnemyId, currentMs, currentTurn),
      cooldownsByEnemyId:migrateDeadlineRecord(enemyRuntime.cooldownsByEnemyId, currentMs, currentTurn),
      activeEffectsByEnemyId:migrateEffectRecord(enemyRuntime.activeEffectsByEnemyId, currentMs, currentTurn),
      lastActionTurnByEnemyId:{}
    },
    timeline:{ ...turnTimeline, phase:"player" }
  };
}

function migrateSaveData(save) {
  const sourceVersion = Math.max(1, Number(save?.version) || 1);
  let migrated = save;
  if (Number(migrated.version) < 2) {
    migrated = {
      ...migrated,
      version:2,
      gameState:stripDefinitionSnapshots(migrated.gameState)
    };
  }
  if (Number(migrated.version) < 3) {
    migrated = {
      ...migrated,
      version:3,
      gameState:migrateGameStateTiming(migrated.gameState, migrated.savedAt)
    };
  }
  return { save:migrated, sourceVersion };
}

function restoreView(view) {
  if (!view) return;
  let attempts = 0;
  const apply = () => {
    const scene = window.__v39FieldRuntime?.game?.scene?.getScenes?.(true)?.[0];
    if (!scene && attempts++ < 60) return window.setTimeout(apply, 25);
    if (!scene) return;
    if (view.selectedTile) scene.v39SelectedTile = { ...view.selectedTile };
    const camera = scene.cameras?.main;
    if (camera && view.camera) {
      camera.setZoom(Number(view.camera.zoom) || camera.zoom);
      scene.v39RequestedZoom = camera.zoom;
      camera.scrollX = Number(view.camera.scrollX) || 0;
      camera.scrollY = Number(view.camera.scrollY) || 0;
    }
    window.dispatchEvent(new CustomEvent("v39:save-view-restored", { detail:{ ...view } }));
  };
  apply();
}

export function importV39SaveJson(jsonText) {
  let save;
  try {
    save = JSON.parse(String(jsonText || ""), decodeSpecialValues);
  } catch {
    throw new Error("JSONを読み取れませんでした");
  }
  validateSaveData(save);
  const migration = migrateSaveData(save);
  save = validateSaveData(migration.save);
  if (save.field) window.loadV39FieldSnapshot?.(save.field.mapData, save.field.settings || {});
  window.setV39GameState?.(hydrateRuntimeDefinitions(save.gameState), { reason:"save-loaded" });
  restoreView(save.view);
  window.dispatchEvent(new CustomEvent("v39:save-loaded", {
    detail:{ version:save.version, sourceVersion:migration.sourceVersion, savedAt:save.savedAt || "" }
  }));
  return window.getV39GameState?.();
}

function downloadSave() {
  const blob = new Blob([exportV39SaveJson()], { type:"application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `fantasy-strategy-${new Date().toISOString().replaceAll(":", "-")}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function installSettingsUi() {
  const modal = document.getElementById("settingsModal");
  const body = modal?.querySelector(".modal-body");
  if (!(body instanceof HTMLElement)) return;
  body.innerHTML = `<div class="v39-save-settings">
    <section><h3>セーブ・ロード</h3><p>マップ、全プレイヤー、領土、研究、経済、戦闘、外交、地形イベント、カメラ位置を保存します。</p>
      <div><button type="button" id="v39-save-download">セーブを保存</button><button type="button" id="v39-save-load">セーブを読込</button><input id="v39-save-file" type="file" accept="application/json,.json" hidden></div>
      <output id="v39-save-status">未実行</output>
    </section>
    <section><h3>チーム編成</h3><p>現在は停止中です。</p></section>
  </div>`;
  const status = document.getElementById("v39-save-status");
  const input = document.getElementById("v39-save-file");
  document.getElementById("v39-save-download")?.addEventListener("click", () => {
    try { downloadSave(); status.textContent = "セーブを保存しました"; }
    catch (error) { status.textContent = error.message; }
  });
  document.getElementById("v39-save-load")?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", async () => {
    try {
      const file = input.files?.[0];
      if (!file) return;
      importV39SaveJson(await file.text());
      status.textContent = "セーブを読み込みました";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "読込に失敗しました";
    } finally {
      input.value = "";
    }
  });
}

function installStyles() {
  const style = document.createElement("style");
  style.textContent = `.v39-save-settings{display:grid;gap:10px}.v39-save-settings section{border:1px solid #3b4d54;border-radius:8px;background:#121e23;padding:12px}.v39-save-settings h3{margin:0 0 6px;font-size:16px}.v39-save-settings p,.v39-save-settings output{font-size:15px;color:#afbec1}.v39-save-settings section>div{display:flex;gap:8px;margin:10px 0}.v39-save-settings button{min-height:40px;border:1px solid #54717a;border-radius:7px;background:#173039;color:#edf5f3;padding:6px 12px;font-size:15px;font-weight:700}`;
  document.head.appendChild(style);
}

installStyles();
installSettingsUi();
window.createV39SaveData = createV39SaveData;
window.exportV39SaveJson = exportV39SaveJson;
window.importV39SaveJson = importV39SaveJson;
window.migrateV39SaveData = migrateSaveData;
