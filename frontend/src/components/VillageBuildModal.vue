<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { getIconSrcByName } from "../lib/icon-library.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  villageScaleLabel: { type: String, default: "-" },
  researchRows: {
    type: Array,
    default: () => []
  },
  remainingSlots: { type: Number, default: 0 },
  capacitySlots: { type: Number, default: 0 },
  availableDefs: {
    type: Array,
    default: () => []
  },
  selectedDef: {
    type: Object,
    default: null
  },
  selectedAvailability: {
    type: Object,
    default: null
  },
  selectedPreviewStyle: {
    type: Object,
    default: () => ({})
  },
  builtListText: { type: String, default: "なし" }
});

const emit = defineEmits(["close", "apply", "select"]);
const isPerfTestOn = import.meta.env.VITE_PERF_TEST === "1";
const perfOpenToPaintMs = ref(0);
const perfMaterialComputeMs = ref(0);
const perfMaterialRowCount = ref(0);

const MATERIAL_GROUP_DEFS = [
  { key: "woodStone", label: "木材&石", keys: ["木材", "黒木", "特木", "石材"] },
  { key: "metal", label: "金属", keys: ["鉄", "銀鉄", "青金鋼", "赤黒鋼"] },
  { key: "precious", label: "貴金属", keys: ["金", "銀", "宝石"] }
];
const REQUIREMENT_ICON_NAME_MAP = {
  鍛冶Lv: "鍛冶",
  魔法Lv: "魔法",
  信仰Lv: "信仰",
  軍事Lv: "兵士",
  経済Lv: "金"
};

function toSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatAmount(value) {
  const safe = Math.max(0, toSafeNumber(value, 0));
  if (Math.abs(safe - Math.round(safe)) < 0.0001) return String(Math.round(safe));
  return safe.toFixed(1);
}

const groupedMaterialColumns = computed(() => {
  const computeStart = isPerfTestOn ? performance.now() : 0;
  const materialBag = props.selectedAvailability?.materialStatus?.materialBag || {};
  const costBag = props.selectedAvailability?.materialStatus?.costBag || {};
  const columns = MATERIAL_GROUP_DEFS.map(group => {
    const rows = group.keys
      .map(resourceKey => {
        const have = toSafeNumber(materialBag?.[resourceKey], 0);
        const need = toSafeNumber(costBag?.[resourceKey], 0);
        return {
          key: resourceKey,
          label: resourceKey,
          iconSrc: getIconSrcByName(resourceKey, resourceKey),
          have,
          need,
          valueText: `${formatAmount(have)}/${formatAmount(need)}`,
          shortage: have < need
        };
      })
      .filter(row => row.have > 0 || row.need > 0);
    return {
      ...group,
      rows
    };
  });
  if (isPerfTestOn) {
    perfMaterialComputeMs.value = performance.now() - computeStart;
    perfMaterialRowCount.value = columns.reduce((sum, group) => sum + group.rows.length, 0);
  }
  return columns;
});

const requiredResearchRows = computed(() => {
  const requirements = Array.isArray(props.selectedDef?.requirements) ? props.selectedDef.requirements : [];
  return requirements
    .map(row => {
      const key = String(row?.label || row?.field || row?.abilityKey || "").trim();
      const requiredLevel = Math.max(0, toSafeNumber(row?.requiredLevel, 0));
      if (!key || requiredLevel <= 0) return null;
      return {
        key,
        iconSrc: getIconSrcByName(REQUIREMENT_ICON_NAME_MAP[key] || key.replace(/Lv$/u, ""), "本"),
        requiredLevel
      };
    })
    .filter(Boolean);
});

function handleSelect(defKey) {
  emit("select", String(defKey || ""));
}

function formatPerfMs(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${num.toFixed(2)}ms`;
}

watch(
  () => props.show,
  async show => {
    if (!isPerfTestOn || !show) return;
    const started = performance.now();
    await nextTick();
    await new Promise(resolve => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });
    perfOpenToPaintMs.value = performance.now() - started;
  }
);
</script>

<template>
  <div v-if="props.show" class="village-build-backdrop" @click.self="emit('close')">
    <div class="village-build-shell">
      <h3>施設建設</h3>
      <div class="village-build-header">
        <div class="village-build-head-stat">
          <span>都市規模</span>
          <strong>{{ props.villageScaleLabel }}</strong>
        </div>
        <div class="village-build-head-stat village-build-head-stat-wide">
          <span>研究Lv</span>
          <div class="village-build-research-icons">
            <div v-for="row in props.researchRows" :key="`research-${row.key}`" class="village-build-research-chip">
              <img :src="row.iconSrc" :alt="`${row.label} アイコン`" class="village-build-research-icon">
              <strong>{{ row.level }}</strong>
            </div>
          </div>
        </div>
        <div class="village-build-head-stat">
          <span>残り土地</span>
          <strong>{{ props.remainingSlots }} / {{ props.capacitySlots }}</strong>
        </div>
      </div>
      <div v-if="isPerfTestOn" class="small village-build-perf">
        計測(open→paint): {{ formatPerfMs(perfOpenToPaintMs) }} / 資材計算: {{ formatPerfMs(perfMaterialComputeMs) }} / 資材行数: {{ perfMaterialRowCount }}
      </div>

      <div v-if="props.availableDefs.length" class="village-build-layout">
        <div class="village-build-list-pane">
          <div class="village-build-list">
            <button
              v-for="def in props.availableDefs"
              :key="`build-${def.key}`"
              type="button"
              class="village-build-item"
              :class="{ active: props.selectedDef?.key === def.key, unavailable: !def.availability?.selectable }"
              @click="handleSelect(def.key)"
            >
              <span class="village-build-item-main">
                <img v-if="def.iconSrc" :src="def.iconSrc" :alt="`${def.name} アイコン`" class="village-build-item-icon">
                <span v-else class="village-build-item-icon-fallback">{{ def.name.slice(0, 1) }}</span>
                <span class="village-build-item-text">
                  <strong>{{ def.name }}</strong>
                  <small>土地{{ def.availability?.slotCost || def.buildSlotValue }} {{ def.availability?.statusText || "条件未達" }}</small>
                </span>
              </span>
              
            </button>
          </div>
        </div>

        <div v-if="props.selectedDef" class="village-build-detail-pane">
          <div class="village-build-detail-body" :style="props.selectedPreviewStyle">
            <div class="village-build-line">
              <strong>{{ props.selectedDef.name }}</strong>
              <span class="small village-build-list-status" :class="{ ok: props.selectedAvailability?.selectable }">
                {{ props.selectedAvailability?.statusText || "条件未達" }}
              </span>
            </div>
            <div class="small">研究Lv</div>
            <div class="village-build-research-icons village-build-research-icons-detail">
              <div v-for="row in requiredResearchRows" :key="`detail-required-research-${row.key}`" class="village-build-research-chip">
                <img :src="row.iconSrc" :alt="`${row.key} アイコン`" class="village-build-research-icon">
                <strong>{{ row.requiredLevel }}</strong>
              </div>
              <div v-if="!requiredResearchRows.length" class="small">なし</div>
            </div>
            <div class="small">土地消費: {{ props.selectedAvailability?.slotCost || props.selectedDef.buildSlotValue }} / 残り土地 {{ props.selectedAvailability?.remainingSlots ?? props.remainingSlots }}</div>
            <div class="village-build-detail-cost">
              <div class="small"><strong>必要資材</strong></div>
              <div class="village-build-cost-columns">
                <div
                  v-for="group in groupedMaterialColumns"
                  :key="`cost-column-${group.key}`"
                  class="village-build-cost-column"
                >
                  <div class="village-build-cost-column-title">{{ group.label }}</div>
                  <div class="village-build-cost-list">
                    <div
                      v-for="row in group.rows"
                      :key="`cost-row-${group.key}-${row.key}`"
                      class="village-build-cost-entry"
                      :class="{ shortage: row.shortage }"
                    >
                      <img :src="row.iconSrc" :alt="`${row.label} アイコン`" class="village-build-cost-icon">
                      <span class="village-build-cost-value">{{ row.label }} {{ row.valueText }}</span>
                    </div>
                    <div v-if="!group.rows.length" class="village-build-cost-empty">-</div>
                  </div>
                </div>
              </div>
            </div>
            <p class="village-build-detail-desc">{{ props.selectedDef.description }}</p>
          </div>
        </div>
      </div>
      <div v-else class="small">表示できる未建設施設はありません。</div>

      <div v-if="props.selectedDef" class="small build-selected-info">
        建設済み: {{ props.builtListText }}
      </div>

      <div class="setting-actions">
        <button type="button" class="secondary" @click="emit('close')">閉じる</button>
        <button type="button" class="secondary" :disabled="!props.selectedAvailability?.selectable" @click="emit('apply')">この施設を建設</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./VillageBuildModal.css"></style>
