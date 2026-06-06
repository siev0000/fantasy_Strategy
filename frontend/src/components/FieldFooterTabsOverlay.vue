<script setup>
import { computed, ref, watch } from "vue";
import EffectPlayerOverlay from "./EffectPlayerOverlay.vue";
import skillInfoDb from "../../../data/source/export/json/スキル一覧.json";
import { computeSkillScaledTriplet } from "../lib/skill-power.js";
import { getIconSrcByName, hasIconName } from "../lib/icon-library.js";

const FOOTER_TAB_DEFS = Object.freeze([
  { key: "unit", label: "ユニット" },
  { key: "tile", label: "土地" },
  { key: "tileData", label: "土地データ" },
  { key: "effect", label: "エフェクト" }
]);

const STATUS_INLINE_FIELDS = Object.freeze([
  { key: "攻撃", label: "攻撃" },
  { key: "防御", label: "防御" },
  { key: "魔力", label: "魔力" },
  { key: "精神", label: "魔防" },
  { key: "速度", label: "速度" },
  { key: "命中", label: "命中" },
  { key: "SIZ", label: "SIZ" }
]);

const ENEMY_BASE_STATUS_FIELDS = STATUS_INLINE_FIELDS;
const ENEMY_DETAIL_TAB_DEFS = Object.freeze([
  { key: "base", label: "基礎" },
  { key: "resistance", label: "耐性" },
  { key: "skill", label: "スキル" }
]);

const props = defineProps({
  selectedTileDetail: { type: Object, default: null },
  tileUnits: { type: Array, default: () => [] },
  tileEnemyUnits: { type: Array, default: () => [] },
  selectedUnitId: { type: String, default: "" },
  canPlayEffect: { type: Boolean, default: false },
  showTestControls: { type: Boolean, default: false }
});

const emit = defineEmits([
  "play-effect",
  "select-unit",
  "move-request",
  "attack-request",
  "open-skill-request",
  "enemy-hp-adjust"
]);

const activeTab = ref("unit");
const unitTabView = ref("list");
const selectedFooterUnitKey = ref("");
const selectedCharacterId = ref("");
const selectedEnemyId = ref("");
const enemyDetailTab = ref("base");
const selectedEnemySkillName = ref("");

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function toSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

const SKILL_INFO_BY_NAME = new Map(
  (Array.isArray(skillInfoDb) ? skillInfoDb : [])
    .map(row => [nonEmptyText(row?.名前), row])
    .filter(([name]) => !!name)
);

const tileUnitRows = computed(() => {
  const source = Array.isArray(props.tileUnits) ? props.tileUnits : [];
  return source.filter(unit => unit && typeof unit === "object");
});

const selectedCharacter = computed(() => {
  const selectedId = nonEmptyText(selectedCharacterId.value);
  if (!selectedId) return tileUnitRows.value[0] || null;
  return tileUnitRows.value.find(unit => nonEmptyText(unit?.id) === selectedId) || tileUnitRows.value[0] || null;
});

const tileEnemyRows = computed(() => {
  const source = Array.isArray(props.tileEnemyUnits) ? props.tileEnemyUnits : [];
  return source.filter(unit => unit && typeof unit === "object");
});

const tileFooterUnitEntries = computed(() => {
  const out = [];
  for (const unit of tileUnitRows.value) {
    const id = nonEmptyText(unit?.id);
    if (!id) continue;
    out.push({
      key: `ally:${id}`,
      type: "ally",
      unit
    });
  }
  for (const unit of tileEnemyRows.value) {
    const id = nonEmptyText(unit?.id);
    if (!id) continue;
    out.push({
      key: `enemy:${id}`,
      type: "enemy",
      unit
    });
  }
  return out;
});

const selectedFooterUnitEntry = computed(() => {
  const key = nonEmptyText(selectedFooterUnitKey.value);
  if (!key) return tileFooterUnitEntries.value[0] || null;
  return tileFooterUnitEntries.value.find(entry => entry.key === key) || tileFooterUnitEntries.value[0] || null;
});

const selectedFooterUnitType = computed(() => {
  return nonEmptyText(selectedFooterUnitEntry.value?.type);
});

const selectedFooterUnitIsAlly = computed(() => selectedFooterUnitType.value === "ally");
const selectedFooterUnitIsEnemy = computed(() => selectedFooterUnitType.value === "enemy");
const hasMultipleFooterUnits = computed(() => tileFooterUnitEntries.value.length > 1);

const selectedEnemy = computed(() => {
  const selectedId = nonEmptyText(selectedEnemyId.value);
  if (!selectedId) return tileEnemyRows.value[0] || null;
  return tileEnemyRows.value.find(unit => nonEmptyText(unit?.id) === selectedId) || tileEnemyRows.value[0] || null;
});

const tileSummaryRows = computed(() => {
  const detail = props.selectedTileDetail;
  if (!detail || typeof detail !== "object") return [];
  return [
    { label: "地形", value: nonEmptyText(detail.title) || nonEmptyText(detail.terrain) || "-" },
    { label: "領土", value: nonEmptyText(detail.territory) || "-" },
    { label: "危険度", value: nonEmptyText(detail.danger) || "-" },
    { label: "高度", value: nonEmptyText(detail.heightLevel) ? `Lv ${detail.heightLevel}` : "-" },
    { label: "川", value: nonEmptyText(detail.river) || "-" },
    { label: "滝", value: nonEmptyText(detail.waterfall) || "-" },
    { label: "施設", value: nonEmptyText(detail.facilities) || "-" },
    { label: "ユニット", value: nonEmptyText(detail.units) || "-" },
    { label: "敵", value: nonEmptyText(detail.enemies) || "-" }
  ];
});

const tileDataRows = computed(() => {
  const detail = props.selectedTileDetail;
  if (!detail || typeof detail !== "object") return [];
  const rows = [
    { label: "領土", value: nonEmptyText(detail.territory) || "-" },
    { label: "危険度", value: nonEmptyText(detail.danger) || "-" },
    { label: "高度", value: nonEmptyText(detail.heightLevel) ? `Lv ${detail.heightLevel}` : "-" },
    { label: "キャンプ", value: nonEmptyText(detail.camp) || "-", wide: false },
    { label: "敵", value: nonEmptyText(detail.enemies) || "-", wide: true },
    { label: "町状態", value: nonEmptyText(detail.village) || "-", wide: true },
    { label: "領土状態", value: nonEmptyText(detail.development) || "-", wide: true },
    { label: "回復補正", value: nonEmptyText(detail.tileRecovery) || "-", wide: true },
    { label: "施設", value: nonEmptyText(detail.facilities) || "-", wide: true },
    { label: "ユニット", value: nonEmptyText(detail.units) || "-", wide: true },
    { label: "移動停止", value: nonEmptyText(detail.moveStopReason) || "-", wide: true }
  ];
  if (props.showTestControls) {
    rows.splice(5, 0, {
      label: "敵索敵/隠密",
      value: nonEmptyText(detail.enemySense) || "-",
      wide: true
    });
  }
  return rows;
});

function buildHpState(unit) {
  if (!unit) return { current: 0, max: 0, ratio: 0 };
  const max = Math.max(
    0,
    Math.round(
      toSafeNumber(unit?.status?.HP, toSafeNumber(unit?.maxHp, 0))
    )
  );
  const current = Math.max(
    0,
    Math.round(
      toSafeNumber(unit?.hp, toSafeNumber(unit?.currentHp, max))
    )
  );
  const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return { current, max, ratio };
}

function resolveUnitStateLabel(unit) {
  const state = nonEmptyText(unit?.status?.状態);
  if (state) return state;
  const hpState = buildHpState(unit);
  if (hpState.current <= 0 && hpState.max > 0) return "死亡";
  return "";
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function resolveHpHueByRatio(ratioRaw) {
  const ratio = clamp01(ratioRaw);
  if (ratio <= 0.2) return 0;
  if (ratio <= 0.5) {
    const t = (ratio - 0.2) / 0.3;
    return Math.round(t * 60);
  }
  const t = (ratio - 0.5) / 0.5;
  return Math.round(60 + (t * 60));
}

function buildHpFillGradientByRatio(ratioRaw) {
  const hue = resolveHpHueByRatio(ratioRaw);
  const start = `hsl(${hue} 82% 38%)`;
  const end = `hsl(${hue} 90% 56%)`;
  return `linear-gradient(90deg, ${start}, ${end})`;
}

function buildHpBarFillStyle(hpState) {
  const ratio = clamp01(hpState?.ratio);
  return {
    width: `${Math.round(ratio * 1000) / 10}%`,
    background: buildHpFillGradientByRatio(ratio)
  };
}

const selectedCharacterHpState = computed(() => {
  const unit = selectedCharacter.value;
  return buildHpState(unit);
});

function normalizeSelectedCharacter() {
  const candidates = tileUnitRows.value;
  if (!candidates.length) {
    selectedCharacterId.value = "";
    return;
  }
  const requestedId = nonEmptyText(props.selectedUnitId);
  if (requestedId && candidates.some(unit => nonEmptyText(unit?.id) === requestedId)) {
    selectedCharacterId.value = requestedId;
    return;
  }
  if (candidates.some(unit => nonEmptyText(unit?.id) === nonEmptyText(selectedCharacterId.value))) return;
  selectedCharacterId.value = nonEmptyText(candidates[0]?.id);
}

function normalizeSelectedEnemy() {
  const candidates = tileEnemyRows.value;
  if (!candidates.length) {
    // 一時的に敵配列が空になっても選択IDは保持し、復帰時の未選択化を防ぐ。
    return;
  }
  const currentId = nonEmptyText(selectedEnemyId.value);
  if (!currentId) {
    selectedEnemyId.value = nonEmptyText(candidates[0]?.id);
    return;
  }
  // 一時的な配列更新でIDが揺れた時に選択解除されないよう、ここでは先頭への強制上書きをしない。
}

function normalizeSelectedFooterUnit() {
  const entries = tileFooterUnitEntries.value;
  if (!entries.length) {
    selectedFooterUnitKey.value = "";
    unitTabView.value = "list";
    return;
  }
  const selectedUnitId = nonEmptyText(props.selectedUnitId);
  if (selectedUnitId) {
    const preferredAlly = entries.find(entry => entry.type === "ally" && nonEmptyText(entry?.unit?.id) === selectedUnitId);
    if (preferredAlly) {
      selectedFooterUnitKey.value = preferredAlly.key;
      selectedCharacterId.value = selectedUnitId;
      return;
    }
  }
  const current = nonEmptyText(selectedFooterUnitKey.value);
  if (current && entries.some(entry => entry.key === current)) {
    unitTabView.value = entries.length > 1 ? unitTabView.value : "detail";
    return;
  }
  selectedFooterUnitKey.value = entries[0].key;
  unitTabView.value = entries.length > 1 ? "list" : "detail";
}

const RESISTANCE_ICON_NAME_FALLBACK_MAP = Object.freeze({
  "物理耐性": "物理",
  "魔法耐性": "魔法",
  "射撃耐性": "弓",
  "切断耐性": "剣使い",
  "貫通耐性": "槍使い",
  "打撃耐性": "棍使い",
  "炎耐性": "炎",
  "氷耐性": "氷",
  "雷耐性": "雷",
  "毒耐性": "毒",
  "光耐性": "光",
  "闇耐性": "闇",
  "精神耐性": "精神",
  "盲目耐性": "盲目",
  "怯み耐性": "怯み",
  "出血耐性": "出血",
  "拘束耐性": "拘束",
  "幻覚耐性": "幻覚",
  "Cr率耐性": "Cr率",
  "Cr威力耐性": "Cr威力"
});

function resolveResistanceIconName(labelRaw) {
  const label = nonEmptyText(labelRaw);
  if (!label) return "";
  const mapped = nonEmptyText(RESISTANCE_ICON_NAME_FALLBACK_MAP[label]);
  if (mapped) return mapped;
  return label.replace(/耐性$/u, "");
}

function resolveUnitIconGlyph(unit, fallback = "?") {
  const iconName = nonEmptyText(unit?.iconName);
  if (iconName) return iconName.slice(0, 1);
  const raceName = nonEmptyText(unit?.race);
  if (raceName) return raceName.slice(0, 1);
  return fallback;
}

function unitHpRingStyle(unit) {
  const hp = buildHpState(unit);
  const ratio = clamp01(toSafeNumber(hp?.ratio, 0));
  const deg = Math.round(ratio * 3600) / 10;
  const hue = resolveHpHueByRatio(ratio);
  const color = `hsl(${hue} 86% 56%)`;
  return {
    "--unit-hp-ring-deg": `${deg}deg`,
    "--unit-hp-ring-color": color
  };
}

const selectedEnemyHpState = computed(() => {
  return buildHpState(selectedEnemy.value);
});

const selectedEnemyResistanceRows = computed(() => {
  const enemy = selectedEnemy.value;
  if (!enemy || typeof enemy !== "object") return [];
  const out = [];
  const seen = new Set();
  const pushRow = (labelRaw, valueRaw) => {
    const label = nonEmptyText(labelRaw);
    if (!label || seen.has(label)) return;
    const value = Math.round(toSafeNumber(valueRaw, Number.NaN));
    if (!Number.isFinite(value)) return;
    const iconName = resolveResistanceIconName(label);
    const iconFound = iconName ? hasIconName(iconName) : false;
    const iconSrc = iconFound ? getIconSrcByName(iconName, "") : "";
    seen.add(label);
    out.push({ label, value, iconName, iconSrc, iconFound });
  };
  const direct = enemy?.resistances && typeof enemy.resistances === "object" ? enemy.resistances : {};
  for (const [key, value] of Object.entries(direct)) {
    pushRow(key, value);
  }
  const status = enemy?.status && typeof enemy.status === "object" ? enemy.status : {};
  for (const [key, value] of Object.entries(status)) {
    if (!String(key).includes("耐性")) continue;
    pushRow(key, value);
  }
  return out;
});

const selectedEnemySkillNames = computed(() => {
  const source = Array.isArray(selectedEnemy.value?.skills) ? selectedEnemy.value.skills : [];
  const out = [];
  const seen = new Set();
  for (const raw of source) {
    const name = nonEmptyText(raw);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
});

const selectedEnemySkillRows = computed(() => {
  return selectedEnemySkillNames.value.map(name => ({
    name,
    row: SKILL_INFO_BY_NAME.get(name) || null
  }));
});

const selectedEnemySkillDetail = computed(() => {
  const selectedName = nonEmptyText(selectedEnemySkillName.value);
  if (!selectedName) return selectedEnemySkillRows.value[0] || null;
  return selectedEnemySkillRows.value.find(entry => entry.name === selectedName) || selectedEnemySkillRows.value[0] || null;
});

const selectedEnemySkillApCost = computed(() => {
  const row = selectedEnemySkillDetail.value?.row;
  if (!row || typeof row !== "object") return "-";
  const value = nonEmptyText(row?.AP消費);
  return value || "-";
});

const selectedEnemySkillPower = computed(() => {
  const row = selectedEnemySkillDetail.value?.row;
  if (!row || typeof row !== "object") return "-";
  const statusSource = selectedEnemy.value?.status || null;
  const scaled = computeSkillScaledTriplet(row, statusSource);
  const power = Math.round(toSafeNumber(scaled?.power, Number.NaN));
  if (Number.isFinite(power)) return String(power);
  const total = nonEmptyText(row?.全威力);
  if (total && total !== "-") return total;
  return "-";
});

const selectedEnemySkillDetailText = computed(() => {
  const row = selectedEnemySkillDetail.value?.row;
  if (!row || typeof row !== "object") return "";
  const effect = nonEmptyText(row?.効果);
  const detail = nonEmptyText(row?.詳細);
  if (detail) return detail;
  return effect;
});

function statusValue(unit, key) {
  if (!unit || typeof unit !== "object") return "-";
  const raw = Number(unit?.status?.[key]);
  if (!Number.isFinite(raw)) return "-";
  return String(Math.round(raw));
}

function selectCharacter(unitId) {
  const id = nonEmptyText(unitId);
  if (!id) return;
  selectedCharacterId.value = id;
  selectedFooterUnitKey.value = `ally:${id}`;
  emit("select-unit", { unitId: id });
}

function selectEnemy(unitId) {
  const id = nonEmptyText(unitId);
  if (!id) return;
  selectedEnemyId.value = id;
  selectedFooterUnitKey.value = `enemy:${id}`;
}

function selectFooterUnit(entryKey) {
  const key = nonEmptyText(entryKey);
  if (!key) return;
  const found = tileFooterUnitEntries.value.find(entry => entry.key === key);
  if (!found) return;
  selectedFooterUnitKey.value = found.key;
  const id = nonEmptyText(found?.unit?.id);
  if (!id) return;
  if (found.type === "ally") {
    selectCharacter(id);
  } else {
    selectEnemy(id);
  }
}

function openFooterUnitDetail(entryKey) {
  selectFooterUnit(entryKey);
  unitTabView.value = "detail";
  enemyDetailTab.value = "base";
}

function backFooterUnitList() {
  unitTabView.value = hasMultipleFooterUnits.value ? "list" : "detail";
}

function adjustSelectedEnemyHp(deltaRaw = 0) {
  const enemyId = nonEmptyText(selectedEnemy.value?.id);
  if (!enemyId) return;
  const delta = Math.floor(toSafeNumber(deltaRaw, 0));
  if (!delta) return;
  emit("enemy-hp-adjust", { enemyId, delta });
}

function emitAction(eventName) {
  const id = nonEmptyText(selectedCharacter.value?.id);
  if (!id) return;
  emit(eventName, { unitId: id });
}

function handleAttackClick() {
  const id = nonEmptyText(selectedCharacter.value?.id);
  if (!id) return;
  emit("attack-request", { unitId: id });
  emit("open-skill-request", { unitId: id });
}

watch([tileUnitRows, () => props.selectedUnitId], () => {
  normalizeSelectedCharacter();
}, { immediate: true });

watch(tileEnemyRows, () => {
  normalizeSelectedEnemy();
}, { immediate: true });

watch([tileFooterUnitEntries, () => props.selectedUnitId], () => {
  normalizeSelectedFooterUnit();
}, { immediate: true });

watch(() => `${toSafeNumber(props.selectedTileDetail?.x, -1)},${toSafeNumber(props.selectedTileDetail?.y, -1)}`, () => {
  unitTabView.value = hasMultipleFooterUnits.value ? "list" : "detail";
});

watch(selectedFooterUnitEntry, (entry) => {
  if (!entry || typeof entry !== "object") return;
  const id = nonEmptyText(entry?.unit?.id);
  if (!id) return;
  if (entry.type === "ally") {
    selectedCharacterId.value = id;
  } else if (entry.type === "enemy") {
    selectedEnemyId.value = id;
  }
}, { immediate: true });

watch(selectedEnemySkillRows, (rows) => {
  const current = nonEmptyText(selectedEnemySkillName.value);
  if (!rows.length) {
    selectedEnemySkillName.value = "";
    return;
  }
  if (current && rows.some(entry => entry.name === current)) return;
  selectedEnemySkillName.value = rows[0].name;
}, { immediate: true });
</script>

<template>
  <section class="field-footer-tabs-overlay">
    <div class="field-footer-tab-row" role="tablist" aria-label="フッター表示切替">
      <button
        v-for="tab in FOOTER_TAB_DEFS"
        :key="`field-footer-tab-${tab.key}`"
        type="button"
        class="field-footer-tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="field-footer-tab-body">
      <template v-if="activeTab === 'unit'">
        <div class="field-footer-unit-pane">
          <template v-if="tileFooterUnitEntries.length">
            <div v-if="unitTabView === 'list'" class="field-footer-unit-ring-list">
              <button
                v-for="entry in tileFooterUnitEntries"
                :key="`footer-unit-entry-${entry.key}`"
                type="button"
                class="field-footer-unit-ring-item"
                :class="{ enemy: entry.type === 'enemy' }"
                :title="`${entry.unit?.name || (entry.type === 'enemy' ? '敵' : 'ユニット')} Lv${Math.max(1, Math.floor(toSafeNumber(entry.unit?.level, 1)))}`"
                @click="openFooterUnitDetail(entry.key)"
              >
                <span class="field-footer-unit-ring-icon" :style="unitHpRingStyle(entry.unit)">
                  <img
                    v-if="nonEmptyText(entry.unit?.iconSrc)"
                    :src="entry.unit.iconSrc"
                    :alt="`${entry.unit?.name || (entry.type === 'enemy' ? '敵' : 'ユニット')} アイコン`"
                  />
                  <b v-else>{{ resolveUnitIconGlyph(entry.unit, entry.type === "enemy" ? "敵" : "兵") }}</b>
                  <small class="field-footer-unit-ring-type">{{ entry.type === "enemy" ? "敵" : "味" }}</small>
                </span>
                <span class="field-footer-unit-ring-name">{{ entry.unit?.name || (entry.type === "enemy" ? "敵" : "ユニット") }}</span>
              </button>
            </div>
            <div v-if="unitTabView === 'detail' && selectedFooterUnitIsAlly" class="field-footer-character-pane">
              <div class="field-footer-character-actions-col">
                <button type="button" class="secondary footer-action-btn" :disabled="!selectedCharacter" @click="emitAction('move-request')">移動</button>
                <button type="button" class="secondary footer-action-btn" :disabled="!selectedCharacter" @click="handleAttackClick">攻撃</button>
              </div>

              <div class="field-footer-character-unit-col">
                <template v-if="selectedCharacter">
                  <div v-if="hasMultipleFooterUnits" class="field-footer-character-unit-top">
                    <button type="button" class="field-footer-unit-back-btn" @click="backFooterUnitList">一覧に戻る</button>
                  </div>
                  <div class="field-footer-character-unit-main">
                    <span v-if="selectedCharacter.iconSrc" class="field-footer-character-unit-icon-wrap">
                      <img :src="selectedCharacter.iconSrc" :alt="`${selectedCharacter.name || 'ユニット'} アイコン`" class="field-footer-character-unit-icon" />
                    </span>
                    <span v-else class="field-footer-character-unit-glyph">{{ selectedCharacter.iconGlyph || "兵" }}</span>
                    <div class="field-footer-character-unit-meta">
                      <strong>{{ selectedCharacter.name || "ユニット" }}</strong>
                      <span>Lv{{ Math.max(1, Math.floor(toSafeNumber(selectedCharacter.level, 1))) }}</span>
                      <span v-if="resolveUnitStateLabel(selectedCharacter)" class="field-footer-unit-state-label">{{ resolveUnitStateLabel(selectedCharacter) }}</span>
                    </div>
                  </div>
                </template>
                <div v-else class="small field-footer-empty">
                  表示対象のキャラがありません。
                </div>
              </div>

              <div class="field-footer-character-status-col">
                <template v-if="selectedCharacter">
                  <div class="own-faction-hp-line field-footer-hp-line">
                    <span class="own-faction-hp-label">HP:</span>
                    <span class="own-faction-hp-bar">
                      <i :style="buildHpBarFillStyle(selectedCharacterHpState)"></i>
                      <b>{{ selectedCharacterHpState.current }} / {{ selectedCharacterHpState.max }}</b>
                    </span>
                  </div>
                  <div class="field-footer-inline-status">
                    <div
                      v-for="field in STATUS_INLINE_FIELDS"
                      :key="`field-inline-status-${field.key}`"
                      class="field-footer-inline-status-cell"
                    >
                      <span>{{ field.label }}</span>
                      <strong>{{ statusValue(selectedCharacter, field.key) }}</strong>
                    </div>
                  </div>
                </template>
                <div v-else class="small field-footer-empty">
                  表示対象のキャラがありません。
                </div>
              </div>
            </div>

            <div v-else-if="unitTabView === 'detail' && selectedFooterUnitIsEnemy" class="field-footer-enemy-pane single">
              <template v-if="selectedEnemy">
                <div class="field-footer-enemy-detail-pane">
                  <div class="field-footer-enemy-detail-left">
                    <div class="field-footer-unit-back-box">
                      <div v-if="hasMultipleFooterUnits" class="field-footer-character-unit-top">
                        <button type="button" class="field-footer-unit-back-btn" @click="backFooterUnitList">一覧に戻る</button>
                      </div>
                      <div class="field-footer-enemy-main">
                        <strong>{{ selectedEnemy.name || "敵" }}</strong>
                        <span>Lv{{ Math.max(1, Math.floor(toSafeNumber(selectedEnemy.level, 1))) }}</span>
                        <span v-if="resolveUnitStateLabel(selectedEnemy)" class="field-footer-unit-state-label">{{ resolveUnitStateLabel(selectedEnemy) }}</span>
                      </div>
                    </div>
                    <div class="field-footer-enemy-top-actions">
                      <div class="field-footer-enemy-hp-actions">
                        <button type="button" class="field-footer-enemy-hp-btn" @click="adjustSelectedEnemyHp(-10)">-10</button>
                        <button type="button" class="field-footer-enemy-hp-btn" @click="adjustSelectedEnemyHp(10)">+10</button>
                      </div>
                    </div>
                    <div class="field-footer-enemy-detail-tabs" role="tablist" aria-label="敵データ詳細切替">
                      <button
                        v-for="tab in ENEMY_DETAIL_TAB_DEFS"
                        :key="`enemy-detail-tab-${tab.key}`"
                        type="button"
                        class="field-footer-enemy-detail-tab-btn"
                        :class="{ active: enemyDetailTab === tab.key }"
                        @click="enemyDetailTab = tab.key"
                      >
                        {{ tab.label }}
                      </button>
                    </div>
                  </div>
                  <div class="field-footer-enemy-detail-right">
                    <template v-if="enemyDetailTab === 'base'">
                      <div class="own-faction-hp-line field-footer-hp-line">
                        <span class="own-faction-hp-label">HP:</span>
                        <span class="own-faction-hp-bar">
                          <i :style="buildHpBarFillStyle(selectedEnemyHpState)"></i>
                          <b>{{ selectedEnemyHpState.current }} / {{ selectedEnemyHpState.max }}</b>
                        </span>
                      </div>
                      <div class="field-footer-inline-status field-footer-inline-status-enemy-one-line">
                        <div
                          v-for="field in ENEMY_BASE_STATUS_FIELDS"
                          :key="`field-enemy-base-status-${field.key}`"
                          class="field-footer-inline-status-cell"
                        >
                          <span>{{ field.label }}</span>
                          <strong>{{ statusValue(selectedEnemy, field.key) }}</strong>
                        </div>
                      </div>
                    </template>
                    <template v-else-if="enemyDetailTab === 'resistance'">
                      <div v-if="selectedEnemyResistanceRows.length" class="field-footer-enemy-resistance-grid">
                        <div
                          v-for="row in selectedEnemyResistanceRows"
                          :key="`field-enemy-resist-${row.label}`"
                          class="field-footer-inline-status-cell"
                        >
                          <span class="field-footer-resistance-label" :title="row.label">
                            <img
                              v-if="row.iconSrc"
                              :src="row.iconSrc"
                              :alt="`${row.iconName || row.label} アイコン`"
                              class="field-footer-resistance-icon"
                            />
                            <i v-else>{{ row.label }}</i>
                          </span>
                          <strong>{{ row.value }}</strong>
                        </div>
                      </div>
                      <div v-else class="small field-footer-empty">耐性データがありません。</div>
                    </template>
                    <template v-else>
                      <div v-if="selectedEnemySkillRows.length" class="field-footer-enemy-skill-pane">
                        <div class="field-footer-enemy-skill-list">
                          <button
                            v-for="(entry, idx) in selectedEnemySkillRows"
                            :key="`field-enemy-skill-${entry.name}-${idx}`"
                            type="button"
                            class="field-footer-enemy-skill-item"
                            :class="{ active: selectedEnemySkillDetail && selectedEnemySkillDetail.name === entry.name }"
                            @click="selectedEnemySkillName = entry.name"
                          >
                            {{ entry.name }}
                          </button>
                        </div>
                        <div class="field-footer-enemy-skill-detail">
                          <div class="skill-bottom field-footer-enemy-skill-detail-meta">
                            <span class="skill-meta-chip">威力 {{ selectedEnemySkillPower }}</span>
                            <span class="skill-meta-chip">AP {{ selectedEnemySkillApCost }}</span>
                          </div>
                          <div v-if="selectedEnemySkillDetailText" class="skill-detail field-footer-enemy-skill-detail-text">
                            {{ selectedEnemySkillDetailText }}
                          </div>
                        </div>
                      </div>
                      <div v-else class="small field-footer-empty">スキルがありません。</div>
                    </template>
                  </div>
                </div>
              </template>
            </div>
          </template>
          <div v-else class="small field-footer-empty">このマスにユニットはいません。</div>
        </div>
      </template>

      <template v-else-if="activeTab === 'tile'">
        <div v-if="selectedTileDetail" class="field-footer-tile-grid">
          <div v-for="row in tileSummaryRows" :key="`field-footer-tile-${row.label}`" class="field-footer-tile-cell">
            <span>{{ row.label }}</span>
            <strong>{{ row.value }}</strong>
          </div>
          <div class="field-footer-tile-cell wide">
            <span>座標</span>
            <strong>({{ selectedTileDetail.x }}, {{ selectedTileDetail.y }})</strong>
          </div>
        </div>
        <div v-else class="small field-footer-empty">マスを選択すると土地情報を表示します。</div>
      </template>

      <template v-else-if="activeTab === 'tileData'">
        <div v-if="selectedTileDetail" class="field-footer-tile-data-pane">
          <div class="field-footer-tile-data-head">
            <strong>{{ selectedTileDetail.title || selectedTileDetail.terrain || "選択マス詳細" }}</strong>
            <span>座標 ({{ selectedTileDetail.x }}, {{ selectedTileDetail.y }})</span>
          </div>
          <div class="field-footer-tile-preview">
            <article
              class="field-footer-tile-preview-card terrain"
              :title="`地形: ${selectedTileDetail.terrainIconLabel || selectedTileDetail.terrain || '-'}`"
            >
              <img :src="selectedTileDetail.terrainIconSrc" :alt="`${selectedTileDetail.terrainIconLabel || selectedTileDetail.terrain} タイル`" />
            </article>
            <article
              class="field-footer-tile-preview-card unit"
              :title="selectedTileDetail.unitIconSrc || selectedTileDetail.unitName
                ? `ユニット: ${selectedTileDetail.unitSummary || selectedTileDetail.unitName}`
                : 'ユニットなし'"
            >
              <template v-if="selectedTileDetail.unitIconSrc || selectedTileDetail.unitName">
                <img
                  v-if="selectedTileDetail.unitIconSrc"
                  :src="selectedTileDetail.unitIconSrc"
                  :alt="`${selectedTileDetail.unitName || 'ユニット'} アイコン`"
                />
                <span v-else class="field-footer-tile-preview-fallback">{{ selectedTileDetail.unitIconGlyph || "兵" }}</span>
              </template>
              <template v-else>
                <span class="field-footer-tile-preview-fallback">-</span>
              </template>
            </article>
          </div>
          <div class="field-footer-tile-data-grid">
            <div
              v-for="row in tileDataRows"
              :key="`field-footer-tile-data-${row.label}`"
              class="field-footer-tile-cell"
              :class="{ wide: !!row.wide }"
            >
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </div>
        <div v-else class="small field-footer-empty">マスを選択すると土地データを表示します。</div>
      </template>

      <template v-else>
        <div class="field-footer-effect-pane">
          <effect-player-overlay
            :inline="true"
            :can-play="canPlayEffect"
            @play-request="emit('play-effect', $event)"
          />
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.field-footer-tabs-overlay {
  position: absolute;
  left: 50%;
  bottom: 5px;
  transform: translateX(-50%);
  z-index: 27;
  width: min(800px, calc(100% - 24px));
  height: 175px;
  max-height: 175px;
  border: 1px solid rgba(221, 188, 124, 0.5);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(11, 18, 29, 0.92), rgba(9, 12, 20, 0.92));
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}

.field-footer-tab-row {
  display: flex;
  gap: 6px;
  padding: 8px 8px 4px;
  border-bottom: 1px solid rgba(221, 188, 124, 0.24);
  height: 50px;
}

.field-footer-tab-btn {
  min-width: 76px;
  min-height: 30px;
  border: 1px solid rgba(216, 181, 120, 0.45);
  border-radius: 8px;
  color: #eddcbb;
  background: rgba(42, 31, 19, 0.56);
}

.field-footer-tab-btn.active {
  color: #fff4de;
  border-color: rgba(245, 205, 137, 0.95);
  background: rgba(129, 84, 40, 0.8);
}

.field-footer-tab-body {
  box-sizing: border-box;
  padding: 4px 6px;
  height: 120px;
  min-height: 120px;
  max-height: 120px;
  overflow: hidden;
}

.field-footer-effect-pane {
  height: 100%;
  max-height: 108px;
  overflow: auto;
}

.field-footer-unit-pane {
  display: grid;
  grid-template-rows: 1fr;
  gap: 4px;
  min-height: 0;
  height: 100%;
}

.field-footer-unit-ring-list {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 5px;
  min-height: 0;
}

.field-footer-unit-ring-item {
  flex: 0 0 auto;
  width: 96px;
  padding: 0;
  min-height: 0;
  border: 0;
  background: transparent;
  color: #f6e6c4;
  display: grid;
  gap: 5px;
  justify-items: center;
}

.field-footer-unit-ring-icon {
  --unit-hp-ring-deg: 0deg;
  --unit-hp-ring-color: #58d784;
  position: relative;
  width: 77px;
  height: 77px;
  border-radius: 999px;
  border: 1px solid rgba(239, 215, 166, 0.8);
  background:
    radial-gradient(circle at center, rgba(166, 173, 184, 0.92) 0 56%, transparent 58%),
    conic-gradient(var(--unit-hp-ring-color) 0 var(--unit-hp-ring-deg), rgba(255, 255, 255, 0.14) var(--unit-hp-ring-deg) 360deg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 0 1px rgba(18, 12, 8, 0.52),
    0 0 0 1px rgba(239, 215, 166, 0.18) inset;
}

.field-footer-unit-ring-icon::after {
  content: "";
  position: absolute;
  inset: 6px;
  border-radius: 999px;
  border: 1px solid rgba(255, 235, 196, 0.46);
  box-shadow: inset 0 0 0 1px rgba(18, 12, 8, 0.34);
  pointer-events: none;
}

.field-footer-unit-ring-icon img {
  width: 52px;
  height: 52px;
  border-radius: 999px;
  object-fit: cover;
}

.field-footer-unit-ring-icon b {
  width: 52px;
  height: 52px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(34, 24, 16, 0.8);
  color: #fff1cf;
  font-size: 15px;
}

.field-footer-unit-ring-type {
  position: absolute;
  left: -8px;
  top: -8px;
  min-width: 18px;
  height: 16px;
  padding: 0 3px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.74);
  border: 1px solid rgba(255, 226, 172, 0.68);
  color: #ffe7ba;
  font-size: 11px;
  line-height: 14px;
  font-weight: 700;
  text-align: center;
}

.field-footer-unit-ring-name {
  max-width: 96px;
  font-size: 11px;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-footer-unit-back-btn {
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid rgba(216, 181, 120, 0.45);
  border-radius: 6px;
  background: rgba(42, 31, 19, 0.56);
  color: #f0ddb9;
}

.field-footer-character-pane {
  display: grid;
  grid-template-columns: 104px 220px minmax(0, 1fr);
  gap: 8px;
  align-items: stretch;
  height: 100%;
  min-height: 0;
}

.field-footer-character-mode-label {
  margin-bottom: 6px;
  color: #f1e3bf;
  font-size: 14px;
}

.field-footer-character-actions-col {
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 6px;
}

.footer-action-btn {
  width: 100%;
  min-height: 48px;
  font-size: 18px;
  font-weight: 700;
}

.field-footer-character-unit-col {
  border: 1px solid rgba(216, 181, 120, 0.28);
  border-radius: 8px;
  background: rgba(29, 24, 18, 0.52);
  padding: 6px;
  display: grid;
  gap: 6px;
  align-content: start;
  height: 100%;
  min-height: 0;
}

.field-footer-character-unit-top {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.field-footer-unit-back-box {
  height: auto;
  min-height: 0;
}

.field-footer-character-unit-main {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.field-footer-character-unit-icon-wrap,
.field-footer-character-unit-glyph {
  width: 54px;
  height: 54px;
  border: 1px solid rgba(232, 205, 154, 0.38);
  border-radius: 8px;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(18, 24, 34, 0.6);
}

.field-footer-character-unit-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.field-footer-character-unit-meta {
  display: grid;
  gap: 3px;
  color: #ead6a9;
}

.field-footer-character-unit-meta strong {
  font-size: 16px;
  color: #fff3dc;
  line-height: 1.2;
}

.field-footer-unit-state-label {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid rgba(204, 119, 119, 0.72);
  color: #ffb9b9;
  background: rgba(78, 32, 32, 0.48);
  font-size: 11px;
  line-height: 1.1;
}

.field-footer-character-status-col {
  border: 1px solid rgba(216, 181, 120, 0.28);
  border-radius: 8px;
  background: rgba(23, 31, 44, 0.45);
  padding: 8px;
  display: grid;
  gap: 8px;
  width: 445px;
}

.own-faction-hp-line {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.own-faction-hp-label {
  flex: 0 0 auto;
  font-size: 15px;
  color: rgba(247, 232, 195, 0.86);
}

.own-faction-hp-bar {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 14px;
  border-radius: 999px;
  border: 1px solid rgba(239, 215, 166, 0.62);
  background: rgba(255, 255, 255, 0.14);
  box-shadow: inset 0 0 0 1px rgba(24, 16, 10, 0.52);
  overflow: hidden;
}

.own-faction-hp-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #3bb75d, #8ae58f);
}

.own-faction-hp-bar b {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  font-size: 14px;
  font-weight: 700;
  color: #f6f0df;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.75);
}

.field-footer-inline-status {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.field-footer-inline-status.compact {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.field-footer-inline-status-cell {
  border: 1px solid rgba(216, 181, 120, 0.24);
  border-radius: 6px;
  background: rgba(40, 31, 20, 0.48);
  padding: 4px 6px;
  display: grid;
  gap: 3px;
  text-align: center;
  color: #ead6a9;
  font-size: 12px;
}

.field-footer-inline-status-cell strong {
  color: #fff3dc;
  font-size: 15px;
}

.field-footer-tile-grid {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.field-footer-tile-cell {
  border: 1px solid rgba(216, 181, 120, 0.24);
  border-radius: 7px;
  background: rgba(40, 31, 20, 0.48);
  padding: 6px 7px;
  display: grid;
  gap: 3px;
}

.field-footer-tile-cell span {
  font-size: 11px;
  color: #dbc79f;
}

.field-footer-tile-cell strong {
  color: #fff3dc;
  font-size: 13px;
}

.field-footer-tile-cell.wide {
  grid-column: span 3;
}

.field-footer-empty {
  color: #dac59f;
  padding: 8px 2px;
}

.field-footer-tile-data-pane {
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  gap: 6px 8px;
}

.field-footer-tile-data-head {
  grid-column: 1 / -1;
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: #ecd8b2;
}

.field-footer-tile-data-head strong {
  color: #fff3dc;
  font-size: 14px;
  line-height: 1.2;
}

.field-footer-tile-data-head span {
  font-size: 12px;
  color: #dac59f;
}

.field-footer-tile-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.field-footer-tile-preview-card {
  border: 1px solid rgba(216, 181, 120, 0.24);
  border-radius: 7px;
  background: rgba(40, 31, 20, 0.48);
  min-height: 52px;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.field-footer-tile-preview-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.field-footer-tile-preview-fallback {
  color: #fff3dc;
  font-size: 16px;
  font-weight: 700;
}

.field-footer-tile-data-grid {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: start;
  max-height: 96px;
  overflow-y: auto;
  padding-right: 2px;
}

.field-footer-enemy-pane {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.field-footer-enemy-pane.single {
  grid-template-columns: minmax(0, 1fr);
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  align-content: start;
}

.field-footer-enemy-section {
  border: 1px solid rgba(216, 181, 120, 0.28);
  border-radius: 8px;
  background: rgba(23, 31, 44, 0.45);
  /* padding: 8px; */
  display: grid;
  gap: 6px;
  align-content: start;
  min-height: 124px;
}

.field-footer-enemy-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  color: #ead6a9;
}

.field-footer-enemy-head strong {
  color: #fff3dc;
}

.field-footer-enemy-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: #e8d2a8;
  margin-top: -2px;
}

.field-footer-enemy-main strong {
  color: #fff3dc;
  line-height: 1.1;
}

.field-footer-enemy-main span {
  line-height: 1.1;
}

.field-footer-enemy-chip-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.field-footer-enemy-chip {
  flex: 0 0 auto;
  min-height: 28px;
  padding: 3px 8px;
  border: 1px solid rgba(216, 181, 120, 0.4);
  border-radius: 7px;
  background: rgba(44, 33, 22, 0.55);
  color: #eadab3;
}

.field-footer-enemy-chip.enemy {
  border-color: rgba(220, 135, 120, 0.5);
  background: rgba(58, 24, 21, 0.55);
}

.field-footer-enemy-chip.active {
  border-color: rgba(245, 205, 137, 0.95);
  background: rgba(126, 83, 40, 0.8);
  color: #fff3dc;
}

.field-footer-enemy-chip.enemy.active {
  border-color: rgba(255, 144, 128, 0.95);
  background: rgba(145, 53, 42, 0.82);
}

.field-footer-enemy-hp-actions {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
}

.field-footer-enemy-top-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.field-footer-enemy-hp-btn {
  min-width: 42px;
  min-height: 20px;
  padding: 1px 6px;
  border: 1px solid rgba(216, 181, 120, 0.45);
  border-radius: 6px;
  background: rgba(42, 31, 19, 0.56);
  color: #f0ddb9;
  font-size: 12px;
}

.field-footer-inline-status.field-footer-inline-status-enemy-one-line {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.field-footer-inline-status.field-footer-inline-status-enemy-one-line .field-footer-inline-status-cell {
  padding: 2px 4px;
  gap: 1px;
  font-size: 10px;
}

.field-footer-inline-status.field-footer-inline-status-enemy-one-line .field-footer-inline-status-cell strong {
  font-size: 12px;
}

.field-footer-enemy-detail-pane {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 8px;
  height: 100%;
  max-height: 100%;
  min-height: 0;
}

.field-footer-enemy-detail-left {
  border: 1px solid rgba(216, 181, 120, 0.28);
  border-radius: 8px;
  background: rgba(29, 24, 18, 0.52);
  padding: 5px;
  display: grid;
  gap: 4px;
  align-content: start;
  height: 100%;
  overflow-y: auto;
}

.field-footer-enemy-detail-right {
  border: 1px solid rgba(216, 181, 120, 0.28);
  border-radius: 8px;
  background: rgba(23, 31, 44, 0.45);
  padding: 6px;
  display: grid;
  gap: 6px;
  align-content: start;
  height: 100%;
  overflow-y: auto;
  min-width: 0;
  padding-right: 4px;
  width: 445px;
}

.field-footer-enemy-detail-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.field-footer-enemy-detail-tab-btn {
  min-height: 24px;
  padding: 2px 6px;
  border: 1px solid rgba(216, 181, 120, 0.45);
  border-radius: 6px;
  background: rgba(42, 31, 19, 0.56);
  color: #f0ddb9;
  font-size: 12px;
}

.field-footer-enemy-detail-tab-btn.active {
  border-color: rgba(245, 205, 137, 0.95);
  background: rgba(126, 83, 40, 0.8);
  color: #fff3dc;
}

.field-footer-enemy-resistance-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 2px;
}

.field-footer-enemy-resistance-grid .field-footer-inline-status-cell {
  padding: 0;
  gap: 0;
  font-size: 10px;
  align-content: center;
  justify-items: center;
  height: 40px;
}

.field-footer-enemy-resistance-grid .field-footer-inline-status-cell strong {
  font-size: 14px;
}

.field-footer-resistance-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 0;
  margin: 0;
  line-height: 1;
}

.field-footer-resistance-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  image-rendering: auto;
}

.field-footer-resistance-label i {
  font-style: normal;
  font-size: 12px;
  line-height: 1;
  color: #e2d2af;
}

.field-footer-enemy-skill-pane {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 6px;
  min-height: 0;
  height: 100%;
}

.field-footer-enemy-skill-list {
  display: grid;
  gap: 4px;
  max-height: 100%;
  overflow-y: auto;
  padding-right: 2px;
  align-content: start;
}

.field-footer-enemy-skill-item {
  border: 1px solid rgba(216, 181, 120, 0.24);
  border-radius: 6px;
  background: rgba(40, 31, 20, 0.48);
  padding: 4px 6px;
  font-size: 12px;
  color: #fff3dc;
  text-align: left;
}

.field-footer-enemy-skill-item.active {
  border-color: rgba(245, 205, 137, 0.95);
  background: rgba(126, 83, 40, 0.8);
}

.field-footer-enemy-skill-detail {
  border: 1px solid rgba(216, 181, 120, 0.24);
  border-radius: 6px;
  background: rgba(24, 30, 41, 0.52);
  padding: 0;
  display: grid;
  gap: 0;
  align-content: start;
  min-height: 0;
  overflow-y: auto;
}

.field-footer-enemy-skill-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0px 0px;
  padding: 6px 8px 0;
}

.field-footer-enemy-skill-detail .skill-meta-chip {
  padding: 1px 6px;
  border-radius: 5px;
  border: 1px solid rgba(218, 186, 128, 0.24);
  background: rgba(17, 12, 7, 0.48);
  color: #e9dbb9;
  line-height: 1.35;
  font-size: 12px;
}

.field-footer-enemy-skill-detail-text {
  padding: 7px 8px;
  font-size: 11px;
  color: #eadfca;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border-top: 1px solid rgba(218, 186, 128, 0.16);
}


@media (max-width: 900px) {
  .field-footer-character-pane {
    grid-template-columns: 1fr;
  }

  .field-footer-inline-status {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .field-footer-inline-status.field-footer-inline-status-enemy-one-line {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .field-footer-tile-data-pane {
    grid-template-columns: 1fr;
  }

  .field-footer-tile-data-grid {
    max-height: 80px;
  }

  .field-footer-enemy-pane {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .field-footer-tabs-overlay {
    bottom: 10px;
    width: calc(100% - 14px);
  }

  .field-footer-tab-row {
    overflow-x: auto;
  }

  .field-footer-tab-body {
    height: 120px;
    min-height: 120px;
    max-height: 120px;
  }
}
</style>
