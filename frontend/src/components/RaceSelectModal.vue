<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import SkillAcquiredTable from "./SkillAcquiredTable.vue";
import raceSelectionDb from "../../../data/source/export/json/種族.json";
import classDb from "../../../data/source/export/json/クラス.json";
import skillDescDb from "../../../data/source/export/json/説明.json";
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
  const icon = nonEmptyText(race?.icon);
  if (icon) return icon;
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

const activeRace = computed(() => {
  if (!filteredRaces.value.length) return null;
  return filteredRaces.value.find(item => item.key === activeRaceKey.value) || filteredRaces.value[0];
});

const activeRaceClassRow = computed(() => {
  const raceKey = nonEmptyText(activeRace.value?.key);
  if (!raceKey) return null;
  const raceClassName = RACE_CLASS_NAME_MAP[raceKey] || raceKey;
  return classRows.value.find(row => nonEmptyText(row.名前) === raceClassName) || null;
});

const statusRowGroups = computed(() => {
  const row = activeRaceClassRow.value;
  if (!row) return [];
  return STATUS_ROW_FIELDS.map((group, index) => ({
    key: `status-row-${index}`,
    fields: group.map(field => ({
      key: field,
      value: toSafeNumber(row[field])
    }))
  }));
});

const skillRows = computed(() => {
  const row = activeRaceClassRow.value;
  if (!row) return [];
  return SKILL_FIELD_DEFS.map((field) => {
    const value = resolveSkillFieldValue(row, field);
    return {
      key: field.key,
      label: field.label || field.key,
      value,
      desc: resolveSkillDescription(field)
    };
  }).filter(item => item.value > 0);
});

const raceLv5SkillNames = computed(() => {
  const row = activeRaceClassRow.value;
  if (!row) return [];
  const out = [];
  const seen = new Set();
  for (const field of ACQUIRED_SKILL_FIELDS_LV5) {
    const name = nonEmptyText(row[field]);
    if (isPlaceholderSkillName(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
});

watch(
  [() => props.show, filteredRaces, () => props.selectedRace],
  ([isOpen, allowedRows, selectedRace]) => {
    if (!isOpen) return;
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
    activeRaceKey.value = list[0]?.key || "";
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
  <base-modal :show="show" title="種族選択" :subtitle="setupProgressText" :wide="true" :close-on-backdrop="false" @close="$emit('close')">
    <div v-if="filteredRaces.length" class="race-layout">
      <aside class="race-list">
        <button
          v-for="race in filteredRaces"
          :key="race.key"
          type="button"
          class="race-item"
          :class="{ active: activeRace?.key === race.key }"
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
          <div class="race-title-sub">基礎値: HP {{ activeRace.hp }} / ATK {{ activeRace.atk }}</div>
          <p class="race-summary">{{ activeRace.summary }}</p>
          <p class="race-description">{{ activeRace.detail }}</p>
        </header>

        <div class="race-body-split">
          <section class="race-left-pane">
            <section class="detail-block">
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

            <section class="detail-block">
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
          </section>

          <section class="race-right-pane">
            <section class="detail-block skill-detail-block">
              <h4>種族スキル (Lv1-5)</h4>
              <skill-acquired-table
                :skill-names="raceLv5SkillNames"
                :status-source="activeRaceClassRow"
                :show-title="false"
                empty-text="種族スキルなし"
              />
            </section>
          </section>
        </div>

        <div class="race-actions">
          <button type="button" @click="confirmRace">この種族で決定</button>
        </div>
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
  grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
  gap: 14px;
  min-width: 0;
}

.race-list {
  border: 1px solid rgba(210, 178, 119, 0.42);
  border-radius: 10px;
  background: rgba(24, 18, 12, 0.7);
  padding: 10px;
  display: grid;
  gap: 8px;
  align-content: start;
  min-width: 0;
  max-height: 760px;
  overflow-y: auto;
}

.race-item {
  width: 100%;
  text-align: left;
  border: 1px solid rgba(212, 181, 126, 0.34);
  background: rgba(46, 32, 20, 0.8);
  color: #fff0cf;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: var(--race-picker-item-font-size, 25px);
  line-height: 1.1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-width: 0;
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
  width: 36px;
  height: 36px;
  border-radius: 6px;
  flex: 0 0 auto;
}

.race-item-icon {
  border: 1px solid rgba(222, 191, 133, 0.58);
  object-fit: cover;
  background: rgba(0, 0, 0, 0.22);
}

.race-item-icon-fallback {
  border: 1px solid rgba(222, 191, 133, 0.58);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ffe7b7;
  background: rgba(0, 0, 0, 0.34);
  font-size: 18px;
  font-weight: 700;
}

.race-item.active {
  border-color: rgba(243, 212, 146, 0.84);
  background: linear-gradient(160deg, rgba(139, 91, 44, 0.92), rgba(89, 57, 30, 0.95));
  box-shadow: 0 0 0 1px rgba(248, 226, 177, 0.36) inset;
}

.race-detail {
  border: 1px solid rgba(210, 178, 119, 0.42);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(27, 19, 13, 0.86), rgba(17, 12, 8, 0.9));
  padding: 12px;
  display: grid;
  gap: 10px;
  min-width: 0;
  max-height: 760px;
  overflow: hidden;
}

.race-title h3 {
  margin: 0;
  color: #fff4d6;
  font-size: 30px;
  line-height: 1.1;
}

.race-title-sub {
  margin-top: 4px;
  color: #ffe6b8;
  font-size: 16px;
  font-weight: 700;
}

.race-summary {
  margin: 6px 0 0;
  color: #ffe3b0;
  font-weight: 700;
  font-size: 16px;
}

.race-description {
  margin: 4px 0 0;
  color: #ffe3b0;
  font-size: 15px;
  line-height: 1.45;
}

.race-body-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
  overflow: hidden;
}

.race-left-pane,
.race-right-pane {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 10px;
  align-content: start;
}

.detail-block {
  border: 1px solid rgba(211, 179, 121, 0.3);
  border-radius: 8px;
  padding: 10px;
  background: rgba(22, 16, 11, 0.55);
}

.detail-block h4 {
  margin: 0 0 8px;
  color: #fff1cd;
  font-size: 17px;
}

.status-rows {
  display: grid;
  gap: 6px;
}

.status-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.status-chip {
  border: 1px solid rgba(218, 186, 128, 0.3);
  border-radius: 6px;
  padding: 6px 8px;
  background: rgba(48, 34, 21, 0.58);
  display: flex;
  justify-content: space-between;
  gap: 6px;
  color: #ffe5b8;
  font-size: 15px;
}

.status-chip strong {
  color: #fff8e6;
}

.skill-value-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.skill-value-chip {
  border: 1px solid rgba(218, 186, 128, 0.28);
  border-radius: 6px;
  padding: 6px 8px;
  background: rgba(42, 30, 19, 0.5);
  display: flex;
  justify-content: space-between;
  gap: 6px;
  color: #ffe0ad;
  font-size: 15px;
}

.skill-value-chip strong {
  color: #fff8e6;
}

.note-text {
  color: #e7d4aa;
  font-size: 15px;
}

.skill-detail-block :deep(.skill-table-wrap) {
  max-height: 540px;
}

.race-actions {
  margin-top: 2px;
}

.race-empty {
  border: 1px dashed rgba(214, 181, 122, 0.45);
  border-radius: 10px;
  padding: 12px;
  color: #f1deba;
  font-size: 16px;
}

@media (max-width: 1px) {
  .race-layout {
    grid-template-columns: 1fr;
  }

  .race-body-split {
    grid-template-columns: 1fr;
  }
}
</style>
