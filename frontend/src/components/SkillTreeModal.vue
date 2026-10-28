<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import { researchTreeData, resolveResearchCategoryList, normalizeResearchCategoryName } from "../lib/research-tree-config.js";
import { getIconSrcByName } from "../lib/icon-library.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  categories: {
    type: Array,
    default: () => []
  },
  initialCategory: {
    type: String,
    default: ""
  },
  researchProgress: {
    type: Object,
    default: () => ({})
  },
  researchSelection: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(["close", "update:researchProgress", "update:researchSelection"]);

const researchCategoriesMap = researchTreeData.categories || {};
const activeCategory = ref("");
const activeLevel = ref(1);
const selectedResearchId = ref("");
const selectedByCategory = ref({});
const researchProgressState = ref(createEmptyResearchProgressState());
const RESEARCH_EXP_BASE = 100;
const EXP_MANUAL_STEP = 50;
const CATEGORY_ICON_MAP = {
  鍛冶Lv: "鍛冶",
  魔法Lv: "魔法",
  信仰Lv: "信仰",
  軍事Lv: "兵士",
  経済Lv: "金"
};

function createEmptyResearchProgressState() {
  return {
    targetExpMap: {},
    completedByCategoryLevel: {},
    carryByCategory: {}
  };
}

function normalizeCategoryName(value) {
  return normalizeResearchCategoryName(String(value || "").trim());
}

function sanitizeSelectionMap(raw) {
  if (!raw || typeof raw !== "object") return {};
  return Object.entries(raw).reduce((acc, [categoryKey, value]) => {
    const normalizedKey = String(categoryKey || "").trim();
    if (!normalizedKey) return acc;
    if (typeof value === "string" || typeof value === "number") {
      const directId = String(value || "").trim();
      if (directId) acc[normalizedKey] = directId;
      return acc;
    }
    if (!value || typeof value !== "object") return acc;
    const selectedPairs = Object.entries(value).map(([levelKey, itemId]) => {
      const level = Math.max(1, Math.floor(Number(levelKey) || 1));
      const id = String(itemId || "").trim();
      return { level, id };
    }).filter(row => !!row.id);
    selectedPairs.sort((a, b) => b.level - a.level);
    const picked = selectedPairs[0]?.id || String(value?.itemId || value?.id || "").trim();
    if (picked) acc[normalizedKey] = picked;
    return acc;
  }, {});
}

function sanitizeResearchProgress(raw) {
  if (!raw || typeof raw !== "object") return createEmptyResearchProgressState();
  const targetExpMapRaw = raw?.targetExpMap && typeof raw.targetExpMap === "object" ? raw.targetExpMap : {};
  const completedRaw = raw?.completedByCategoryLevel && typeof raw.completedByCategoryLevel === "object"
    ? raw.completedByCategoryLevel
    : {};
  const carryRaw = raw?.carryByCategory && typeof raw.carryByCategory === "object" ? raw.carryByCategory : {};
  const targetExpMap = Object.entries(targetExpMapRaw).reduce((acc, [targetId, value]) => {
    const id = String(targetId || "").trim();
    if (!id) return acc;
    acc[id] = Math.max(0, Math.floor(Number(value) || 0));
    return acc;
  }, {});
  const completedByCategoryLevel = Object.entries(completedRaw).reduce((acc, [categoryKey, value]) => {
    const key = String(categoryKey || "").trim();
    if (!key || !value || typeof value !== "object") return acc;
    const perLevel = Object.entries(value).reduce((levelAcc, [levelKey, itemValue]) => {
      const level = Math.max(1, Math.floor(Number(levelKey) || 1));
      const completedIds = normalizeCompletedIds(itemValue);
      if (!completedIds.length) return levelAcc;
      levelAcc[level] = completedIds;
      return levelAcc;
    }, {});
    acc[key] = perLevel;
    return acc;
  }, {});
  const carryByCategory = Object.entries(carryRaw).reduce((acc, [categoryKey, value]) => {
    const key = String(categoryKey || "").trim();
    if (!key) return acc;
    acc[key] = Math.max(0, Math.floor(Number(value) || 0));
    return acc;
  }, {});
  return {
    targetExpMap,
    completedByCategoryLevel,
    carryByCategory
  };
}

function normalizeCompletedIds(rawValue) {
  if (Array.isArray(rawValue)) {
    return [...new Set(rawValue.map(v => String(v || "").trim()).filter(Boolean))];
  }
  if (rawValue && typeof rawValue === "object") {
    return [...new Set(Object.values(rawValue).map(v => String(v || "").trim()).filter(Boolean))];
  }
  const single = String(rawValue || "").trim();
  return single ? [single] : [];
}

function readSelectedItemId(categoryKey) {
  const key = String(categoryKey || "").trim();
  if (!key) return "";
  return String(selectedByCategory.value?.[key] || "").trim();
}

function readCompletedMap(categoryKey) {
  const key = String(categoryKey || "").trim();
  if (!key) return {};
  const source = researchProgressState.value?.completedByCategoryLevel?.[key];
  if (!source || typeof source !== "object") return {};
  return source;
}

function readCarryExp(categoryKey) {
  const key = String(categoryKey || "").trim();
  if (!key) return 0;
  return Math.max(0, Math.floor(Number(researchProgressState.value?.carryByCategory?.[key]) || 0));
}

function resolveTargetExp(targetId) {
  const id = String(targetId || "").trim();
  if (!id) return 0;
  return Math.max(0, Math.floor(Number(researchProgressState.value?.targetExpMap?.[id]) || 0));
}

function requiredExpForLevel(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return RESEARCH_EXP_BASE * (2 ** (lv - 1));
}

function resolveCategoryMaxLevel(categoryKey) {
  const rows = Array.isArray(researchCategoriesMap[categoryKey]?.levels)
    ? researchCategoriesMap[categoryKey].levels
    : [];
  const maxLevel = rows.reduce((acc, row) => Math.max(acc, Number(row?.level) || 0), 1);
  return Math.max(1, maxLevel);
}

function resolveCompletedLevel(categoryKey) {
  const completed = readCompletedMap(categoryKey);
  const maxLevel = resolveCategoryMaxLevel(categoryKey);
  let done = 0;
  for (let lv = 1; lv <= maxLevel; lv += 1) {
    const completedIds = normalizeCompletedIds(completed[lv]);
    if (!completedIds.length) break;
    done = lv;
  }
  return done;
}

function resolveCurrentLevel(categoryKey) {
  const maxLevel = resolveCategoryMaxLevel(categoryKey);
  const completed = resolveCompletedLevel(categoryKey);
  return Math.max(1, Math.min(maxLevel, completed + 1));
}

function resolvePickedItemId(categoryKey) {
  return readSelectedItemId(categoryKey);
}

function isLevelCompleted(categoryKey, level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const completed = readCompletedMap(categoryKey);
  return normalizeCompletedIds(completed[lv]).length > 0;
}

function isItemCompleted(categoryKey, level, itemId) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const id = String(itemId || "").trim();
  if (!id) return false;
  const completed = readCompletedMap(categoryKey);
  const completedIds = normalizeCompletedIds(completed[lv]);
  return completedIds.includes(id);
}

function isLevelFullyCompleted(categoryKey, level) {
  const row = activeLevelRows.value.find(v => Number(v?.level) === Number(level));
  const items = Array.isArray(row?.items) ? row.items : [];
  if (!items.length) return false;
  return items.every(item => isItemCompleted(categoryKey, level, String(item?.id || "")));
}

function isLevelUnlocked(categoryKey, level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const maxLevel = resolveCategoryMaxLevel(categoryKey);
  const completed = resolveCompletedLevel(categoryKey);
  const unlockedMax = Math.min(maxLevel, completed + 1);
  return lv <= unlockedMax;
}

function applyResearchExpDelta(categoryKey, level, targetId, delta) {
  const category = String(categoryKey || "").trim();
  const itemId = String(targetId || "").trim();
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const diff = Math.floor(Number(delta) || 0);
  if (!category || !itemId || !diff) return;
  if (isItemCompleted(category, lv, itemId)) return;
  const state = sanitizeResearchProgress(researchProgressState.value);
  const targetExpMap = { ...state.targetExpMap };
  const completedByCategoryLevel = { ...state.completedByCategoryLevel };
  const completedMap = { ...(completedByCategoryLevel[category] || {}) };
  const carryByCategory = { ...state.carryByCategory };
  const required = requiredExpForLevel(lv);
  const current = Math.max(0, Math.floor(Number(targetExpMap[itemId]) || 0));
  let next = Math.max(0, current + diff);
  if (diff > 0 && next >= required) {
    const overflow = next - required;
    next = required;
    const currentCompletedIds = normalizeCompletedIds(completedMap[lv]);
    if (!currentCompletedIds.includes(itemId)) {
      currentCompletedIds.push(itemId);
    }
    completedMap[lv] = currentCompletedIds;
    completedByCategoryLevel[category] = completedMap;
    carryByCategory[category] = Math.max(0, Math.floor(Number(carryByCategory[category]) || 0)) + overflow;
  } else {
    completedByCategoryLevel[category] = completedMap;
  }
  targetExpMap[itemId] = next;
  researchProgressState.value = {
    targetExpMap,
    completedByCategoryLevel,
    carryByCategory
  };
}

function consumeCarryForResearch(categoryKey, level, targetId) {
  const category = String(categoryKey || "").trim();
  const itemId = String(targetId || "").trim();
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  if (!category || !itemId) return;
  if (isItemCompleted(category, lv, itemId)) return;
  const carry = readCarryExp(category);
  if (carry <= 0) return;
  const state = sanitizeResearchProgress(researchProgressState.value);
  researchProgressState.value = {
    ...state,
    carryByCategory: {
      ...state.carryByCategory,
      [category]: 0
    }
  };
  applyResearchExpDelta(category, lv, itemId, carry);
}

const resolvedCategories = computed(() => {
  const requested = Array.isArray(props.categories)
    ? props.categories.map(normalizeCategoryName).filter(Boolean)
    : [];
  return resolveResearchCategoryList(requested, researchCategoriesMap);
});

const skippedCategories = computed(() => {
  const requested = Array.isArray(props.categories)
    ? props.categories.map(normalizeCategoryName).filter(Boolean)
    : [];
  if (!requested.length) return [];
  return requested.filter(key => !Object.prototype.hasOwnProperty.call(researchCategoriesMap, key));
});

const activeCategoryData = computed(() => {
  const key = String(activeCategory.value || "").trim();
  if (!key) return null;
  return researchCategoriesMap[key] || null;
});

const activeLevelRows = computed(() => {
  const rows = Array.isArray(activeCategoryData.value?.levels)
    ? activeCategoryData.value.levels
    : [];
  return rows.slice().sort((a, b) => (Number(a?.level) || 0) - (Number(b?.level) || 0));
});

const activeLevelRow = computed(() => {
  return activeLevelRows.value.find(row => Number(row?.level) === Number(activeLevel.value)) || null;
});

const selectedResearchInfo = computed(() => {
  const row = activeLevelRow.value;
  if (!row || !Array.isArray(row.items)) return null;
  const id = String(selectedResearchId.value || "").trim();
  if (!id) return null;
  return row.items.find(item => String(item?.id || "") === id) || null;
});

const activeSelectedPickedId = computed(() => {
  return resolvePickedItemId(activeCategory.value);
});

const activeSelectedIsPicked = computed(() => {
  const itemId = String(selectedResearchInfo.value?.id || "").trim();
  if (!itemId) return false;
  return String(activeSelectedPickedId.value || "") === itemId;
});

const activeSelectedRequiredExp = computed(() => {
  const level = Number(selectedResearchInfo.value?.level) || 1;
  return requiredExpForLevel(level);
});

const activeSelectedCurrentExp = computed(() => {
  const itemId = String(selectedResearchInfo.value?.id || "").trim();
  if (!itemId) return 0;
  return resolveTargetExp(itemId);
});

const activeSelectedCompleted = computed(() => {
  const item = selectedResearchInfo.value;
  if (!item) return false;
  return isItemCompleted(activeCategory.value, Number(item.level) || 1, String(item.id || ""));
});

const activeCategoryCarryExp = computed(() => {
  return readCarryExp(activeCategory.value);
});

const activeCategoryMaxLevel = computed(() => {
  return resolveCategoryMaxLevel(activeCategory.value);
});

const canAdjustSelectedResearchExp = computed(() => {
  return !!selectedResearchInfo.value && activeSelectedIsPicked.value && !activeSelectedCompleted.value;
});

watch(resolvedCategories, list => {
  if (!Array.isArray(list) || !list.length) {
    activeCategory.value = "";
    return;
  }
  if (!list.includes(activeCategory.value)) {
    activeCategory.value = list[0];
  }
}, { immediate: true });

watch(() => props.researchProgress, raw => {
  const nextValue = sanitizeResearchProgress(raw);
  const currentSig = JSON.stringify(sanitizeResearchProgress(researchProgressState.value));
  const nextSig = JSON.stringify(nextValue);
  if (currentSig === nextSig) return;
  researchProgressState.value = nextValue;
}, { immediate: true, deep: true });

watch(() => props.researchSelection, raw => {
  const nextValue = sanitizeSelectionMap(raw);
  const currentSig = JSON.stringify(sanitizeSelectionMap(selectedByCategory.value));
  const nextSig = JSON.stringify(nextValue);
  if (currentSig === nextSig) return;
  selectedByCategory.value = nextValue;
}, { immediate: true, deep: true });

watch(researchProgressState, value => {
  emit("update:researchProgress", sanitizeResearchProgress(value));
}, { deep: true });

watch(selectedByCategory, value => {
  emit("update:researchSelection", sanitizeSelectionMap(value));
}, { deep: true });

watch(activeLevelRows, rows => {
  if (!rows.length) {
    activeLevel.value = 1;
    selectedResearchId.value = "";
    return;
  }
  const levels = rows.map(row => Number(row?.level) || 0).filter(v => v > 0);
  if (!levels.length) {
    activeLevel.value = 1;
    selectedResearchId.value = "";
    return;
  }
  const categoryKey = String(activeCategory.value || "").trim();
  const preferred = levels.find(level => isLevelUnlocked(categoryKey, level) && !isLevelFullyCompleted(categoryKey, level))
    || levels.find(level => isLevelUnlocked(categoryKey, level))
    || levels[0];
  if (!levels.includes(Number(activeLevel.value)) || !isLevelUnlocked(categoryKey, Number(activeLevel.value))) {
    activeLevel.value = preferred;
  }
}, { immediate: true });

watch(activeLevelRow, row => {
  if (!row?.items?.length) {
    selectedResearchId.value = "";
    return;
  }
  const exists = row.items.some(item => String(item?.id || "") === String(selectedResearchId.value || ""));
  if (!exists) {
    selectedResearchId.value = String(row.items[0]?.id || "");
  }
}, { immediate: true });

watch(
  [() => props.show, () => props.initialCategory, resolvedCategories],
  ([visible, initialCategory, categories]) => {
    if (!visible) return;
    const key = normalizeCategoryName(initialCategory);
    if (!key) return;
    if (!Array.isArray(categories) || !categories.includes(key)) return;
    if (activeCategory.value !== key) {
      activeCategory.value = key;
    }
  },
  { immediate: true }
);

function selectCategory(key) {
  activeCategory.value = key;
}

function selectResearchItem(item) {
  const id = String(item?.id || "").trim();
  if (!id) return;
  selectedResearchId.value = id;
}

function resolveCategoryIconSrc(categoryKey) {
  const key = String(categoryKey || "").trim();
  const iconName = CATEGORY_ICON_MAP[key] || key.replace(/Lv$/u, "");
  return getIconSrcByName(iconName, "本");
}

function chooseSelectedResearch() {
  const categoryKey = String(activeCategory.value || "").trim();
  const row = activeLevelRow.value;
  const item = selectedResearchInfo.value;
  if (!categoryKey || !row || !item) return;
  const level = Number(row?.level) || 1;
  if (!isLevelUnlocked(categoryKey, level)) return;
  if (isItemCompleted(categoryKey, level, String(item.id || ""))) return;
  selectedByCategory.value = {
    ...selectedByCategory.value,
    [categoryKey]: String(item.id || "").trim()
  };
  consumeCarryForResearch(categoryKey, level, String(item.id || ""));
}

function adjustSelectedResearchExp(amount) {
  const item = selectedResearchInfo.value;
  if (!item) return;
  if (!canAdjustSelectedResearchExp.value) return;
  const categoryKey = String(activeCategory.value || "").trim();
  const level = Number(item.level) || 1;
  const itemId = String(item.id || "").trim();
  applyResearchExpDelta(categoryKey, level, itemId, amount);
  if (isItemCompleted(categoryKey, level, itemId)) {
    const currentRow = activeLevelRows.value.find(v => Number(v?.level) === level);
    const remainingInCurrentLevel = Array.isArray(currentRow?.items)
      ? currentRow.items.find(v => {
        const id = String(v?.id || "").trim();
        return id && !isItemCompleted(categoryKey, level, id);
      })
      : null;
    if (remainingInCurrentLevel) {
      activeLevel.value = level;
      selectedResearchId.value = String(remainingInCurrentLevel.id || "");
      return;
    }
    const nextLevel = activeLevelRows.value
      .map(v => Number(v?.level) || 0)
      .find(v => v > level && isLevelUnlocked(categoryKey, v));
    if (nextLevel) {
      activeLevel.value = nextLevel;
      const nextRow = activeLevelRows.value.find(v => Number(v?.level) === nextLevel);
      const nextItem = Array.isArray(nextRow?.items)
        ? nextRow.items.find(v => {
          const id = String(v?.id || "").trim();
          return id && !isItemCompleted(categoryKey, nextLevel, id);
        })
        : null;
      if (nextItem) {
        selectedResearchId.value = String(nextItem.id || "");
      }
    }
  }
}

const activeLevelNumbers = computed(() => {
  return activeLevelRows.value
    .map(row => Number(row?.level) || 0)
    .filter(level => level > 0);
});

const researchRowCount = computed(() => {
  const maxCount = activeLevelRows.value.reduce((acc, row) => {
    const count = Array.isArray(row?.items) ? row.items.length : 0;
    return Math.max(acc, count);
  }, 0);
  return Math.max(3, maxCount);
});

function resolveLevelRowByLevel(level) {
  return activeLevelRows.value.find(row => Number(row?.level) === Number(level)) || null;
}

const researchBoardRows = computed(() => {
  const categoryKey = String(activeCategory.value || "").trim();
  return Array.from({ length: researchRowCount.value }, (_, rowIndex) => {
    return activeLevelNumbers.value.map(level => {
      const row = resolveLevelRowByLevel(level);
      const item = Array.isArray(row?.items) ? (row.items[rowIndex] || null) : null;
      const pickedId = resolvePickedItemId(categoryKey);
      const isActive = !!item
        && Number(activeLevel.value) === Number(level)
        && String(selectedResearchId.value || "") === String(item.id || "");
      return {
        rowIndex,
        level,
        item,
        unlocked: isLevelUnlocked(categoryKey, level),
        completed: !!item && isItemCompleted(categoryKey, level, String(item.id || "")),
        picked: !!item && String(pickedId) === String(item.id || ""),
        active: isActive,
        currentExp: !!item ? resolveTargetExp(String(item.id || "")) : 0,
        requiredExp: requiredExpForLevel(level)
      };
    });
  });
});

function selectResearchCell(level, item) {
  if (!item) return;
  if (!isLevelUnlocked(activeCategory.value, level)) return;
  activeLevel.value = Number(level) || 1;
  selectResearchItem(item);
}
</script>

<template>
  <base-modal
    :show="show"
    title="研究"
    :wide="true"
    @close="$emit('close')"
  >
    <div class="research-modal">
      <p class="small research-help">
        研究として選択できる項目は、カテゴリごとに常に1件のみです。
      </p>

      <div v-if="skippedCategories.length" class="research-warning">
        未登録カテゴリ: {{ skippedCategories.join(" / ") }}
      </div>

      <div class="category-tabs" role="tablist" aria-label="研究カテゴリ">
        <button
          v-for="key in resolvedCategories"
          :key="key"
          type="button"
          class="tab-btn"
          :class="{ active: key === activeCategory }"
          @click="selectCategory(key)"
        >
          <img
            class="tab-icon"
            :src="resolveCategoryIconSrc(key)"
            :alt="`${researchCategoriesMap[key]?.name || key} アイコン`"
          >
          <span>{{ researchCategoriesMap[key]?.name || key }}</span>
          <small class="tab-level">Lv{{ resolveCurrentLevel(key) }}</small>
        </button>
      </div>

      <div v-if="activeCategoryData" class="research-layout">
        <section class="research-board-pane">
          <header class="research-pane-head">
            <div class="research-pane-title">
              <h3>{{ activeCategoryData.name }}</h3>
            </div>
            <div class="research-head-controls">
              <span class="research-head-exp">
                対象EXP:
                <template v-if="selectedResearchInfo">{{ activeSelectedCurrentExp }} / {{ activeSelectedRequiredExp }}</template>
                <template v-else>-</template>
              </span>
              <span class="research-head-exp">繰越EXP: {{ activeCategoryCarryExp }}</span>
              <div class="research-head-buttons">
                <button
                  type="button"
                  class="secondary exp-test-btn"
                  :disabled="!canAdjustSelectedResearchExp"
                  @click="adjustSelectedResearchExp(EXP_MANUAL_STEP)"
                >
                  +{{ EXP_MANUAL_STEP }}
                </button>
                <button
                  type="button"
                  class="secondary exp-test-btn"
                  :disabled="!canAdjustSelectedResearchExp"
                  @click="adjustSelectedResearchExp(-EXP_MANUAL_STEP)"
                >
                  -{{ EXP_MANUAL_STEP }}
                </button>
              </div>
            </div>
          </header>
          <div
            class="research-board"
            :style="{ '--research-level-count': String(Math.max(activeLevelNumbers.length, 1)) }"
          >
            <div class="research-board-head">
              <div
                v-for="level in activeLevelNumbers"
                :key="`research-head-${activeCategory}-${level}`"
                class="research-level-label"
                :class="{
                  active: Number(activeLevel) === Number(level),
                  locked: !isLevelUnlocked(activeCategory, level)
                }"
              >
                Lv{{ level }}
              </div>
            </div>

            <div
              v-for="(row, rowIndex) in researchBoardRows"
              :key="`research-row-${activeCategory}-${rowIndex}`"
              class="research-board-row"
            >
              <button
                v-for="cell in row"
                :key="`research-cell-${activeCategory}-${cell.level}-${rowIndex}`"
                type="button"
                class="research-grid-cell"
                :class="{
                  active: cell.active,
                  picked: cell.picked,
                  completed: cell.completed,
                  locked: !cell.unlocked,
                  empty: !cell.item
                }"
                :disabled="!cell.item || !cell.unlocked"
                @click="selectResearchCell(cell.level, cell.item)"
              >
                <template v-if="cell.item">
                  <strong>{{ cell.item.name }}</strong>
                  <div class="research-item-exp">
                    <div class="research-item-exp-bar">
                      <span
                        class="research-item-exp-fill"
                        :class="{
                          completed: cell.completed || (cell.requiredExp > 0 && cell.currentExp >= cell.requiredExp)
                        }"
                        :style="{ width: `${Math.max(0, Math.min(100, Math.round((cell.currentExp / Math.max(1, cell.requiredExp)) * 100)))}%` }"
                      />
                    </div>
                  </div>
                  <div class="research-item-desc">
                    <small>{{ cell.item.desc }}</small>
                  </div>
                </template>
                <template v-else>
                  <span class="empty-marker">-</span>
                </template>
              </button>
            </div>
          </div>
        </section>

        <aside class="research-detail-pane">
          <div class="research-detail-scroll">
            <template v-if="selectedResearchInfo">
              <h3>{{ selectedResearchInfo.name }}</h3>
              <div class="detail-meta">
                <span>{{ activeCategoryData?.name || "-" }}</span>
                <span>Lv{{ selectedResearchInfo.level }}</span>
                <span>必要ユニットLv {{ researchTreeData.levelRequirements?.[selectedResearchInfo.level] || "-" }}</span>
              </div>
              <p class="detail-desc">{{ selectedResearchInfo.desc || "-" }}</p>

              <div v-if="selectedResearchInfo.details?.length" class="detail-extra">
                <h4>詳細データ</h4>
                <ul>
                  <li
                    v-for="row in selectedResearchInfo.details"
                    :key="`detail-${selectedResearchInfo.id}-${row.key}`"
                  >
                    <span>{{ row.key }}</span>
                    <strong>{{ row.value }}</strong>
                  </li>
                </ul>
              </div>

              <div class="detail-actions">
                <button
                  type="button"
                  class="acquire-btn"
                  :disabled="!isLevelUnlocked(activeCategory, selectedResearchInfo.level) || isItemCompleted(activeCategory, selectedResearchInfo.level, selectedResearchInfo.id)"
                  @click="chooseSelectedResearch"
                >
                  研究として選択
                </button>
                <p class="small">
                  <template v-if="activeSelectedCompleted">
                    研究完了
                  </template>
                  <template v-else-if="!activeSelectedIsPicked">
                    先に「研究として選択」を押してください
                  </template>
                  <template v-else>
                    手動テストで +50 / -50 が使えます
                  </template>
                </p>
                <p class="small">
                  研究時間短縮技能: {{ researchTreeData.timeReductionSkills?.[activeCategory] || "-" }}
                </p>
              </div>
            </template>
            <template v-else>
              <div class="small">研究項目を選択してください。</div>
            </template>
          </div>
        </aside>
      </div>

      <div v-else class="research-empty">
        研究データがありません。`data/source/export/json/研究.json` を確認してください。
      </div>
    </div>
  </base-modal>
</template>

<style scoped>
.research-modal {
  /* 研究モーダル専用の文字倍率。必要に応じてここだけ調整する。 */
  --research-text-scale: 1.35;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  gap: 10px;
}

.research-modal :deep(.small) {
  font-size: calc(0.82rem * var(--research-text-scale, 1));
}

:deep(.modal-body) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.research-help {
  margin: 0;
  color: #f0e1bd;
}

.research-warning {
  border: 1px solid rgba(240, 178, 132, 0.55);
  border-radius: 8px;
  background: rgba(74, 29, 18, 0.56);
  color: #ffd9bf;
  padding: 8px 10px;
  font-size: calc(0.84rem * var(--research-text-scale, 1));
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tab-btn {
  border: 1px solid rgba(217, 184, 122, 0.45);
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(36, 27, 18, 0.66);
  color: #ebddbe;
  font-weight: 700;
  font-size: calc(0.82rem * var(--research-text-scale, 1));
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.tab-level {
  border: 1px solid rgba(203, 176, 121, 0.45);
  border-radius: 999px;
  padding: 2px 7px;
  background: rgba(26, 20, 14, 0.66);
  font-size: calc(0.72rem * var(--research-text-scale, 1));
  color: #f6e5bb;
}

.tab-btn.active {
  background: linear-gradient(160deg, rgba(134, 88, 44, 0.82), rgba(87, 55, 26, 0.9));
  border-color: rgba(239, 204, 140, 0.74);
  color: #fff5dc;
  box-shadow: 0 0 0 1px rgba(245, 221, 170, 0.28) inset;
}

.tab-icon {
    width: 39px;
    height: 35px;
    border-radius: 50%;
    object-fit: cover;
    /* border: 1px solid rgba(240, 224, 182, .5); */
    box-shadow: 0 0 6px #08050257;
}

.research-layout {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: 10px;
}

.research-board-pane,
.research-detail-pane {
  min-height: 0;
  border: 1px solid rgba(212, 180, 122, 0.38);
  border-radius: 10px;
  padding: 10px;
  background: radial-gradient(circle at 50% 0%, rgba(41, 28, 16, 0.76), rgba(19, 14, 9, 0.82));
  display: flex;
  flex-direction: column;
}

.research-pane-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  max-height: 55px;
  background: linear-gradient(120deg, rgba(36, 23, 9, 0.96), rgba(67, 39, 7, 0.96));
  border: 1px solid rgba(236, 206, 150, 0.5);
  border-radius: 8px;
  padding: 6px 8px;
}

.research-pane-title {
  display: grid;
  gap: 4px;
}

.research-pane-head h3 {
  margin: 0;
  color: #fff8e6;
  font-size: calc(1rem * var(--research-text-scale, 1));
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.62);
}

.research-head-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: nowrap;
}

.research-head-exp {
  color: #fff8e2;
  font-weight: 700;
  font-size: calc(0.78rem * var(--research-text-scale, 1));
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.45);
  white-space: nowrap;
  background: rgba(17, 12, 7, 0.36);
  border: 1px solid rgba(241, 214, 161, 0.35);
  border-radius: 999px;
  padding: 2px 7px;
}

.research-head-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}

.exp-test-btn {
  padding: 5px 9px;
  font-size: calc(0.78rem * var(--research-text-scale, 1));
  color: #fff4d7;
  border-color: rgba(226, 196, 142, 0.75);
  background: rgba(72, 52, 31, 0.94);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.55);
}

.exp-test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.research-board {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  gap: 4px;
  max-height: none;
  overflow: auto;
  padding-bottom: 2px;
}

.research-board-head,
.research-board-row {
  display: grid;
  grid-template-columns: repeat(var(--research-level-count), minmax(0, 1fr));
  gap: 4px;
}

.research-level-label {
    border: 1px solid rgba(215, 187, 132, .44);
    border-radius: 7px;
    background: #291e14c7;
    color: #f2e0ba;
    font-weight: 800;
    text-align: center;
    padding: 4px 4px;
    font-size: calc(.82rem * var(--research-text-scale, 1));
    max-height: 40px;
}

.research-level-label.active {
  border-color: rgba(245, 214, 154, 0.9);
}

.research-level-label.locked {
  opacity: 0.72;
}

.research-grid-cell {
  border: 1px solid rgba(215, 187, 132, 0.4);
  border-radius: 8px;
  background: linear-gradient(170deg, rgba(44, 32, 20, 0.86), rgba(23, 17, 11, 0.92));
  color: #f5e8c8;
  padding: 8px;
  padding-bottom: 0px;
  text-align: left;
  display: grid;
  gap: 0px;
  align-content: start;
  grid-auto-rows: min-content;
  min-height: 115px;
  position: relative;
  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.research-grid-cell:not(.active):not(.picked):not(.locked):not(.empty) {
  border-color: rgba(148, 128, 94, 0.34);
  background: linear-gradient(170deg, rgba(30, 23, 16, 0.86), rgba(17, 13, 10, 0.9));
  color: rgba(227, 211, 178, 0.95);
}

.research-grid-cell:disabled {
  cursor: not-allowed;
}

.research-grid-cell.empty {
  background: rgba(27, 20, 14, 0.52);
  border-style: dashed;
}

.research-grid-cell strong {
  color: #fff2d4;
  font-size: calc(0.84rem * var(--research-text-scale, 1));
  line-height: 1.3;
}

.research-grid-cell small {
  color: #efe0bf;
  font-size: calc(0.74rem * var(--research-text-scale, 1));
  line-height: 1.25;
  margin: 0;
  display: block;
}

.research-item-exp {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  line-height: 0;
}

.research-item-exp-bar {
  position: relative;
  display: block;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(25, 19, 14, 0.75);
  border: 1px solid rgba(203, 172, 120, 0.35);
  margin: 0;
}

.research-item-exp-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(109, 166, 125, 0.9), rgba(178, 224, 144, 0.9));
}

.research-item-exp-fill.completed {
  background: linear-gradient(90deg, rgba(96, 186, 132, 0.98), rgba(201, 255, 159, 0.98));
  box-shadow: 0 0 8px rgba(130, 222, 160, 0.42);
}

.research-item-desc {
  min-height: 44px;
  max-height: 100px;
  overflow: auto;
  margin: 1px 0 0;
  padding-right: 2px;
}

.research-item-desc small {
  display: block;
  margin: 0;
  line-height: 1.25;
}

.research-grid-cell:not(.active):not(.picked):not(.locked):not(.empty) strong {
  color: rgba(243, 229, 203, 0.95);
}

.research-grid-cell:not(.active):not(.picked):not(.locked):not(.empty) small {
  color: rgba(221, 203, 169, 0.95);
}

.research-grid-cell.active {
  border-color: rgba(246, 215, 150, 0.9);
  box-shadow:
    0 0 0 1px rgba(246, 215, 150, 0.45),
    inset 0 0 0 1px rgba(255, 244, 214, 0.18);
  background: linear-gradient(170deg, rgba(104, 72, 29, 0.95), rgba(61, 41, 17, 0.96));
}

.research-grid-cell.active strong {
  color: #fff8e9;
}

.research-grid-cell.active small {
  color: #ffeec9;
}

.research-grid-cell.picked {
  border: 3px solid rgba(138, 235, 186, 0.98);
  background: linear-gradient(170deg, rgba(28, 63, 45, 0.96), rgba(18, 45, 33, 0.97));
  box-shadow:
    0 0 0 1px rgba(206, 255, 228, 0.52),
    0 0 16px rgba(67, 191, 133, 0.35);
}

.research-grid-cell.picked::after {
  content: "研究中";
  position: absolute;
  top: 4px;
  right: 6px;
  border-radius: 999px;
  border: 1px solid rgba(211, 255, 233, 0.86);
  background: rgba(18, 67, 46, 0.96);
  color: #dfffea;
  font-size: calc(0.62rem * var(--research-text-scale, 1));
  font-weight: 800;
  line-height: 1;
  padding: 2px 7px;
  letter-spacing: 0.01em;
}

.research-grid-cell.picked strong {
  color: #ecfff5;
}

.research-grid-cell.picked small {
  color: #d7ffe9;
}

.research-grid-cell.picked .research-item-exp-bar {
  border-color: rgba(186, 255, 224, 0.58);
  background: rgba(12, 44, 32, 0.82);
}

.research-grid-cell.picked.active {
  border-color: rgba(230, 248, 174, 0.98);
  box-shadow:
    0 0 0 1px rgba(250, 255, 223, 0.58),
    0 0 16px rgba(133, 207, 106, 0.34);
}

.research-grid-cell.completed {
  border-color: rgba(155, 218, 168, 0.95);
  box-shadow: 0 0 0 1px rgba(118, 195, 140, 0.4) inset;
}

.research-grid-cell.locked {
  opacity: 0.75;
}

.empty-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 40px;
  color: rgba(230, 215, 183, 0.8);
}

.research-detail-pane h3 {
  margin: 0 0 6px;
  color: #ffeec8;
}

.research-detail-pane {
  overflow: hidden;
}

.research-detail-scroll {
  flex: 1 1 auto;
  min-height: 0;
  max-height: 100%;
  overflow: auto;
  padding-right: 2px;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.detail-meta span {
  border: 1px solid rgba(217, 184, 122, 0.4);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: calc(0.78rem * var(--research-text-scale, 1));
  color: #f0dfbc;
  background: rgba(32, 23, 15, 0.55);
}

.detail-desc {
  margin: 0;
  color: #fff1d2;
  line-height: 1.45;
}

.detail-extra {
  margin-top: 10px;
}

.detail-extra h4 {
  margin: 0 0 6px;
  color: #f3dfb1;
  font-size: calc(0.9rem * var(--research-text-scale, 1));
}

.detail-extra ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 5px;
}

.detail-extra li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid rgba(216, 183, 124, 0.22);
  border-radius: 8px;
  padding: 4px 7px;
  font-size: calc(0.82rem * var(--research-text-scale, 1));
  color: #f3e5c7;
}

.detail-extra li strong {
  color: #fff0d0;
}

.detail-actions {
  margin-top: 10px;
  display: grid;
  gap: 6px;
}

.detail-actions .small {
  color: #f5e7c4;
}

.acquire-btn {
  border: 1px solid rgba(234, 203, 145, 0.75);
  border-radius: 8px;
  padding: 8px 10px;
  background: linear-gradient(160deg, rgba(145, 93, 44, 0.9), rgba(92, 59, 28, 0.95));
  color: #fff4db;
  font-weight: 700;
}

.acquire-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.research-empty {
  color: #ead6a7;
  border: 1px dashed rgba(216, 183, 124, 0.45);
  border-radius: 10px;
  padding: 12px;
}
</style>
