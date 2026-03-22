<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import SkillAcquiredTable from "./SkillAcquiredTable.vue";
import classDb from "../../../data/source/export/json/クラス.json";
import skillDescDb from "../../../data/source/export/json/説明.json";
import { getIconSrcByName, hasIconName } from "../lib/icon-library.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  selectedRace: { type: String, default: "" },
  selectedClass: { type: String, default: "" },
  allowAdvancedClasses: { type: Boolean, default: false },
  setupProgressText: { type: String, default: "" }
});

const emit = defineEmits(["close", "confirm", "back"]);

const RACE_CLASS_NAME_MAP = {
  "只人": "ヒューマン",
  "エルフ": "エルフ",
  "オーガ": "オーガ",
  "ゴブリン": "ゴブリン",
  "竜人": "ドラゴニュート",
  "悪魔": "デヴィル",
  "天使": "エンジェル",
  "ヴァンパイア": "ヴァンパイア"
};

const SKILL_FIELD_DEFS = [
  { key: "指揮", label: "指揮" },
  { key: "威圧", label: "威圧" },
  { key: "看破", label: "看破" },
  { key: "早業", label: "早業" },
  { key: "技術", label: "技術" },
  { key: "隠密", label: "隠密" },
  { key: "索敵", label: "索敵" },
  { key: "農業", label: "農業" },
  { key: "林業", label: "林業" },
  { key: "漁業", label: "漁業" },
  { key: "工業", label: "工業" },
  { key: "統治", label: "統治" },
  { key: "交渉", label: "交渉" },
  { key: "魔術", label: "魔術", aliases: ["魔法技術"] },
  { key: "信仰", label: "信仰" }
];

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

const activeClass = computed(() => {
  if (!classCandidates.value.length) return null;
  return classCandidates.value.find(row => nonEmptyText(row.名前) === activeClassName.value) || classCandidates.value[0];
});

const statusRowGroups = computed(() => {
  const row = activeClass.value;
  if (!row) return [];
  return STATUS_ROW_FIELDS.map((group, index) => ({
    key: `status-row-${index}`,
    fields: group.map((field) => ({
      key: field,
      value: toSafeNumber(row[field])
    }))
  }));
});

const skillRows = computed(() => {
  const row = activeClass.value;
  if (!row) return [];
  return SKILL_FIELD_DEFS.map((field) => {
    const value = resolveSkillFieldValue(row, field);
    return {
      key: field.key,
      label: field.label || field.key,
      value: value ?? 0,
      desc: resolveSkillDescription(field)
    };
  }).filter(item => item.value > 0);
});

const classLv5SkillNames = computed(() => {
  const row = activeClass.value;
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
  [() => props.show, classCandidates, () => props.selectedClass],
  ([isOpen, candidates, selectedClass]) => {
    if (!isOpen) return;
    const selected = nonEmptyText(selectedClass);
    if (selected && candidates.some(row => nonEmptyText(row.名前) === selected)) {
      activeClassName.value = selected;
      return;
    }
    if (!candidates.length) {
      activeClassName.value = "";
      return;
    }
    activeClassName.value = nonEmptyText(candidates[0].名前);
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
  <base-modal :show="show" title="クラス選択" :subtitle="setupProgressText" :wide="true" :close-on-backdrop="false" @close="$emit('close')">
    <header class="class-modal-head">
      <h2>クラス選択</h2>
      <div v-if="setupProgressText" class="class-modal-head-sub">{{ setupProgressText }}</div>
    </header>
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
          <div class="class-title-sub">種別: {{ activeClass.種類 }} / 合計: {{ activeClass.合計 || "-" }}</div>
          <p class="class-text">{{ activeClass.詳細 || "詳細説明は未設定です。" }}</p>
        </header>

        <div class="class-body-split">
          <section class="class-left-pane">
            <div class="class-left-scroll">
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
            </div>
          </section>

          <section class="class-right-pane">
            <div class="class-right-scroll">
              <section class="detail-block skill-detail-block">
                <h4>クラススキル (Lv1-5)</h4>
                <skill-acquired-table
                  :skill-names="classLv5SkillNames"
                  :status-source="activeClass"
                  :show-title="false"
                  empty-text="クラススキルなし"
                />
              </section>
            </div>
          </section>
        </div>

        <div class="class-actions">
          <button type="button" class="secondary" @click="$emit('back')">種族へ戻る</button>
          <button type="button" @click="confirmClass">このクラスで決定</button>
        </div>
      </section>
    </div>

    <div v-else class="class-empty">
      <p v-if="!selectedRace">先に種族を選択してください。</p>
      <p v-else>この種族に対応するクラスデータがありません。</p>
    </div>
  </base-modal>
</template>

<style scoped>
.class-modal-head {
  border: 1px solid rgba(214, 181, 122, 0.52);
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 10px;
  background: linear-gradient(180deg, rgba(255, 239, 207, 0.96), rgba(238, 216, 174, 0.94));
  color: #2f1f0e;
}

.class-modal-head h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.1;
}

.class-modal-head-sub {
  margin-top: 4px;
  font-size: 14px;
  color: #4b3015;
  font-weight: 700;
}

.class-layout {
  display: grid;
  grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
  gap: 14px;
  min-width: 0;
}

.class-list {
  border: 1px solid rgba(210, 178, 119, 0.42);
  border-radius: 10px;
  background: rgba(24, 18, 12, 0.7);
  padding: 10px;
  display: grid;
  gap: 8px;
  align-content: start;
  min-width: 0;
  max-height: 590px;
  overflow-y: auto;
}

.class-list-head {
  color: #fff0c9;
  margin-bottom: 2px;
  font-size: 18px;
  font-weight: 700;
}

.class-item {
  width: 100%;
  text-align: left;
  border: 1px solid rgba(212, 181, 126, 0.34);
  background: rgba(46, 32, 20, 0.8);
  color: #fff0cf;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: var(--class-picker-item-font-size, 25px);
  line-height: 1.1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-width: 0;
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
  width: 36px;
  height: 36px;
  border-radius: 6px;
  flex: 0 0 auto;
}

.class-item-icon {
  border: 1px solid rgba(222, 191, 133, 0.58);
  object-fit: cover;
  background: rgba(0, 0, 0, 0.22);
}

.class-item-icon-fallback {
  border: 1px solid rgba(222, 191, 133, 0.58);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ffe7b7;
  background: rgba(0, 0, 0, 0.34);
  font-size: 18px;
  font-weight: 700;
}

.class-item.active {
  border-color: rgba(243, 212, 146, 0.84);
  background: linear-gradient(160deg, rgba(139, 91, 44, 0.92), rgba(89, 57, 30, 0.95));
  box-shadow: 0 0 0 1px rgba(248, 226, 177, 0.36) inset;
}

.class-kind {
  opacity: 0.95;
  font-size: 15px;
  font-weight: 700;
  flex: 0 0 auto;
}

.class-detail {
  border: 1px solid rgba(210, 178, 119, 0.42);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(27, 19, 13, 0.86), rgba(17, 12, 8, 0.9));
  padding: 12px;
  display: grid;
  gap: 10px;
  min-width: 0;
  max-height: 590px;
  overflow: hidden;
}
.class-title {
  height: 130px;
}
.class-title h3 {
  margin: 0;
  color: #fff4d6;
  font-size: 30px;
  line-height: 1.1;
}

.class-title-sub {
  margin-top: 4px;
  color: #ffe6b8;
  font-size: 16px;
  font-weight: 700;
}

.class-text {
  margin: 6px 0 0;
  color: #ffe3b0;
  font-size: 15px;
  line-height: 1.45;
}

.class-body-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
  overflow: hidden;
}

.class-left-pane,
.class-right-pane {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: block;
}

.class-left-scroll,
.class-right-scroll {
  height: 100%;
  min-height: 0;
  max-height: 100%;
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

.class-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.class-empty {
  border: 1px dashed rgba(214, 181, 122, 0.45);
  border-radius: 10px;
  padding: 12px;
  color: #f1deba;
  font-size: 16px;
}

@media (max-width: 1px) {
  .class-layout {
    grid-template-columns: 1fr;
  }

  .class-body-split {
    grid-template-columns: 1fr;
  }
}
</style>
