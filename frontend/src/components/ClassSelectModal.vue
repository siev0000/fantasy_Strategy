<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import V39SelectionDetailPanel from "./V39SelectionDetailPanel.vue";
import { classData as classDb, descriptionData as skillDescDb } from "../lib/game-data-registry.js";
import { getV39ClassSelectionDetail } from "../lib/v39-selection-detail.js";
import { getIconSrcByName, hasIconName } from "../lib/icon-library.js";
import { RACE_CLASS_NAME_MAP, SKILL_FIELD_DEFS } from "../constants/unitCommon.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  selectedRace: { type: String, default: "" },
  selectedClass: { type: String, default: "" },
  allowAdvancedClasses: { type: Boolean, default: false },
  setupProgressText: { type: String, default: "" }
});

const emit = defineEmits(["close", "confirm", "back"]);

const STATUS_ROW_FIELDS = [
  ["HP", "攻撃", "魔力", "命中"],
  ["SIZ", "防御", "精神", "速度"]
];

const ACQUIRED_SKILL_FIELDS_LV5 = ["Skill1", "Skill2", "Skill3", "Skill4", "Skill5"];

function toSafeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function isPlaceholderSkillName(value) {
  const text = nonEmptyText(value).toLowerCase();
  if (!text) return true;
  return text === "0" || text === "-" || text === "－" || text === "なし" || text === "null";
}

function resolveSkillFieldKeys(field) {
  if (!field) return [];
  if (typeof field === "string") return [field];
  const keys = [nonEmptyText(field?.key), ...(Array.isArray(field?.aliases) ? field.aliases.map(nonEmptyText) : [])]
    .filter(Boolean);
  return [...new Set(keys)];
}

function resolveSkillFieldValue(row, field) {
  const keys = resolveSkillFieldKeys(field);
  for (const key of keys) {
    const value = toSafeNumber(row?.[key]);
    if (value !== null) return value;
  }
  return 0;
}

function resolveSkillDescription(field) {
  const keys = resolveSkillFieldKeys(field);
  for (const key of keys) {
    const desc = skillDescMap.value.get(key);
    if (desc) return desc;
  }
  return "";
}

function isClassInitialUnlocked(row) {
  const conditionLv = nonEmptyText(row?.条件Lv);
  if (conditionLv && conditionLv !== "初期" && conditionLv !== "0" && conditionLv !== "-" && conditionLv !== "なし") {
    return false;
  }
  for (let i = 1; i <= 4; i += 1) {
    const token = nonEmptyText(row?.[`条件_${i}`]);
    const lvRaw = Number(row?.[`Lv_${i}`]);
    if (token) return false;
    if (Number.isFinite(lvRaw) && lvRaw > 0) return false;
  }
  return true;
}

function classIconSrcFromRow(row) {
  const iconName = nonEmptyText(row?.画像ID);
  if (iconName && hasIconName(iconName)) {
    return getIconSrcByName(iconName, iconName);
  }
  return "";
}

const allClasses = computed(() => {
  if (!Array.isArray(classDb)) return [];
  return classDb.filter(row => nonEmptyText(row?.名前));
});

const skillDescMap = computed(() => {
  const map = new Map();
  if (!Array.isArray(skillDescDb)) return map;
  for (const row of skillDescDb) {
    const name = nonEmptyText(row?.技能名);
    if (!name) continue;
    map.set(name, nonEmptyText(row?.説明));
  }
  return map;
});

const classCandidates = computed(() => {
  const race = nonEmptyText(props.selectedRace);
  if (!race) return [];
  const raceClassName = RACE_CLASS_NAME_MAP[race] || race;
  const raceBase = allClasses.value.filter(row => nonEmptyText(row.名前) === raceClassName);
  const jobs = allClasses.value.filter((row) => {
    if (nonEmptyText(row.種類) !== "職業") return false;
    if (props.allowAdvancedClasses) return true;
    return isClassInitialUnlocked(row);
  });
  const merged = [...raceBase, ...jobs];
  const seen = new Set();
  return merged.filter((row) => {
    const key = nonEmptyText(row.名前);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    if (nonEmptyText(row.種類) === "人族") return false;
    return true;
  });
});

const activeClassName = ref("");
const activeDetailTab = ref("status");

const activeClass = computed(() => {
  if (!classCandidates.value.length || !activeClassName.value) return null;
  return classCandidates.value.find(row => nonEmptyText(row.名前) === activeClassName.value) || null;
});

const activeSelectionDetail = computed(() => getV39ClassSelectionDetail(activeClass.value?.名前));
const statusRowGroups = computed(() => activeSelectionDetail.value?.statusRows || []);
const skillRows = computed(() => activeSelectionDetail.value?.skillRows || []);
const classLv5SkillNames = computed(() => activeSelectionDetail.value?.acquiredSkillNames || []);

watch(
  [() => props.show, classCandidates, () => props.selectedClass],
  ([isOpen, candidates, selectedClass]) => {
    if (!isOpen) {
      activeClassName.value = "";
      activeDetailTab.value = "status";
      return;
    }
    const selected = nonEmptyText(selectedClass);
    if (selected && candidates.some(row => nonEmptyText(row.名前) === selected)) {
      activeClassName.value = selected;
      return;
    }
    if (!candidates.length) {
      activeClassName.value = "";
      return;
    }
    if (candidates.some(row => nonEmptyText(row.名前) === activeClassName.value)) return;
    activeClassName.value = "";
  },
  { immediate: true }
);

function selectClass(name) {
  activeClassName.value = name;
}

function confirmClass() {
  const row = activeClass.value;
  if (!row) return;
  emit("confirm", {
    race: props.selectedRace,
    className: nonEmptyText(row.名前),
    classType: nonEmptyText(row.種類)
  });
}
</script>

<template>
  <base-modal :show="show" title="クラス選択" :subtitle="setupProgressText" :wide="true" :close-on-backdrop="false" variant="v39" @close="$emit('close')">
    <div v-if="selectedRace && classCandidates.length" class="class-layout">
      <aside class="class-list">
        <div class="class-list-head">種族: {{ selectedRace }}</div>
        <button
          v-for="row in classCandidates"
          :key="row.名前"
          type="button"
          class="class-item"
          :class="{ active: activeClass?.名前 === row.名前 }"
          @click="selectClass(row.名前)"
        >
          <span class="class-item-main">
            <img v-if="classIconSrcFromRow(row)" :src="classIconSrcFromRow(row)" :alt="`${row.名前} アイコン`" class="class-item-icon" />
            <span v-else class="class-item-icon-fallback">{{ String(row.名前 || "?").slice(0, 1) }}</span>
            <span class="class-item-name">{{ row.名前 }}</span>
          </span>
          <span class="class-kind">{{ row.種類 }}</span>
        </button>
      </aside>

      <section v-if="activeClass" class="class-detail">
        <header class="class-title">
          <h3>{{ activeClass.名前 }}</h3>
          <div class="class-title-sub">種別: {{ activeClass.種類 }}</div>
          <p class="class-text">{{ activeClass.詳細 || "詳細説明は未設定です。" }}</p>
        </header>

        <v39-selection-detail-panel
          :status-rows="statusRowGroups"
          :skill-rows="skillRows"
          :skill-names="classLv5SkillNames"
          :status-source="activeClass"
          :active-tab="activeDetailTab"
          skill-title="クラススキル (Lv1-5)"
          @update:active-tab="activeDetailTab = $event"
        />

        <div class="class-actions">
          <button type="button" class="secondary" @click="$emit('back')">種族へ戻る</button>
          <button type="button" @click="confirmClass">このクラスで決定</button>
        </div>
      </section>

      <section v-else class="class-detail class-detail-empty">
        <strong>クラスを選択してください</strong>
        <span>一覧からクラスを選ぶと、ステータス・技能・スキルの詳細を確認できます。</span>
      </section>
    </div>

    <div v-else class="class-empty">
      <p v-if="!selectedRace">先に種族を選択してください。</p>
      <p v-else>この種族に対応するクラスデータがありません。</p>
    </div>
  </base-modal>
</template>

<style scoped>
.class-layout {
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.class-list {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: grid;
  gap: 6px;
  align-content: start;
  padding: 7px;
  border: 1px solid var(--picker-line);
  border-radius: 8px;
  background: #0d181c;
  scrollbar-width: thin;
  scrollbar-color: #405b63 transparent;
}

.class-list-head {
  padding: 4px 3px 6px;
  color: #9fb1b4;
  font-size: 12px;
  font-weight: 800;
}

.class-item {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #30464d;
  border-radius: 7px;
  background: #122126;
  color: #dce7e6;
  font-size: 15px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  transition: border-color .12s ease, background .12s ease, transform .12s ease;
}

.class-item:hover {
  border-color: #4f7580;
  background: #162a30;
}

.class-item:active {
  transform: translateY(1px);
}

.class-item.active {
  border-color: var(--picker-active);
  background: var(--picker-active-bg);
  color: #f3fbfa;
  box-shadow: 0 0 0 1px rgba(113, 209, 223, .16) inset;
}

.class-item-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.class-item-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.class-item-icon,
.class-item-icon-fallback {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid #45616a;
  border-radius: 6px;
  background: #17282e;
}

.class-item-icon {
  object-fit: cover;
}

.class-item-icon-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ce8f1;
  font-size: 16px;
  font-weight: 900;
}

.class-kind {
  flex: 0 0 auto;
  padding: 2px 6px;
  border: 1px solid #3b565e;
  border-radius: 999px;
  color: #91a7aa;
  background: #0e1b1f;
  font-size: 10px;
  font-weight: 800;
}

.class-detail {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 9px;
  padding: 10px;
  border: 1px solid var(--picker-line);
  border-radius: 8px;
  background: linear-gradient(180deg, #101d22, #0c171b);
}

.class-title {
  min-width: 0;
}

.class-title h3 {
  margin: 0;
  color: var(--picker-text);
  font-size: 24px;
  line-height: 1.15;
}

.class-title-sub {
  margin-top: 3px;
  color: #90dce7;
  font-size: 13px;
  font-weight: 700;
}

.class-text {
  margin: 6px 0 0;
  color: var(--picker-muted);
  font-size: 13px;
  line-height: 1.5;
}

.detail-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}

.detail-tabs button {
  min-height: 36px;
  padding: 5px 8px;
  border: 1px solid #385159;
  border-radius: 6px;
  background: #122126;
  color: #a9babc;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.detail-tabs button:hover {
  border-color: #4e7580;
  color: #dbe8e8;
}

.detail-tabs button.active {
  border-color: var(--picker-active);
  background: var(--picker-active-bg);
  color: #f4fbfa;
  box-shadow: 0 0 0 1px rgba(113, 209, 223, .13) inset;
}

.detail-tab-panel {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #405b63 transparent;
}

.detail-block {
  padding: 9px;
  border: 1px solid var(--picker-line-soft);
  border-radius: 7px;
  background: #0c171b;
}

.detail-block h4 {
  margin: 0 0 7px;
  color: #dce8e7;
  font-size: 13px;
}

.status-rows {
  display: grid;
  gap: 5px;
}

.status-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;
}

.status-chip {
  min-height: 44px;
  display: grid;
  align-content: center;
  gap: 2px;
  padding: 5px 7px;
  border-left: 2px solid #4d98a5;
  background: #102126;
}

.status-chip span {
  color: #8fa4a7;
  font-size: 10px;
}

.status-chip strong {
  color: #eff6f5;
  font-size: 16px;
  line-height: 1;
}

.skill-value-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}

.skill-value-chip {
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  padding: 5px 7px;
  border: 1px solid #29454d;
  border-radius: 5px;
  background: #102126;
  color: #aebfc1;
  font-size: 12px;
}

.skill-value-chip strong {
  color: #eef6f5;
  font-size: 14px;
}

.note-text,
.class-detail-empty,
.class-empty {
  color: var(--picker-muted);
}

.skill-detail-block :deep(.skill-table-wrap) {
  max-height: 480px;
}

.class-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.class-actions button {
  min-height: 38px;
  padding: 6px 14px;
  border: 1px solid var(--picker-active);
  border-radius: 7px;
  background: #1a4b55;
  color: #f2fbfa;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.class-actions button:hover {
  background: #205964;
}

.class-actions button.secondary {
  border-color: #42585f;
  background: #132126;
  color: #b8c7c9;
}

.class-actions button.secondary:hover {
  border-color: #5c7982;
  background: #182b31;
  color: #e2eceb;
}

.class-detail-empty {
  grid-template-rows: 1fr;
  place-content: center;
  text-align: center;
}

.class-detail-empty strong {
  color: #dce8e7;
  font-size: 18px;
}

.class-detail-empty span {
  margin-top: 5px;
  font-size: 12px;
}

.class-empty {
  padding: 12px;
  border: 1px dashed #3d5961;
  border-radius: 8px;
  background: #0e1a1e;
  font-size: 13px;
}

@media (max-width: 760px) {
  .class-layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(120px, 32%) minmax(0, 1fr);
    height: 100%;
  }

  .class-list {
    max-height: none;
    height: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .class-list-head {
    grid-column: 1 / -1;
  }

  .class-item {
    min-height: 42px;
    padding: 5px 7px;
    font-size: 13px;
  }

  .class-item-icon,
  .class-item-icon-fallback {
    width: 30px;
    height: 30px;
  }

  .class-detail {
    height: 100%;
    max-height: none;
  }

  .class-title h3 {
    font-size: 20px;
  }

  .status-row,
  .skill-value-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 430px) {
  .class-list {
    grid-template-columns: 1fr;
    max-height: 160px;
  }

  .detail-tabs button {
    font-size: 12px;
  }

  .class-actions button {
    flex: 1 1 0;
  }
}
</style>
