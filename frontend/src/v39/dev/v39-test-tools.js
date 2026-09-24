import { applyV39DerivedCharacterData } from "../unit/v39-character-derived-rules.js";
import { FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS, normalizeV39Village } from "../../lib/v39-economy-rules.js";
import { addResearchExperience } from "../../lib/research-progress.js";
import { getSelectedSettlement, replaceFactionSettlement } from "../../lib/settlement-state.js";
import { getGameDataTable } from "../../lib/game-data-registry.js";
import { getV39TestSkillRows } from "../../lib/v39-test-skill-rules.js";
import {
  resolveV39UnitRaceCategory,
  resolveV39UnitTotalExpForLevel,
  V39_UNIT_LEVEL_CAP
} from "../../lib/v39-unit-experience.js";

const RESOURCE_KEYS = [...new Set([...FOOD_RESOURCE_KEYS, ...MATERIAL_RESOURCE_KEYS])];
const CITY_LEVEL_KEYS = ["鍛冶Lv", "魔法Lv", "信仰Lv", "軍事Lv", "経済Lv"];
const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
let statusMessage = "テスト対象を選択してください";
let selectedEnemyId = "";
let selectedTestSkillName = "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}

function testModeEnabled() {
  const playMode = typeof window.getV39PlayMode === "function" ? window.getV39PlayMode() : "";
  if (playMode && playMode !== "single-test") return false;
  return window.isV39TestMode?.() === true || window.getV39DisplaySettings?.().testMode === true;
}

function testCharacterTemplatesByPlayer() {
  const source = getGameDataTable("テストゲーム状態", {});
  return new Map((Array.isArray(source?.players) ? source.players : []).map(player => [
    text(player?.id),
    {
      units:(Array.isArray(player?.factionState?.units) ? player.factionState.units : []).filter(unit => unit?.testOnly === true),
      squads:Array.isArray(player?.factionState?.squads) ? player.factionState.squads : []
    }
  ]));
}

function syncTestCharacters(enabled = testModeEnabled()) {
  const state = window.getV39GameState?.();
  if (!state?.players?.length) return false;
  const templatesByPlayer = testCharacterTemplatesByPlayer();
  let changed = false;
  const players = state.players.map(player => {
    const faction = player?.factionState;
    if (!faction) return player;
    const templates = templatesByPlayer.get(text(player.id)) || { units:[], squads:[] };
    let units = Array.isArray(faction.units) ? [...faction.units] : [];
    let squads = Array.isArray(faction.squads) ? faction.squads.map(row => ({ ...row, unitIds:[...(row?.unitIds || [])] })) : [];
    if (!enabled) {
      const removedIds = new Set([
        ...units.filter(unit => unit?.testOnly === true).map(unit => text(unit?.id)),
        ...templates.units.map(unit => text(unit?.id))
      ].filter(Boolean));
      const hasTestUnits = units.some(unit => removedIds.has(text(unit?.id)));
      const hasTestSquadRefs = squads.some(squad => (squad?.unitIds || []).some(id => removedIds.has(text(id))));
      if (!hasTestUnits && !hasTestSquadRefs) return player;
      units = units.filter(unit => !removedIds.has(text(unit?.id)));
      squads = squads.map(squad => ({ ...squad, unitIds:(squad.unitIds || []).filter(id => !removedIds.has(text(id))) }));
      const selectedUnitId = removedIds.has(text(faction.selectedUnitId))
        ? text(units.find(unit => unit?.state !== "死亡" && number(unit?.hp, unit?.currentHp) > 0)?.id, text(units[0]?.id))
        : text(faction.selectedUnitId);
      changed = true;
      return { ...player, factionState:{ ...faction, units, squads, selectedUnitId } };
    }

    const existingIds = new Set(units.map(unit => text(unit?.id)).filter(Boolean));
    const added = templates.units.filter(unit => !existingIds.has(text(unit?.id))).map(unit => structuredClone(unit));
    if (added.length) {
      units.push(...added);
      changed = true;
    }
    for (const templateSquad of templates.squads) {
      const testUnitIds = (templateSquad?.unitIds || []).map(text).filter(id => templates.units.some(unit => text(unit?.id) === id));
      if (!testUnitIds.length) continue;
      const squadIndex = squads.findIndex(squad => text(squad?.id) === text(templateSquad?.id));
      if (squadIndex < 0) {
        squads.push({ ...structuredClone(templateSquad), unitIds:testUnitIds });
        changed = true;
        continue;
      }
      const currentIds = squads[squadIndex].unitIds || [];
      const mergedIds = [...new Set([...currentIds, ...testUnitIds])];
      if (mergedIds.length !== currentIds.length) {
        squads[squadIndex] = { ...squads[squadIndex], unitIds:mergedIds };
        changed = true;
      }
    }
    return changed ? { ...player, factionState:{ ...faction, units, squads } } : player;
  });
  if (!changed) return false;
  window.setV39GameState?.({ players }, { reason:enabled ? "test-characters-enabled" : "test-characters-disabled" });
  return true;
}

function context() {
  const state = window.getV39GameState?.();
  const player = state?.players?.find(row => row.id === state.activePlayerId) || state?.players?.[0] || null;
  const faction = player?.factionState || null;
  const settlement = getSelectedSettlement(faction);
  const unit = (faction?.units || []).find(row => text(row?.id) === text(faction?.selectedUnitId)) || faction?.units?.[0] || null;
  const scene = window.__v39FieldRuntime?.game?.scene?.getScenes?.(true)?.[0];
  const tile = scene?.v39SelectedTile || null;
  return { state, player, faction, settlement, unit, tile };
}

function updateFaction(faction, reason) {
  window.updateV39ActiveFactionState?.(faction, { reason });
}

function updateSettlement(mutator, reason) {
  const { player, faction, settlement } = context();
  if (!player || !faction || !settlement) return false;
  const nextSettlement = normalizeV39Village(mutator({ ...settlement }), player.race);
  updateFaction(replaceFactionSettlement(faction, nextSettlement, { ownerPlayerId:player.id }), reason);
  return true;
}

function updateSelectedUnit(mutator, reason) {
  const { faction, unit } = context();
  if (!faction || !unit) return false;
  const units = (faction.units || []).map(row => row.id === unit.id ? mutator({ ...row }) : row);
  updateFaction({ ...faction, units }, reason);
  return true;
}

function setStatus(message) {
  statusMessage = text(message) || "完了";
  render();
}

function resourceAmount() {
  return Math.max(0, number(document.getElementById("v39-test-resource-amount")?.value, 100));
}

function selectedResourceKey() {
  return text(document.getElementById("v39-test-resource-key")?.value) || RESOURCE_KEYS[0] || "";
}

function changeResource(direction) {
  const key = selectedResourceKey();
  const amount = resourceAmount() * direction;
  const changed = updateSettlement(settlement => {
    const stockKey = FOOD_RESOURCE_KEYS.includes(key) ? "foodStockByType" : "materialStockByType";
    const stock = { ...(settlement[stockKey] || {}) };
    stock[key] = Math.max(0, number(stock[key]) + amount);
    return { ...settlement, [stockKey]:stock };
  }, "test-resource");
  setStatus(changed ? `${key} ${amount >= 0 ? "+" : ""}${amount}` : "拠点がありません");
}

function addAllResources() {
  const amount = resourceAmount();
  const changed = updateSettlement(settlement => ({
    ...settlement,
    foodStockByType:Object.fromEntries(FOOD_RESOURCE_KEYS.map(key => [key, number(settlement?.foodStockByType?.[key]) + amount])),
    materialStockByType:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key => [key, number(settlement?.materialStockByType?.[key]) + amount]))
  }), "test-all-resources");
  setStatus(changed ? `全資源 +${amount}` : "拠点がありません");
}

function changePopulation(delta) {
  const { player } = context();
  const race = text(player?.race) || "只人";
  const changed = updateSettlement(settlement => {
    const populationByRace = { ...(settlement.populationByRace || {}) };
    populationByRace[race] = Math.max(0, Math.floor(number(populationByRace[race]) + delta));
    return { ...settlement, populationByRace };
  }, "test-population");
  setStatus(changed ? `人口 ${delta >= 0 ? "+" : ""}${delta}` : "拠点がありません");
}

function changeUnitLevel(delta) {
  const changed = updateSelectedUnit(unit => {
    const oldMaxHp = Math.max(1, number(unit.maxHp ?? unit.status?.HP, 1));
    const hpRate = clamp(number(unit.hp ?? unit.currentHp, oldMaxHp) / oldMaxHp, 0, 1);
    const level = clamp(Math.floor(number(unit.level, 1) + delta), 1, V39_UNIT_LEVEL_CAP);
    const next = applyV39DerivedCharacterData({ ...unit, level });
    const category = resolveV39UnitRaceCategory(next);
    const totalExp = resolveV39UnitTotalExpForLevel(level, category);
    const maxHp = Math.max(1, number(next.maxHp ?? next.status?.HP, oldMaxHp));
    const hp = Math.round(maxHp * hpRate);
    return {
      ...next,
      exp:0,
      totalExp,
      status:{ ...(next.status || {}), exp:0, totalExp },
      hp,
      currentHp:hp
    };
  }, "test-unit-level");
  setStatus(changed ? `キャラLv ${delta >= 0 ? "+" : ""}${delta}` : "キャラが選択されていません");
}

function changeUnitVital(kind, action) {
  const changed = updateSelectedUnit(unit => {
    const max = Math.max(1, number(kind === "hp" ? (unit.maxHp ?? unit.status?.HP) : (unit.maxAp ?? unit.maxActionPoint), 100));
    const current = clamp(number(kind === "hp" ? (unit.hp ?? unit.currentHp) : (unit.ap ?? unit.currentAp), max), 0, max);
    const next = action === "full" ? max : action === "zero" ? 0 : clamp(current + number(action), 0, max);
    return kind === "hp"
      ? { ...unit, hp:next, currentHp:next, ...(next > 0 ? { state:"", deathCause:"", deathTurn:0, diedAtTurn:0 } : {}) }
      : { ...unit, ap:next, currentAp:next, actionPoint:next };
  }, `test-unit-${kind}`);
  setStatus(changed ? `${kind.toUpperCase()}を変更` : "キャラが選択されていません");
}

function changeCityLevel(delta) {
  const key = text(document.getElementById("v39-test-city-level-key")?.value) || CITY_LEVEL_KEYS[0];
  const changed = updateSettlement(settlement => ({
    ...settlement,
    cityLevels:{ ...(settlement.cityLevels || {}), [key]:clamp(Math.floor(number(settlement?.cityLevels?.[key]) + delta), 0, 99) }
  }), "test-city-level");
  setStatus(changed ? `${key} ${delta >= 0 ? "+" : ""}${delta}` : "拠点がありません");
}

function addResearchExp() {
  const amount = Math.max(1, Math.floor(number(document.getElementById("v39-test-research-exp")?.value, 100)));
  const { faction } = context();
  if (!faction) return setStatus("勢力データがありません");
  let research = faction.research;
  let changedCount = 0;
  for (const category of Object.keys(research?.selection || {})) {
    const result = addResearchExperience(research, category, amount);
    research = result.state;
    if (result.changed) changedCount += 1;
  }
  updateFaction({ ...faction, research }, "test-research-exp");
  setStatus(changedCount ? `選択研究 ${changedCount}件にEXP +${amount}` : "進行中の研究がありません");
}

function selectedTileKey(tile) {
  const x = Math.floor(Number(tile?.x));
  const y = Math.floor(Number(tile?.y));
  return Number.isFinite(x) && Number.isFinite(y) ? `${x},${y}` : "";
}

function changeTerritoryHp(action) {
  const { state, tile } = context();
  const key = selectedTileKey(tile);
  const current = state?.territoryStateByTile?.[key];
  if (!key || !current) return setStatus("領土マスを選択してください");
  const maxHp = Math.max(1, number(current.maxHp, 100));
  const hp = action === "full" ? maxHp : action === "zero" ? 0 : clamp(number(current.hp, maxHp) + number(action), 0, maxHp);
  window.updateV39TileState?.(tile.x, tile.y, {
    territoryState:{
      ...current,
      hp,
      maxHp,
      ...(hp > 0 ? { raided:false, raidedAtTurn:null, raidedByNestId:"" } : {})
    }
  });
  setStatus(`領土HP ${Math.round(hp)}/${Math.round(maxHp)}`);
}

function setSelectedSnowState(kind, enabled) {
  const { tile } = context();
  const key = selectedTileKey(tile);
  if (!key) return setStatus("積雪を変更するマスを選択してください");
  const setter = kind === "falling" ? window.setV39SnowfallAt : window.setV39SnowCoverAt;
  const changed = setter?.(tile.x, tile.y, enabled === true) === true;
  const label = kind === "falling" ? "降雪" : "積雪";
  setStatus(changed ? `${label} ${enabled ? "ON" : "OFF"}: ${key}` : `${label}を変更できませんでした`);
}

function forceTerrainEvent(mode) {
  const { tile } = context();
  if (!window.__v39FieldRuntime?.mapData) return setStatus("フィールドが未生成です");
  if (mode === "eruption" && !selectedTileKey(tile)) return setStatus("噴火させるマスを選択してください");
  const result = window.runV39TerrainTurn?.({
    eventMode:mode,
    force:true,
    forceTestEvent:true,
    markProcessed:false,
    ...(mode === "eruption" ? { forceEruptionAt:{ x:tile.x, y:tile.y } } : {})
  });
  setStatus(result?.ok ? `${mode === "eruption" ? "選択マスを噴火" : "溶岩を進行"}: ${result.events?.length || 0}件` : `実行失敗: ${result?.reason || "不明"}`);
}

function selectedTestSkill() {
  const rows = getV39TestSkillRows();
  if (!rows.some(row => text(row?.名前) === selectedTestSkillName)) {
    selectedTestSkillName = text(rows[0]?.名前);
  }
  return rows.find(row => text(row?.名前) === selectedTestSkillName) || null;
}

function assignTestSkill(all = false) {
  const rows = getV39TestSkillRows();
  const selected = selectedTestSkill();
  const names = all ? rows.map(row => text(row?.名前)).filter(Boolean) : [text(selected?.名前)].filter(Boolean);
  if (!names.length) return setStatus("テストスキルがありません");
  const changed = updateSelectedUnit(unit => ({
    ...unit,
    testSkillNames:[...new Set([...(Array.isArray(unit?.testSkillNames) ? unit.testSkillNames : []), ...names])]
  }), "test-skill-assigned");
  setStatus(changed ? `テストスキル付与: ${names.join(" / ")}` : "キャラが選択されていません");
}

function clearTestSkills() {
  const changed = updateSelectedUnit(unit => ({ ...unit, testSkillNames:[] }), "test-skills-cleared");
  setStatus(changed ? "テストスキルを解除しました" : "キャラが選択されていません");
}

function advanceTurn() {
  const ok = window.advanceV39Turn?.();
  setStatus(ok ? "1ターン進めました" : "ターンを進められません");
}

function panelHtml() {
  const { state, settlement, unit, tile } = context();
  const resource = selectedResourceKey();
  const cityLevel = text(document.getElementById("v39-test-city-level-key")?.value) || CITY_LEVEL_KEYS[0];
  const tileKey = selectedTileKey(tile);
  const testSkills = getV39TestSkillRows();
  if (!testSkills.some(row => text(row?.名前) === selectedTestSkillName)) selectedTestSkillName = text(testSkills[0]?.名前);
  const assignedTestSkills = Array.isArray(unit?.testSkillNames) ? unit.testSkillNames.map(text).filter(Boolean) : [];
  const testSkillOptions = testSkills.map(row => {
    const name = text(row?.名前);
    return `<option value="${escapeHtml(name)}"${name === selectedTestSkillName ? " selected" : ""}>${escapeHtml(name)}</option>`;
  }).join("");
  const enemies = (state?.enemies || []).filter(enemy => number(enemy?.hp, enemy?.currentHp) > 0 && text(enemy?.state, "生存") !== "死亡");
  const enemiesOnTile = tileKey ? enemies.filter(enemy => selectedTileKey(enemy) === tileKey) : [];
  if (!enemies.some(enemy => text(enemy?.id) === selectedEnemyId)) selectedEnemyId = text(enemiesOnTile[0]?.id || enemies[0]?.id);
  const enemyDebug = window.inspectV39EnemyAi?.(selectedEnemyId) || null;
  const playerDetection = enemyDebug ? window.inspectV39PlayerDetectionForEnemy?.(selectedEnemyId) || null : null;
  const cooldownText = enemyDebug ? Object.entries(enemyDebug.cooldowns || {}).map(([name, turns]) => `${name}:${turns}T`).join(" / ") : "";
  const playerDetectionText = playerDetection
    ? `${playerDetection.detected ? "発見済み" : "未発見"} / ${playerDetection.inCurrentVision ? "索敵範囲内" : "索敵範囲外"} / 有効索敵${playerDetection.observerScout ?? "-"} / 隠密${playerDetection.targetStealth} / ${playerDetection.reason}`
    : "判定データなし";
  const enemyOptions = enemies.map(enemy => `<option value="${escapeHtml(enemy.id)}"${text(enemy.id) === selectedEnemyId ? " selected" : ""}>${escapeHtml(enemy.name || enemy.id)} (${Math.floor(number(enemy.x))},${Math.floor(number(enemy.y))})</option>`).join("");
  return `
    <header class="v39-test-tools-head"><button type="button" id="v39-test-tools-back">← 管理</button><strong>テスト操作</strong><span>TEST</span></header>
    <div class="v39-test-tools-scroll">
      <section><h3>フィールド</h3><p>選択マス ${tileKey || "なし"}</p><div class="v39-test-button-row"><button data-test-action="eruption">選択マスを噴火</button><button data-test-action="lava">溶岩を1回進行</button><button data-test-action="snow-on">積雪ON</button><button data-test-action="snow-off">積雪OFF</button><button data-test-action="snowfall-on">降雪ON</button><button data-test-action="snowfall-off">降雪OFF</button><button data-test-action="turn">1ターン進行</button></div></section>
      <section><h3>拠点・資源</h3><p>${text(settlement?.name || settlement?.type) || "拠点なし"} / 人口 ${Math.floor(number(settlement?.population))}</p><div class="v39-test-form-row"><select id="v39-test-resource-key">${RESOURCE_KEYS.map(key => `<option value="${key}"${key === resource ? " selected" : ""}>${key}</option>`).join("")}</select><input id="v39-test-resource-amount" type="number" min="0" step="10" value="100"><button data-test-action="resource-minus">減らす</button><button data-test-action="resource-plus">増やす</button><button data-test-action="resource-all">全資源+</button></div><div class="v39-test-button-row"><button data-test-action="population-minus">人口-10</button><button data-test-action="population-plus">人口+10</button></div></section>
      <section><h3>キャラクター</h3><p>${text(unit?.name) || "未選択"} / Lv${Math.floor(number(unit?.level, 1))} / HP ${Math.floor(number(unit?.hp ?? unit?.currentHp))}/${Math.floor(number(unit?.maxHp ?? unit?.status?.HP))} / AP ${Math.floor(number(unit?.ap ?? unit?.currentAp))}/${Math.floor(number(unit?.maxAp, 100))}</p><div class="v39-test-button-row"><button data-test-action="level-minus">Lv-1</button><button data-test-action="level-plus">Lv+1</button><button data-test-action="level-plus10">Lv+10</button><button data-test-action="hp-full">HP全快</button><button data-test-action="hp-minus">HP-10</button><button data-test-action="hp-zero">HP0</button><button data-test-action="ap-full">AP全快</button><button data-test-action="ap-minus">AP-10</button></div></section>
      <section><h3>テストスキル</h3><p>${text(unit?.name) || "未選択"} / 付与中: ${assignedTestSkills.length ? assignedTestSkills.map(escapeHtml).join(" / ") : "なし"}</p><div class="v39-test-form-row"><select id="v39-test-skill-name">${testSkillOptions || '<option value="">テストスキルなし</option>'}</select><button data-test-action="test-skill-add">選択を付与</button><button data-test-action="test-skill-all">即死・蘇生を付与</button><button data-test-action="test-skill-clear">全解除</button></div></section>
      <section><h3>敵AI診断</h3>${enemies.length ? `<div class="v39-test-form-row"><select id="v39-test-enemy-id">${enemyOptions}</select></div>${enemyDebug ? `<div class="v39-test-ai-grid"><span>判断</span><b>${escapeHtml(enemyDebug.decision)}</b><span>理由</span><b>${escapeHtml(enemyDebug.reason)}</b><span>好戦性</span><b>${enemyDebug.aggressive ? "好戦的" : enemyDebug.retaliating ? "反撃中（非好戦的）" : "非好戦的"}</b><span>位置</span><b>(${enemyDebug.x},${enemyDebug.y}) / Lv${enemyDebug.level}</b><span>HP / AP</span><b>${enemyDebug.hp}/${enemyDebug.maxHp} / ${enemyDebug.ap}/${enemyDebug.maxAp}</b><span>索敵</span><b>半径${enemyDebug.visionRadius} / 値${enemyDebug.scout}</b><span>プレイヤー発見</span><b>${escapeHtml(playerDetectionText)}</b><span>認識標的</span><b>${escapeHtml(enemyDebug.targetName || "なし")}${enemyDebug.targetDistance == null ? "" : ` / 距離${enemyDebug.targetDistance}`}</b><span>敵対記憶</span><b>${escapeHtml(enemyDebug.aggroTargetUnitId || "なし")}</b><span>攻撃候補</span><b>${escapeHtml(enemyDebug.attackSkillNames.join(" / ") || "なし")}</b><span>所属巣</span><b>${escapeHtml(enemyDebug.nestName || "巣なし")}${enemyDebug.nestId ? ` / ${escapeHtml(enemyDebug.nestId)}` : ""}${enemyDebug.nestDistance == null ? "" : ` / 距離${enemyDebug.nestDistance}`}</b><span>縄張り</span><b>${enemyDebug.hasNest ? `中心(${enemyDebug.territoryCenter.x},${enemyDebug.territoryCenter.y}) / 半径${enemyDebug.territoryRadius} / 追跡限界${enemyDebug.pursuitLimit}` : "なし（巣なし個体）"}</b><span>逃走</span><b>基準${Math.round(enemyDebug.fleeThreshold*100)}% / ${enemyDebug.fleeState?.active ? "逃走中" : enemyDebug.fleeDecisionMade ? "判定済み" : "未発動"}</b><span>前回行動</span><b>T${enemyDebug.lastActionTurn || "-"}</b><span>発動待機 / CT</span><b>${escapeHtml(enemyDebug.pendingSkillName ? `${enemyDebug.pendingSkillName}:${enemyDebug.pendingTurns}T` : cooldownText || "なし")}</b></div>` : '<p>診断データを取得できません</p>'}` : '<p>生存している敵がいません</p>'}</section>
      <section><h3>拠点技能・研究</h3><div class="v39-test-form-row"><select id="v39-test-city-level-key">${CITY_LEVEL_KEYS.map(key => `<option value="${key}"${key === cityLevel ? " selected" : ""}>${key}</option>`).join("")}</select><button data-test-action="city-level-minus">-1</button><button data-test-action="city-level-plus">+1</button><input id="v39-test-research-exp" type="number" min="1" step="10" value="100"><button data-test-action="research-exp">選択研究EXP+</button></div></section>
      <section><h3>選択領土</h3><div class="v39-test-button-row"><button data-test-action="territory-minus">HP-25</button><button data-test-action="territory-zero">HP0</button><button data-test-action="territory-full">HP全快</button></div></section>
    </div>
    <output id="v39-test-tools-status">${statusMessage}</output>`;
}

function render() {
  const panel = document.getElementById("v39-test-tools-panel");
  if (!(panel instanceof HTMLElement) || panel.hidden) return;
  panel.innerHTML = panelHtml();
}

function openPanel() {
  if (!testModeEnabled()) return;
  const menu = document.getElementById("v39-manage-menu");
  const panel = document.getElementById("v39-test-tools-panel");
  if (!menu || !panel) return;
  menu.hidden = true;
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  render();
}

function closePanel() {
  const menu = document.getElementById("v39-manage-menu");
  const panel = document.getElementById("v39-test-tools-panel");
  if (!menu || !panel) return;
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  menu.hidden = false;
}

function handleAction(action) {
  if (!testModeEnabled()) return closePanel();
  const handlers = {
    eruption:() => forceTerrainEvent("eruption"), lava:() => forceTerrainEvent("lava"),
    "snow-on":() => setSelectedSnowState("cover", true), "snow-off":() => setSelectedSnowState("cover", false),
    "snowfall-on":() => setSelectedSnowState("falling", true), "snowfall-off":() => setSelectedSnowState("falling", false),
    turn:advanceTurn,
    "resource-minus":() => changeResource(-1), "resource-plus":() => changeResource(1), "resource-all":addAllResources,
    "population-minus":() => changePopulation(-10), "population-plus":() => changePopulation(10),
    "level-minus":() => changeUnitLevel(-1), "level-plus":() => changeUnitLevel(1), "level-plus10":() => changeUnitLevel(10),
    "hp-full":() => changeUnitVital("hp", "full"), "hp-minus":() => changeUnitVital("hp", -10), "hp-zero":() => changeUnitVital("hp", "zero"),
    "ap-full":() => changeUnitVital("ap", "full"), "ap-minus":() => changeUnitVital("ap", -10),
    "test-skill-add":() => assignTestSkill(false), "test-skill-all":() => assignTestSkill(true), "test-skill-clear":clearTestSkills,
    "city-level-minus":() => changeCityLevel(-1), "city-level-plus":() => changeCityLevel(1), "research-exp":addResearchExp,
    "territory-minus":() => changeTerritoryHp(-25), "territory-zero":() => changeTerritoryHp("zero"), "territory-full":() => changeTerritoryHp("full")
  };
  handlers[action]?.();
}

function installStyles() {
  if (document.getElementById("v39-test-tools-style")) return;
  const style = document.createElement("style");
  style.id = "v39-test-tools-style";
  style.textContent = `html:not(.v39-test-mode) #v39-manage-test-tools{display:none!important}.v39-test-tools-panel{width:100%;height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:6px;color:#e7efed}.v39-test-tools-panel[hidden]{display:none!important}.v39-test-tools-head{display:flex;align-items:center;gap:8px}.v39-test-tools-head button,.v39-test-tools-panel button,.v39-test-tools-panel select,.v39-test-tools-panel input{min-height:34px;border:1px solid #49626a;border-radius:6px;background:#14242a;color:#edf3f1;padding:5px 9px;font-size:15px;font-weight:700}.v39-test-tools-head span{margin-left:auto;color:#f1c96f}.v39-test-tools-scroll{min-height:0;overflow:auto;display:grid;gap:7px;align-content:start}.v39-test-tools-scroll section{border:1px solid #354a51;border-radius:7px;background:#101c21;padding:7px;display:grid;gap:5px}.v39-test-tools-scroll h3,.v39-test-tools-scroll p{margin:0;font-size:15px}.v39-test-tools-scroll p{color:#aebdc0}.v39-test-button-row,.v39-test-form-row{display:flex;flex-wrap:wrap;gap:5px}.v39-test-form-row select{min-width:130px}.v39-test-form-row input{width:100px}.v39-test-ai-grid{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:3px 9px;font-size:15px}.v39-test-ai-grid span{color:#91a5aa}.v39-test-ai-grid b{min-width:0;overflow-wrap:anywhere}.v39-test-log-tabs{display:flex;gap:5px;overflow-x:auto;padding-bottom:3px}.v39-test-log-tabs button{flex:0 0 auto}.v39-test-log-tabs button.active{border-color:#63d6e7;background:#1d4b55}.v39-test-log-tabs small{color:#a9bbc0}.v39-test-ai-log{max-height:220px;overflow:auto;border:1px solid #293c42;border-radius:6px}.v39-test-ai-log article{display:grid;grid-template-columns:38px minmax(90px,auto) minmax(120px,1fr);gap:5px 8px;padding:7px;border-bottom:1px solid #293c42;font-size:15px}.v39-test-ai-log article span{color:#78d19a}.v39-test-ai-log article strong{color:#f0d17b}.v39-test-ai-log article p{grid-column:2/-1}.v39-test-tools-panel button:active{background:#28505a}.v39-test-tools-panel output{min-height:30px;padding:6px 9px;border:1px solid #735f2f;border-radius:6px;background:#2c2616;color:#ffe29a;font-size:15px;font-weight:700}@media(max-width:620px){.v39-test-tools-panel button,.v39-test-tools-panel select,.v39-test-tools-panel input{font-size:14px;padding:4px 7px}.v39-test-tools-scroll section{padding:6px}.v39-test-ai-grid,.v39-test-ai-log article{font-size:14px}.v39-test-ai-log article{grid-template-columns:34px minmax(80px,auto) minmax(100px,1fr)}}`;
  document.head.appendChild(style);
}

function install() {
  const host = document.getElementById("footManage");
  if (!(host instanceof HTMLElement)) return window.setTimeout(install, 30);
  installStyles();
  const panel = document.createElement("section");
  panel.id = "v39-test-tools-panel";
  panel.className = "v39-test-tools-panel";
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  host.appendChild(panel);
  document.getElementById("v39-manage-test-tools")?.addEventListener("click", openPanel);
  panel.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("#v39-test-tools-back")) return closePanel();
    const button = event.target instanceof Element ? event.target.closest("[data-test-action]") : null;
    if (button) handleAction(button.dataset.testAction);
  });
  panel.addEventListener("change", event => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    if (event.target.id === "v39-test-enemy-id") selectedEnemyId = text(event.target.value);
    else if (event.target.id === "v39-test-skill-name") selectedTestSkillName = text(event.target.value);
    else return;
    render();
  });
  window.addEventListener("v39:display-settings-changed", () => {
    const enabled = testModeEnabled();
    syncTestCharacters(enabled);
    if (!enabled) closePanel();
    else render();
  });
  window.addEventListener("v39:game-state-changed", render);
  window.addEventListener("v39:tile-selected", event => {
    const key = selectedTileKey(event?.detail);
    const enemy = (window.getV39GameState?.()?.enemies || []).find(row => selectedTileKey(row) === key && number(row?.hp, row?.currentHp) > 0);
    if (enemy) selectedEnemyId = text(enemy.id);
    render();
  });
  window.openV39TestTools = openPanel;
  syncTestCharacters(testModeEnabled());
}

install();
