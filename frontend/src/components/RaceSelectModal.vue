<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import V39SelectionDetailPanel from "./V39SelectionDetailPanel.vue";
import {
  classData as classDb,
  descriptionData as skillDescDb,
  raceData as raceSelectionDb,
  raceCategoryData as raceCategoryDb
} from "../lib/game-data-registry.js";
import { getV39RaceSelectionDetail } from "../lib/v39-selection-detail.js";
import { getIconSrcByName, hasIconName } from "../lib/icon-library.js";
import { RACE_CLASS_NAME_MAP, SKILL_FIELD_DEFS } from "../constants/unitCommon.js";

const raceBackgroundModules = import.meta.glob("../../../assets/images/background/*.{png,jpg,jpeg,webp}", {
  eager: true,
  import: "default"
});

function backgroundBasename(path) {
  const normalized = String(path || "").replace(/\\\\/g, "/");
  const fileName = normalized.split("/").pop() || "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

const raceBackgroundByCategory = new Map(
  Object.entries(raceBackgroundModules)
    .map(([path, src]) => [backgroundBasename(path), String(src || "")])
    .filter(([name, src]) => name && src)
);

const props = defineProps({
  show: { type: Boolean, default: false },
  selectedRace: { type: String, default: "" },
  allowedRaces: { type: Array, default: () => [] },
  setupProgressText: { type: String, default: "" }
});

const emit = defineEmits(["close", "confirm"]);

const STATUS_ROW_FIELDS = [
  ["HP", "攻撃", "魔力", "命中"],
  ["SIZ", "防御", "精神", "速度"]
];

const ACQUIRED_SKILL_FIELDS_LV5 = ["Skill1", "Skill2", "Skill3", "Skill4", "Skill5"];

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function toSafeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

function raceListIconSrc(race) {
  const iconName = nonEmptyText(race?.画像ID);
  if (iconName && hasIconName(iconName)) {
    return getIconSrcByName(iconName, iconName);
  }
  return "";
}

const races = computed(() => {
  if (!Array.isArray(raceSelectionDb)) return [];
  return raceSelectionDb.filter(item => item && typeof item.key === "string" && item.key.trim().length > 0);
});

const allowedRaceSet = computed(() => {
  const set = new Set();
  if (!Array.isArray(props.allowedRaces)) return set;
  for (const raw of props.allowedRaces) {
    const key = nonEmptyText(raw);
    if (!key) continue;
    set.add(key);
  }
  return set;
});

const filteredRaces = computed(() => {
  if (!races.value.length) return [];
  if (!allowedRaceSet.value.size) return races.value;
  return races.value.filter(item => allowedRaceSet.value.has(item.key));
});

const classRows = computed(() => {
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

const activeRaceKey = ref("");
const activeRaceCategory = ref("");
const activeDetailTab = ref("status");
const rememberedRaceByCategory = ref({});

function resolveRaceCategory(race) {
  const detail = getV39RaceSelectionDetail(race?.key);
  return nonEmptyText(detail?.sourceRow?.種類);
}

const raceCategories = computed(() => {
  const out = [];
  const seen = new Set();
  for (const race of filteredRaces.value) {
    const category = resolveRaceCategory(race);
    if (!category || seen.has(category)) continue;
    seen.add(category);
    out.push(category);
  }
  return out;
});

const categoryRaces = computed(() => {
  const category = nonEmptyText(activeRaceCategory.value);
  if (!category) return filteredRaces.value;
  return filteredRaces.value.filter(race => resolveRaceCategory(race) === category);
});

const raceCategoryDescriptionMap = computed(() => {
  const map = new Map();
  for (const row of Array.isArray(raceCategoryDb) ? raceCategoryDb : []) {
    const category = nonEmptyText(row?.種類);
    if (!category) continue;
    map.set(category, nonEmptyText(row?.説明));
  }
  return map;
});

const activeRace = computed(() => {
  if (!categoryRaces.value.length || !activeRaceKey.value) return null;
  return categoryRaces.value.find(item => item.key === activeRaceKey.value) || null;
});

const activeRaceBackgroundSrc = computed(() => (
  raceBackgroundByCategory.get(nonEmptyText(activeRaceCategory.value)) || ""
));

const raceLayoutStyle = computed(() => {
  const src = activeRaceBackgroundSrc.value;
  return src ? { "--race-background-image": `url("${src}")` } : {};
});

function racesForCategory(category, list = filteredRaces.value) {
  const key = nonEmptyText(category);
  const source = Array.isArray(list) ? list : [];
  if (!key) return [];
  return source.filter(race => resolveRaceCategory(race) === key);
}

function rememberRace(category, raceKey) {
  const categoryKey = nonEmptyText(category);
  const key = nonEmptyText(raceKey);
  if (!categoryKey || !key) return;
  rememberedRaceByCategory.value = {
    ...rememberedRaceByCategory.value,
    [categoryKey]: key
  };
}

function selectRememberedOrFirstRace(category, list = filteredRaces.value) {
  const categoryKey = nonEmptyText(category);
  const rows = racesForCategory(categoryKey, list);
  if (!rows.length) {
    activeRaceKey.value = "";
    return;
  }
  const rememberedKey = nonEmptyText(rememberedRaceByCategory.value?.[categoryKey]);
  const remembered = rows.find(row => row.key === rememberedKey);
  const next = remembered || rows[0];
  activeRaceKey.value = next.key;
  rememberRace(categoryKey, next.key);
}

const activeSelectionDetail = computed(() => getV39RaceSelectionDetail(activeRace.value?.key));

const activeRaceClassRow = computed(() => activeSelectionDetail.value?.sourceRow || null);
const statusRowGroups = computed(() => activeSelectionDetail.value?.statusRows || []);
const skillRows = computed(() => activeSelectionDetail.value?.skillRows || []);
const resistanceRows = computed(() => activeSelectionDetail.value?.resistanceRows || []);
const equipmentRows = computed(() => activeSelectionDetail.value?.equipmentRows || []);
const equipmentMode = computed(() => activeSelectionDetail.value?.equipmentMode || "");
const equipmentTitle = computed(() => activeSelectionDetail.value?.equipmentTitle || "");
const raceLv5SkillNames = computed(() => activeSelectionDetail.value?.acquiredSkillNames || []);

watch(
  [() => props.show, filteredRaces, () => props.selectedRace],
  ([isOpen, allowedRows, selectedRace]) => {
    if (!isOpen) {
      activeRaceKey.value = "";
      activeRaceCategory.value = "";
      activeDetailTab.value = "status";
      rememberedRaceByCategory.value = {};
      return;
    }

    const list = Array.isArray(allowedRows) ? allowedRows : [];
    if (!list.length) {
      activeRaceKey.value = "";
      activeRaceCategory.value = "";
      rememberedRaceByCategory.value = {};
      return;
    }

    const selected = list.find(item => item.key === selectedRace);
    if (selected) {
      const selectedCategory = resolveRaceCategory(selected);
      activeRaceCategory.value = selectedCategory;
      activeRaceKey.value = selected.key;
      rememberRace(selectedCategory, selected.key);
      return;
    }

    const categories = raceCategories.value;
    if (!categories.includes(activeRaceCategory.value)) {
      activeRaceCategory.value = categories[0] || "";
      selectRememberedOrFirstRace(activeRaceCategory.value, list);
      return;
    }

    const current = list.find(item =>
      item.key === activeRaceKey.value
      && resolveRaceCategory(item) === activeRaceCategory.value
    );
    if (current) {
      rememberRace(activeRaceCategory.value, current.key);
      return;
    }

    selectRememberedOrFirstRace(activeRaceCategory.value, list);
  },
  { immediate: true }
);

function selectRaceCategory(category) {
  const next = nonEmptyText(category);
  if (!next || next === activeRaceCategory.value) return;
  if (activeRaceCategory.value && activeRaceKey.value) {
    rememberRace(activeRaceCategory.value, activeRaceKey.value);
  }
  activeRaceCategory.value = next;
  selectRememberedOrFirstRace(next);
  activeDetailTab.value = "status";
}

function selectRace(key) {
  if (allowedRaceSet.value.size && !allowedRaceSet.value.has(key)) return;
  const race = filteredRaces.value.find(item => item.key === key);
  if (!race) return;
  activeRaceKey.value = key;
  rememberRace(resolveRaceCategory(race), key);
}

function confirmRace() {
  if (!activeRace.value?.key) return;
  emit("confirm", activeRace.value.key);
}
</script>

<template>
  <base-modal :show="show" title="種族選択" :subtitle="setupProgressText" :wide="true" :close-on-backdrop="false" variant="v39" @close="$emit('close')">
    <div v-if="filteredRaces.length" class="race-layout">
      <section class="race-category-pane" :style="raceLayoutStyle">
        <nav class="race-category-tabs" role="tablist" aria-label="種族分類">
          <button
            v-for="category in raceCategories"
            :key="category"
            type="button"
            role="tab"
            :aria-selected="activeRaceCategory === category"
            :class="{ active: activeRaceCategory === category }"
            :data-v39-race-category="category"
            @click="selectRaceCategory(category)"
          >
            <strong>{{ category }}</strong>
          </button>
        </nav>
        <div v-if="activeRaceCategory" class="race-category-description">
          {{ raceCategoryDescriptionMap.get(activeRaceCategory) || "" }}
        </div>
      </section>

      <section class="race-main-pane">
        <aside class="race-list">
          <button
            v-for="race in categoryRaces"
            :key="race.key"
            type="button"
            class="race-item"
            :class="{ active: activeRace?.key === race.key }"
            :data-v39-race-option="race.key"
            @click="selectRace(race.key)"
          >
            <span class="race-item-main">
              <img v-if="raceListIconSrc(race)" :src="raceListIconSrc(race)" :alt="`${race.name} アイコン`" class="race-item-icon" />
              <span v-else class="race-item-icon-fallback">{{ String(race.name || "?").slice(0, 1) }}</span>
              <span class="race-item-name">{{ race.name }}</span>
            </span>
          </button>
        </aside>

        <section v-if="activeRace" class="race-detail">
        <header class="race-title">
          <h3>{{ activeRace.name }}</h3>
          <p class="race-summary">{{ activeRace.summary }}</p>
          <p class="race-description">{{ activeRace.detail }}</p>
        </header>

        <v39-selection-detail-panel
          :status-rows="statusRowGroups"
          :skill-rows="skillRows"
          :resistance-rows="resistanceRows"
          :equipment-rows="equipmentRows"
          :equipment-mode="equipmentMode"
          :equipment-title="equipmentTitle"
          :skill-names="raceLv5SkillNames"
          :status-source="activeRaceClassRow"
          :active-tab="activeDetailTab"
          skill-title="種族スキル (Lv1-5)"
          @update:active-tab="activeDetailTab = $event"
        />

        <div class="race-actions">
          <button type="button" data-v39-race-confirm @click="confirmRace">この種族で決定</button>
        </div>
      </section>

        <section v-else class="race-detail race-detail-empty">
          <strong>種族を選択してください</strong>
          <span>左の一覧から種族を選ぶと、ステータス・技能・スキルの詳細を確認できます。</span>
        </section>
      </section>
    </div>

    <div v-else class="race-empty">
      {{ races.length ? "選択可能な種族がありません。自陣営の種族データを確認してください。" : "種族データがありません。`data/source/export/json/種族.json` を確認してください。" }}
    </div>
  </base-modal>
</template>

<style scoped>
.race-layout {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.race-category-pane {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 7px;
  padding: 8px;
  border: 1px solid var(--picker-line);
  border-radius: 8px;
  background-image:
    linear-gradient(rgba(4, 10, 12, .28), rgba(4, 10, 12, .5)),
    var(--race-background-image, none);
  background-position:center;
  background-size:cover;
  background-repeat:no-repeat;
  overflow: hidden;
}

.race-main-pane {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: 10px;
  overflow: hidden;
}

.race-category-tabs {
  height: 100%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.race-category-tabs button {
  min-width: 0;
  min-height: 40px;
  display: grid;
  place-items: center;
  padding: 6px 10px;
  border: 1px solid #385159;
  border-radius: 7px;
  background: rgba(18, 33, 38, .82);
  color: #a9babc;
  text-align: center;
  cursor: pointer;
}

.race-category-tabs button strong {
  color: #dfe9e8;
  font-size: 15px;
  font-weight: 900;
}

.race-category-description {
  min-height: 0;
  display: flex;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid #294047;
  border-radius: 7px;
  background: rgba(16, 31, 36, .82);
  color: #a9babc;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.race-category-tabs button:hover {
  border-color: #4e7580;
  color: #dbe8e8;
}

.race-category-tabs button.active {
  border-color: var(--picker-active);
  background: var(--picker-active-bg);
  color: #f4fbfa;
  box-shadow: 0 0 0 1px rgba(113, 209, 223, .13) inset;
}

.race-category-tabs button.active strong {
  color: #f4fbfa;
}

.race-list {
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

.race-item {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
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

.race-item:hover {
  border-color: #4f7580;
  background: #162a30;
}

.race-item:active {
  transform: translateY(1px);
}

.race-item.active {
  border-color: var(--picker-active);
  background: var(--picker-active-bg);
  color: #f3fbfa;
  box-shadow: 0 0 0 1px rgba(113, 209, 223, .16) inset;
}

.race-item-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.race-item-name {
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.2;
}

.race-item-icon,
.race-item-icon-fallback {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid #45616a;
  border-radius: 6px;
  background: #17282e;
}

.race-item-icon {
  object-fit: cover;
}

.race-item-icon-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ce8f1;
  font-size: 16px;
  font-weight: 900;
}

.race-detail {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 9px;
  padding: 10px;
  border: 1px solid var(--picker-line);
  border-radius: 8px;
  background: linear-gradient(180deg, #101d22, #0c171b);
}

.race-title {
  min-width: 0;
}

.race-title h3 {
  margin: 0;
  color: var(--picker-text);
  font-size: 24px;
  line-height: 1.15;
}

.race-summary {
  margin: 6px 0 0;
  color: #c7d5d6;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
}

.race-description {
  margin: 3px 0 0;
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
.race-detail-empty,
.race-empty {
  color: var(--picker-muted);
}

.skill-detail-block :deep(.skill-table-wrap) {
  max-height: 480px;
}

.race-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 1px;
}

.race-actions button {
  min-width: 150px;
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

.race-actions button:hover {
  background: #205964;
}

.race-detail-empty {
  grid-template-rows: 1fr;
  place-content: center;
  text-align: center;
}

.race-detail-empty strong {
  color: #dce8e7;
  font-size: 18px;
}

.race-detail-empty span {
  margin-top: 5px;
  font-size: 12px;
}

.race-empty {
  padding: 12px;
  border: 1px dashed #3d5961;
  border-radius: 8px;
  background: #0e1a1e;
  font-size: 13px;
}

@media (max-width: 760px) {
  .race-layout {
    grid-template-rows: 29% minmax(0, 71%);
    gap: 7px;
  }

  .race-category-pane {
    min-height: 0;
    padding: 6px;
    overflow: hidden;
  }

  .race-category-tabs {
    min-width: 0;
    height: 100%;
    gap: 5px;
  }

  .race-category-tabs button {
    min-height: 38px;
    height: auto;
    padding: 6px 7px;
  }

  .race-category-tabs button strong {
    font-size: 14px;
  }

  .race-category-description {
    padding: 7px 8px;
    font-size: 11px;
    line-height: 1.4;
  }

  .race-main-pane {
    grid-template-columns: minmax(130px, 35%) minmax(0, 65%);
    gap: 7px;
  }

  .race-list {
    max-height: none;
    height: 100%;
    display: grid;
    grid-template-columns: 1fr;
    align-content: start;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 5px;
  }

  .race-item {
    width: 100%;
    min-width: 0;
    min-height: 52px;
    padding: 6px;
    font-size: 12px;
  }

  .race-item-main {
    width: 100%;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    text-align: left;
  }

  .race-item-icon,
  .race-item-icon-fallback {
    width: 32px;
    height: 32px;
  }

  .race-item-name {
    width: auto;
    flex: 1 1 auto;
    font-size: 11px;
    text-align: left;
  }

  .race-detail {
    height: 100%;
    max-height: none;
    gap: 6px;
    padding: 7px;
  }

  .race-title h3 {
    font-size: 18px;
  }

  .race-summary {
    margin-top: 4px;
    font-size: 12px;
  }

  .race-description {
    font-size: 11px;
  }

  .detail-tabs button {
    min-height: 34px;
    padding: 4px 2px;
    font-size: 11px;
  }

  .detail-block {
    padding: 6px;
  }

  .status-row,
  .skill-value-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .status-chip {
    min-height: 40px;
    padding: 4px 5px;
  }

  .race-actions button {
    width: 100%;
    min-width: 0;
    min-height: 36px;
    font-size: 12px;
  }
}

@media (max-width: 430px) {
  .race-main-pane {
    grid-template-columns: minmax(126px, 36%) minmax(0, 64%);
  }

  .race-category-tabs button {
    padding: 6px 5px;
  }

  .race-category-tabs button strong {
    font-size: 13px;
  }

  .race-category-description {
    font-size: 10px;
  }

  .race-item {
    min-height: 50px;
  }

  .race-item-name {
    font-size: 10px;
  }

  .detail-tabs button {
    font-size: 10px;
  }
}
</style>
