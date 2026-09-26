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

const CLASS_CATEGORY_ORDER = ["戦士系", "狩人系", "魔法系", "信仰系", "その他"];
const CLASS_CATEGORY_BY_IMAGE_ID = Object.freeze({
  "戦士":"戦士系",
  "狩人":"狩人系",
  "魔導士":"魔法系",
  "神官":"信仰系"
});

// TODO: クラス.json に正式な分類列を追加したら、画像ID判定をその列参照へ置き換える。
function resolveClassCategory(row) {
  return CLASS_CATEGORY_BY_IMAGE_ID[nonEmptyText(row?.画像ID)] || "その他";
}

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
const activeClassCategory = ref("");
const activeDetailTab = ref("status");
const rememberedClassByCategory = ref({});

const classCategories = computed(() => (
  CLASS_CATEGORY_ORDER.filter(category =>
    classCandidates.value.some(row => resolveClassCategory(row) === category)
  )
));

const categoryClasses = computed(() => {
  const category = nonEmptyText(activeClassCategory.value);
  if (!category) return classCandidates.value;
  return classCandidates.value.filter(row => resolveClassCategory(row) === category);
});

const activeClass = computed(() => {
  if (!categoryClasses.value.length || !activeClassName.value) return null;
  return categoryClasses.value.find(row => nonEmptyText(row.名前) === activeClassName.value) || null;
});

function classesForCategory(category, list = classCandidates.value) {
  const key = nonEmptyText(category);
  const source = Array.isArray(list) ? list : [];
  if (!key) return [];
  return source.filter(row => resolveClassCategory(row) === key);
}

function rememberClass(category, className) {
  const categoryKey = nonEmptyText(category);
  const name = nonEmptyText(className);
  if (!categoryKey || !name) return;
  rememberedClassByCategory.value = {
    ...rememberedClassByCategory.value,
    [categoryKey]:name
  };
}

function selectRememberedOrFirstClass(category, list = classCandidates.value) {
  const categoryKey = nonEmptyText(category);
  const rows = classesForCategory(categoryKey, list);
  if (!rows.length) {
    activeClassName.value = "";
    return;
  }
  const rememberedName = nonEmptyText(rememberedClassByCategory.value?.[categoryKey]);
  const remembered = rows.find(row => nonEmptyText(row.名前) === rememberedName);
  const next = remembered || rows[0];
  activeClassName.value = nonEmptyText(next?.名前);
  rememberClass(categoryKey, activeClassName.value);
}

const activeSelectionDetail = computed(() => getV39ClassSelectionDetail(activeClass.value?.名前));
const statusRowGroups = computed(() => activeSelectionDetail.value?.statusRows || []);
const skillRows = computed(() => activeSelectionDetail.value?.skillRows || []);
const resistanceRows = computed(() => activeSelectionDetail.value?.resistanceRows || []);
const equipmentRows = computed(() => activeSelectionDetail.value?.equipmentRows || []);
const equipmentMode = computed(() => activeSelectionDetail.value?.equipmentMode || "");
const equipmentTitle = computed(() => activeSelectionDetail.value?.equipmentTitle || "");
const classLv5SkillNames = computed(() => activeSelectionDetail.value?.acquiredSkillNames || []);

watch(
  [() => props.show, classCandidates, () => props.selectedClass],
  ([isOpen, candidates, selectedClass]) => {
    if (!isOpen) {
      activeClassName.value = "";
      activeClassCategory.value = "";
      activeDetailTab.value = "status";
      rememberedClassByCategory.value = {};
      return;
    }

    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) {
      activeClassName.value = "";
      activeClassCategory.value = "";
      rememberedClassByCategory.value = {};
      return;
    }

    const selected = nonEmptyText(selectedClass);
    const selectedRow = selected
      ? list.find(row => nonEmptyText(row.名前) === selected)
      : null;
    if (selectedRow) {
      const category = resolveClassCategory(selectedRow);
      activeClassCategory.value = category;
      activeClassName.value = selected;
      rememberClass(category, selected);
      return;
    }

    const categories = classCategories.value;
    if (!categories.includes(activeClassCategory.value)) {
      activeClassCategory.value = categories[0] || "";
      selectRememberedOrFirstClass(activeClassCategory.value, list);
      return;
    }

    const current = list.find(row =>
      nonEmptyText(row.名前) === activeClassName.value
      && resolveClassCategory(row) === activeClassCategory.value
    );
    if (current) {
      rememberClass(activeClassCategory.value, activeClassName.value);
      return;
    }

    selectRememberedOrFirstClass(activeClassCategory.value, list);
  },
  { immediate:true }
);

function selectClassCategory(category) {
  const next = nonEmptyText(category);
  if (!next || next === activeClassCategory.value) return;
  if (activeClassCategory.value && activeClassName.value) {
    rememberClass(activeClassCategory.value, activeClassName.value);
  }
  activeClassCategory.value = next;
  selectRememberedOrFirstClass(next);
  activeDetailTab.value = "status";
}

function selectClass(name) {
  const row = classCandidates.value.find(item => nonEmptyText(item?.名前) === nonEmptyText(name));
  if (!row) return;
  activeClassName.value = nonEmptyText(row.名前);
  rememberClass(resolveClassCategory(row), activeClassName.value);
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
      <section class="class-category-pane">
        <nav class="class-category-tabs" role="tablist" aria-label="クラス系統">
          <button
            v-for="category in classCategories"
            :key="category"
            type="button"
            role="tab"
            :aria-selected="activeClassCategory === category"
            :class="{ active: activeClassCategory === category }"
            :data-v39-class-category="category"
            @click="selectClassCategory(category)"
          >
            <strong>{{ category }}</strong>
          </button>
        </nav>
      </section>

      <section class="class-main-pane">
        <aside class="class-list">
          <div class="class-list-head">種族: {{ selectedRace }}</div>
          <button
            v-for="row in categoryClasses"
            :key="row.名前"
            type="button"
            class="class-item"
            :class="{ active: activeClass?.名前 === row.名前 }"
            :data-v39-class-option="row.名前"
            @click="selectClass(row.名前)"
          >
            <span class="class-item-main">
              <img v-if="classIconSrcFromRow(row)" :src="classIconSrcFromRow(row)" :alt="`${row.名前} アイコン`" class="class-item-icon" />
              <span v-else class="class-item-icon-fallback">{{ String(row.名前 || "?").slice(0, 1) }}</span>
              <span class="class-item-name">{{ row.名前 }}</span>
            </span>
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
          :resistance-rows="resistanceRows"
          :equipment-rows="equipmentRows"
          :equipment-mode="equipmentMode"
          :equipment-title="equipmentTitle"
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
          <span>左の一覧からクラスを選ぶと、ステータス・技能・スキルの詳細を確認できます。</span>
        </section>
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
  display:grid;
  grid-template-rows:auto minmax(0,1fr);
  gap:10px;
  min-width:0;
  min-height:0;
  height:100%;
  overflow:hidden;
}

.class-category-pane {
  min-height:0;
  padding:8px;
  border:1px solid var(--picker-line);
  border-radius:8px;
  background:#0d181c;
  overflow:hidden;
}

.class-category-tabs {
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:7px;
}

.class-category-tabs button {
  min-width:0;
  min-height:40px;
  display:grid;
  place-items:center;
  padding:6px 8px;
  border:1px solid #385159;
  border-radius:7px;
  background:#122126;
  color:#a9babc;
  text-align:center;
  cursor:pointer;
}

.class-category-tabs button strong {
  color:#dfe9e8;
  font-size:14px;
  font-weight:900;
  white-space:nowrap;
}

.class-category-tabs button:hover {
  border-color:#4e7580;
  color:#dbe8e8;
}

.class-category-tabs button.active {
  border-color:var(--picker-active);
  background:var(--picker-active-bg);
  color:#f4fbfa;
  box-shadow:0 0 0 1px rgba(113,209,223,.13) inset;
}

.class-category-tabs button.active strong {
  color:#f4fbfa;
}

.class-main-pane {
  min-width:0;
  min-height:0;
  display:grid;
  grid-template-columns:minmax(220px,300px) minmax(0,1fr);
  gap:10px;
  overflow:hidden;
}

.class-list {
  min-width:0;
  min-height:0;
  height:100%;
  overflow-y:auto;
  overscroll-behavior:contain;
  display:grid;
  gap:6px;
  align-content:start;
  padding:7px;
  border:1px solid var(--picker-line);
  border-radius:8px;
  background:#0d181c;
  scrollbar-width:thin;
  scrollbar-color:#405b63 transparent;
}

.class-list-head {
  padding:4px 3px 6px;
  color:#9fb1b4;
  font-size:12px;
  font-weight:800;
}

.class-item {
  width:100%;
  min-height:48px;
  display:flex;
  align-items:center;
  gap:8px;
  padding:6px 8px;
  border:1px solid #30464d;
  border-radius:7px;
  background:#122126;
  color:#dce7e6;
  font-size:15px;
  font-weight:700;
  text-align:left;
  cursor:pointer;
  transition:border-color .12s ease,background .12s ease,transform .12s ease;
}

.class-item:hover {
  border-color:#4f7580;
  background:#162a30;
}

.class-item:active {
  transform:translateY(1px);
}

.class-item.active {
  border-color:var(--picker-active);
  background:var(--picker-active-bg);
  color:#f3fbfa;
  box-shadow:0 0 0 1px rgba(113,209,223,.16) inset;
}

.class-item-main {
  display:inline-flex;
  align-items:center;
  gap:8px;
  min-width:0;
}

.class-item-name {
  min-width:0;
  white-space:normal;
  overflow-wrap:anywhere;
  line-height:1.2;
}

.class-item-icon,
.class-item-icon-fallback {
  width:34px;
  height:34px;
  flex:0 0 auto;
  border:1px solid #45616a;
  border-radius:6px;
  background:#17282e;
}

.class-item-icon {
  object-fit:cover;
}

.class-item-icon-fallback {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  color:#9ce8f1;
  font-size:16px;
  font-weight:900;
}

.class-detail {
  min-width:0;
  min-height:0;
  height:100%;
  overflow:hidden;
  display:grid;
  grid-template-rows:auto minmax(0,1fr) auto;
  gap:9px;
  padding:10px;
  border:1px solid var(--picker-line);
  border-radius:8px;
  background:linear-gradient(180deg,#101d22,#0c171b);
}

.class-title {
  min-width:0;
}

.class-title h3 {
  margin:0;
  color:var(--picker-text);
  font-size:24px;
  line-height:1.15;
}

.class-title-sub {
  margin-top:3px;
  color:#90dce7;
  font-size:13px;
  font-weight:700;
}

.class-text {
  margin:6px 0 0;
  color:var(--picker-muted);
  font-size:13px;
  line-height:1.5;
}

.class-actions {
  display:flex;
  justify-content:space-between;
  gap:8px;
}

.class-actions button {
  min-height:38px;
  padding:6px 14px;
  border:1px solid var(--picker-active);
  border-radius:7px;
  background:#1a4b55;
  color:#f2fbfa;
  font-size:13px;
  font-weight:900;
  cursor:pointer;
}

.class-actions button:hover {
  background:#205964;
}

.class-actions button.secondary {
  border-color:#42585f;
  background:#132126;
  color:#b8c7c9;
}

.class-actions button.secondary:hover {
  border-color:#5c7982;
  background:#182b31;
  color:#e2eceb;
}

.class-detail-empty {
  grid-template-rows:1fr;
  place-content:center;
  text-align:center;
  color:var(--picker-muted);
}

.class-detail-empty strong {
  color:#dce8e7;
  font-size:18px;
}

.class-detail-empty span {
  margin-top:5px;
  font-size:12px;
}

.class-empty {
  padding:12px;
  border:1px dashed #3d5961;
  border-radius:8px;
  background:#0e1a1e;
  color:var(--picker-muted);
  font-size:13px;
}

@media (max-width:760px) {
  .class-layout {
    grid-template-rows:54px minmax(0,1fr);
    gap:7px;
  }

  .class-category-pane {
    padding:6px;
  }

  .class-category-tabs {
    height:100%;
    gap:4px;
  }

  .class-category-tabs button {
    min-height:0;
    height:100%;
    padding:4px 3px;
  }

  .class-category-tabs button strong {
    font-size:11px;
  }

  .class-main-pane {
    grid-template-columns:minmax(130px,35%) minmax(0,65%);
    gap:7px;
  }

  .class-list {
    max-height:none;
    height:100%;
    display:grid;
    grid-template-columns:1fr;
    align-content:start;
    overflow-x:hidden;
    overflow-y:auto;
    padding:5px;
  }

  .class-list-head {
    padding:3px 2px 5px;
    font-size:10px;
  }

  .class-item {
    width:100%;
    min-width:0;
    min-height:52px;
    padding:6px;
    font-size:12px;
  }

  .class-item-main {
    width:100%;
    gap:6px;
  }

  .class-item-icon,
  .class-item-icon-fallback {
    width:32px;
    height:32px;
  }

  .class-item-name {
    flex:1 1 auto;
    font-size:11px;
  }

  .class-detail {
    height:100%;
    max-height:none;
    gap:6px;
    padding:7px;
  }

  .class-title h3 {
    font-size:18px;
  }

  .class-title-sub {
    font-size:11px;
  }

  .class-text {
    margin-top:4px;
    font-size:11px;
  }

  .class-actions button {
    flex:1 1 0;
    min-width:0;
    min-height:36px;
    padding:5px 6px;
    font-size:11px;
  }
}

@media (max-width:430px) {
  .class-main-pane {
    grid-template-columns:minmax(126px,36%) minmax(0,64%);
  }

  .class-category-tabs button strong {
    font-size:10px;
  }

  .class-item {
    min-height:50px;
  }

  .class-item-name {
    font-size:10px;
  }
}
</style>
