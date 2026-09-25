<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import SkillAcquiredTable from "./SkillAcquiredTable.vue";
import {
  classData as classDb,
  descriptionData as skillDescDb,
  raceData as raceSelectionDb
} from "../lib/game-data-registry.js";
import { getV39RaceSelectionDetail } from "../lib/v39-selection-detail.js";
import { getIconSrcByName, hasIconName } from "../lib/icon-library.js";
import { RACE_CLASS_NAME_MAP, SKILL_FIELD_DEFS } from "../constants/unitCommon.js";

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
const activeDetailTab = ref("status");

const activeRace = computed(() => {
  if (!filteredRaces.value.length || !activeRaceKey.value) return null;
  return filteredRaces.value.find(item => item.key === activeRaceKey.value) || null;
});

const activeSelectionDetail = computed(() => getV39RaceSelectionDetail(activeRace.value?.key));

const activeRaceClassRow = computed(() => activeSelectionDetail.value?.sourceRow || null);
const statusRowGroups = computed(() => activeSelectionDetail.value?.statusRows || []);
const skillRows = computed(() => activeSelectionDetail.value?.skillRows || []);
const raceLv5SkillNames = computed(() => activeSelectionDetail.value?.acquiredSkillNames || []);

watch(
  [() => props.show, filteredRaces, () => props.selectedRace],
  ([isOpen, allowedRows, selectedRace]) => {
    if (!isOpen) {
      activeRaceKey.value = "";
      activeDetailTab.value = "status";
      return;
    }
    const list = Array.isArray(allowedRows) ? allowedRows : [];
    if (!list.length) {
      activeRaceKey.value = "";
      return;
    }
    const selected = list.find(item => item.key === selectedRace);
    if (selected) {
      activeRaceKey.value = selected.key;
      return;
    }
    const current = list.find(item => item.key === activeRaceKey.value);
    if (current) return;
    activeRaceKey.value = "";
  },
  { immediate: true }
);

function selectRace(key) {
  if (allowedRaceSet.value.size && !allowedRaceSet.value.has(key)) return;
  activeRaceKey.value = key;
}

function confirmRace() {
  if (!activeRace.value?.key) return;
  emit("confirm", activeRace.value.key);
}
</script>

<template>
  <base-modal :show="show" title="種族選択" :subtitle="setupProgressText" :wide="true" :close-on-backdrop="false" variant="v39" @close="$emit('close')">
    <div v-if="filteredRaces.length" class="race-layout">
      <aside class="race-list">
        <button
          v-for="race in filteredRaces"
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

        <nav class="detail-tabs" role="tablist" aria-label="種族詳細">
          <button type="button" role="tab" :aria-selected="activeDetailTab === 'status'" :class="{ active: activeDetailTab === 'status' }" @click="activeDetailTab = 'status'">ステータス</button>
          <button type="button" role="tab" :aria-selected="activeDetailTab === 'skills'" :class="{ active: activeDetailTab === 'skills' }" @click="activeDetailTab = 'skills'">技能</button>
          <button type="button" role="tab" :aria-selected="activeDetailTab === 'abilities'" :class="{ active: activeDetailTab === 'abilities' }" @click="activeDetailTab = 'abilities'">スキル</button>
        </nav>

        <div class="detail-tab-panel">
          <section v-if="activeDetailTab === 'status'" class="detail-block">
            <h4>ステータス</h4>
            <div class="status-rows">
              <div v-for="row in statusRowGroups" :key="row.key" class="status-row">
                <div v-for="item in row.fields" :key="item.key" class="status-chip">
                  <span>{{ item.key }}</span>
                  <strong>{{ item.value ?? "-" }}</strong>
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="activeDetailTab === 'skills'" class="detail-block">
            <h4>技能</h4>
            <div v-if="skillRows.length" class="skill-value-grid">
              <div
                v-for="item in skillRows"
                :key="item.key"
                class="skill-value-chip"
                :title="item.desc || `${item.label}: 詳細なし`"
              >
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
            <div v-else class="small note-text">技能データなし</div>
          </section>

          <section v-else class="detail-block skill-detail-block">
            <h4>種族スキル (Lv1-5)</h4>
            <skill-acquired-table
              :skill-names="raceLv5SkillNames"
              :status-source="activeRaceClassRow"
              :show-title="false"
              empty-text="種族スキルなし"
            />
          </section>
        </div>

        <div class="race-actions">
          <button type="button" data-v39-race-confirm @click="confirmRace">この種族で決定</button>
        </div>
      </section>

      <section v-else class="race-detail race-detail-empty">
        <strong>種族を選択してください</strong>
        <span>一覧から種族を選ぶと、ステータス・技能・スキルの詳細を確認できます。</span>
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
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  grid-template-rows: auto auto minmax(0, 1fr) auto;
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
    grid-template-columns: 1fr;
    grid-template-rows: minmax(120px, 32%) minmax(0, 1fr);
    height: 100%;
  }

  .race-list {
    max-height: none;
    height: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .race-item {
    min-height: 42px;
    padding: 5px 7px;
    font-size: 13px;
  }

  .race-item-icon,
  .race-item-icon-fallback {
    width: 30px;
    height: 30px;
  }

  .race-detail {
    height: 100%;
    max-height: none;
  }

  .race-title h3 {
    font-size: 20px;
  }

  .status-row,
  .skill-value-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 430px) {
  .race-list {
    grid-template-columns: 1fr;
    max-height: 160px;
  }

  .detail-tabs button {
    font-size: 12px;
  }
}
</style>
