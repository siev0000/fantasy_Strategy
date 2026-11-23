<script setup>
import { computed, ref, watch } from "vue";
import V39ItemListScreen2 from "./V39ItemListScreen2.vue";
import { classData as classDb, descriptionData as skillDescDb } from "../lib/game-data-registry.js";
import { getV39ClassSelectionDetail } from "../lib/v39-selection-detail.js";
import { renderV39ResourceIcon } from "../v39/ui/v39-resource-item-icon.js";
import { getIconSrcByName, hasIconName } from "../lib/icon-library.js";
import { resolveFactionUnitSheetFrame } from "../lib/unit-sheet-artwork.js";
import { resolveUnitImageArtwork } from "../lib/map-entity-artwork.js";
import { RACE_CLASS_NAME_MAP, SKILL_FIELD_DEFS } from "../constants/unitCommon.js";
import {
  isV39BaseClassRow,
  isV39InvalidDataToken,
  isV39ProfessionClassRow,
  resolveV39ClassCategory
} from "../lib/v39-class-rules.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  selectedRace: { type: String, default: "" },
  selectedClass: { type: String, default: "" },
  allowAdvancedClasses: { type: Boolean, default: false },
  allowedClasses: { type: Array, default: null },
  unmetClasses: { type: Array, default: () => [] },
  baseClassesOnly: { type: Boolean, default: false },
  setupProgressText: { type: String, default: "" },
  getTrainingQuote: Function
});

const emit = defineEmits(["close", "confirm", "back"]);

const STATUS_ROW_FIELDS = [
  ["HP", "攻撃", "魔力", "命中"],
  ["SIZ", "防御", "精神", "速度"]
];

const ACQUIRED_SKILL_FIELDS_LV5 = ["Skill1", "Skill2", "Skill3", "Skill4", "Skill5"];

const CLASS_CATEGORY_ORDER = ["戦士系", "格闘系", "狩人系", "魔法系", "信仰系", "ドルイド系", "バード系", "その他"];
const CLASS_CATEGORY_BY_IMAGE_ID = Object.freeze({
  "戦士":"戦士系",
  "狩人":"狩人系",
  "魔導士":"魔法系",
  "神官":"信仰系"
});

function resolveClassCategory(row) {
  return resolveV39ClassCategory(row, CLASS_CATEGORY_BY_IMAGE_ID[nonEmptyText(row?.画像ID)] || "その他");
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
  return isV39InvalidDataToken(value);
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
  if (props.allowedClasses) {
    const visible = new Set([...props.allowedClasses, ...props.unmetClasses.map(row => row.name)]);
    return allClasses.value.filter(row => visible.has(nonEmptyText(row.名前)));
  }
  if (!race) return [];
  if(props.baseClassesOnly)return allClasses.value.filter(isV39BaseClassRow);
  const raceClassName = RACE_CLASS_NAME_MAP[race] || race;
  const raceBase = allClasses.value.filter(row => nonEmptyText(row.名前) === raceClassName);
  const jobs = allClasses.value.filter((row) => {
    if (!isV39ProfessionClassRow(row)) return false;
    if (props.allowAdvancedClasses) return true;
    return isV39BaseClassRow(row);
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
const activeClassSheetFrame = computed(() => {
  const race = nonEmptyText(props.selectedRace);
  const className = nonEmptyText(activeClass.value?.名前);
  if (!race || !className) return null;
  return resolveFactionUnitSheetFrame({ race, className });
});
const activeClassSheetStyle = computed(() => {
  const frame = activeClassSheetFrame.value;
  if (!frame?.src) return null;
  return {
    backgroundImage:`url("${frame.src}")`,
    backgroundSize:frame.backgroundSize,
    backgroundPosition:frame.backgroundPosition
  };
});
const activeClassIndividualArtwork = computed(() => {
  if (activeClassSheetFrame.value) return null;
  const race = nonEmptyText(props.selectedRace);
  const className = nonEmptyText(activeClass.value?.名前);
  if (!race || !className) return null;
  return resolveUnitImageArtwork({ race, className });
});
const activeClassIndividualSrc = computed(() => nonEmptyText(activeClassIndividualArtwork.value?.src));

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
  if (!row || (props.allowedClasses && !props.allowedClasses.includes(nonEmptyText(row.名前)))) return;
  emit("confirm", {
    race: props.selectedRace,
    className: nonEmptyText(row.名前),
    classType: nonEmptyText(row.種類)
  });
}
const candidateRows = computed(() => categoryClasses.value.map(row => ({
  id:row.名前, label:row.名前, icon:classIconSrcFromRow(row),
  unavailable:props.unmetClasses.some(option => option.name === row.名前)
})));
const selected = computed(() => activeClass.value ? {
  label:activeClass.value.名前, type:`種別: ${activeClass.value.種類}`,
  description:activeClass.value.詳細 || "詳細説明は未設定です。",
  requirement:activeClass.value.取得条件,
  unavailable:props.unmetClasses.some(option => option.name === activeClass.value.名前),
  reasons:props.unmetClasses.find(option => option.name === activeClass.value.名前)?.reasons
} : null);
const trainingQuote = computed(() => activeClass.value && props.getTrainingQuote?.(activeClass.value.名前));
const costGroups = computed(() => trainingQuote.value ? [
  {label:"訓練",rows:trainingQuote.value.training},
  {label:"装備生成",rows:trainingQuote.value.equipment}
] : []);
const formatCost = new Intl.NumberFormat("ja-JP",{maximumFractionDigits:4});
</script>

<template>
  <v39-item-list-screen2 :show="show" title="クラス選択" :subtitle="setupProgressText"
    :categories="classCategories" :category="activeClassCategory" category-label="クラス系統"
    :rows="candidateRows" :selected-id="activeClassName" :selected="selected"
    :list-label="`種族: ${selectedRace}`" category-attribute="data-v39-class-category" row-attribute="data-v39-class-option"
    compact-preview :preview="{style:activeClassSheetStyle,src:activeClassIndividualSrc,label:`${selectedRace} ${activeClassName} ユニット画像`,fallback:`${selectedRace} / ${activeClassName || '-'}`}"
    :detail="{statusRows:statusRowGroups,skillRows,resistanceRows,equipmentRows,equipmentMode,equipmentTitle,skillNames:classLv5SkillNames,statusSource:activeClass}"
    :active-detail-tab="activeDetailTab" skill-title="クラススキル (Lv1-5)"
    :empty-text="selectedRace ? 'この種族に対応するクラスデータがありません。' : '先に種族を選択してください。'"
    :back-label="allowedClasses || baseClassesOnly ? '戻る' : '種族へ戻る'" confirm-label="このクラスで決定"
    @close="$emit('close')" @back="$emit('back')" @category="selectClassCategory" @select="selectClass"
    @detail-tab="activeDetailTab = $event" @confirm="confirmClass">
    <template #before-actions>
      <section v-if="trainingQuote" class="class-training-quote" aria-label="訓練予約の消費" aria-live="polite">
        <header><strong>消費 {{ trainingQuote.count }}ユニット分</strong><small>必要 / 在庫</small></header>
        <div class="class-training-quote-row">
          <small>拠点人口</small>
          <b :class="{ shortage:trainingQuote.population.shortage }">
            {{ formatCost.format(trainingQuote.population.required) }} / {{ formatCost.format(trainingQuote.population.stock) }}人
          </b>
        </div>
        <div v-for="group in costGroups" :key="group.label" class="class-training-quote-row">
          <small>{{ group.label }}</small>
          <div class="class-training-quote-resources">
            <span v-for="item in group.rows" :key="item.name" :class="{ shortage:item.shortage }"
              :title="item.name" :aria-label="`${item.name} 必要 ${item.required}、在庫 ${item.stock}${item.shortage?'、不足':''}`" role="img">
              <span aria-hidden="true" v-html="renderV39ResourceIcon(item.name)" />
              {{ formatCost.format(item.required) }}/{{ formatCost.format(item.stock) }}
            </span>
            <span v-if="!group.rows.length">なし</span>
          </div>
        </div>
      </section>
    </template>
  </v39-item-list-screen2>
</template>

<style scoped>
.class-training-quote {
  max-height:min(24svh, 145px);
  overflow:auto;
  overscroll-behavior:contain;
  margin:0 0 6px;
  padding:5px 6px;
  border:1px solid #40565e;
  border-radius:6px;
  background:#12242b;
  font-size:var(--font-body);
}
.class-training-quote header,.class-training-quote-row {
  display:flex;
  justify-content:space-between;
  align-items:baseline;
  gap:4px 8px;
  flex-wrap:wrap;
}
.class-training-quote-row {margin-top:3px}
.class-training-quote small {color:#b8cbd0}
.class-training-quote-resources {display:flex;flex-wrap:wrap;gap:3px 6px}
.class-training-quote-resources>span {white-space:nowrap}
.class-training-quote .shortage {color:#ff9b9b}
</style>
