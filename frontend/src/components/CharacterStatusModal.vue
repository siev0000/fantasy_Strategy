<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";

const props = defineProps({
  show: { type: Boolean, default: false },
  units: { type: Array, default: () => [] },
  village: { type: Object, default: null },
  ruleText: { type: String, default: "" },
  defaultSelectedId: { type: String, default: "" }
});

const emit = defineEmits(["close"]);

const STATUS_FIELDS = ["HP", "攻撃", "防御", "魔力", "精神", "速度", "命中", "SIZ"];
const activeUnitId = ref("");
const characterIconSrc = new URL("../../../assets/images/攻撃手段/肉体.webp", import.meta.url).href;

const unitList = computed(() => {
  if (!Array.isArray(props.units)) return [];
  return props.units;
});

const activeUnit = computed(() => {
  if (!unitList.value.length) return null;
  const byId = unitList.value.find(unit => String(unit?.id || "") === activeUnitId.value);
  return byId || unitList.value[0];
});

watch(
  [() => props.show, unitList, () => props.defaultSelectedId],
  ([isOpen, units, selectedId]) => {
    if (!isOpen) return;
    const preferred = String(selectedId || "").trim();
    if (preferred && units.some(unit => String(unit?.id || "") === preferred)) {
      activeUnitId.value = preferred;
      return;
    }
    activeUnitId.value = units.length ? String(units[0]?.id || "") : "";
  },
  { immediate: true }
);

function statusValue(unit, key) {
  const raw = Number(unit?.status?.[key]);
  if (!Number.isFinite(raw)) return "-";
  return Math.round(raw);
}

function selectUnit(id) {
  activeUnitId.value = String(id || "");
}
</script>

<template>
  <base-modal :show="show" title="自キャラステータス" :wide="true" @close="emit('close')">
    <div class="char-modal-head">
      <img :src="characterIconSrc" alt="自キャラ" class="char-head-icon" />
      <div class="small">マップで生成された自キャラの一覧と詳細です。</div>
    </div>

    <div v-if="unitList.length" class="char-layout">
      <aside class="char-list">
        <div v-if="village" class="small char-note">
          初期村: {{ village.name }} ({{ village.x }}, {{ village.y }})
        </div>
        <div v-if="ruleText" class="small char-note">{{ ruleText }}</div>
        <button
          v-for="unit in unitList"
          :key="unit.id"
          type="button"
          class="char-list-item"
          :class="{ active: activeUnit?.id === unit.id }"
          @click="selectUnit(unit.id)"
        >
          <div class="char-list-line">
            <strong>{{ unit.name }}</strong>
            <span>Lv{{ unit.level || "-" }}</span>
          </div>
          <div class="small">
            {{ unit.race || "-" }} / {{ unit.className || "-" }}
          </div>
          <div class="small">座標: ({{ unit.x }}, {{ unit.y }})</div>
        </button>
      </aside>

      <section v-if="activeUnit" class="char-detail">
        <header class="char-title">
          <h3>{{ activeUnit.name }}</h3>
          <div class="small">
            {{ activeUnit.unitType || "-" }} / Lv{{ activeUnit.level || "-" }} / {{ activeUnit.race || "-" }} / {{ activeUnit.className || "-" }}
          </div>
          <div class="small">位置: ({{ activeUnit.x }}, {{ activeUnit.y }}) / 移動: {{ activeUnit.moveRange || "-" }} / 索敵: {{ activeUnit.scoutRange || "-" }}</div>
        </header>

        <section class="char-block">
          <h4>ステータス</h4>
          <div class="char-status-grid">
            <div v-for="key in STATUS_FIELDS" :key="key" class="char-status-chip">
              <span>{{ key }}</span>
              <strong>{{ statusValue(activeUnit, key) }}</strong>
            </div>
          </div>
        </section>

        <section class="char-block">
          <h4>装備</h4>
          <div v-if="activeUnit.equipment?.length" class="char-equipment-list">
            <div v-for="(equip, idx) in activeUnit.equipment" :key="`${activeUnit.id}-equip-${idx}`" class="char-equipment-item">
              <strong>{{ equip.name }}</strong>
              <span class="small">品質: {{ equip.quality || "-" }} / 攻撃補正: {{ equip.atkBonus ?? 0 }} / 防御補正: {{ equip.defBonus ?? 0 }}</span>
            </div>
          </div>
          <div v-else class="small">装備なし</div>
        </section>

        <section class="char-block">
          <h4>成長計算</h4>
          <div class="small">
            種族Lv: {{ activeUnit.growthRule?.raceLevels ?? "-" }} / クラスLv: {{ activeUnit.growthRule?.classLevels ?? "-" }}
            <span v-if="(activeUnit.growthRule?.classBonus ?? 0) > 0">
              (人族補正 +{{ activeUnit.growthRule?.classBonus }})
            </span>
          </div>
        </section>
      </section>
    </div>

    <div v-else class="char-empty">
      自キャラデータがありません。地形を生成すると初期キャラが作成されます。
    </div>
  </base-modal>
</template>

<style scoped>
.char-modal-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.char-head-icon {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid rgba(189, 160, 119, 0.65);
  background: rgba(255, 255, 255, 0.55);
}

.char-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 12px;
}

.char-list {
  border: 1px solid rgba(206, 180, 135, 0.78);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  padding: 8px;
  display: grid;
  gap: 7px;
  align-content: start;
}

.char-note {
  border: 1px solid rgba(201, 173, 129, 0.62);
  border-radius: 8px;
  padding: 6px 8px;
  background: rgba(247, 240, 228, 0.9);
}

.char-list-item {
  width: 100%;
  border: 1px solid rgba(197, 168, 124, 0.8);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  color: #2d2418;
  padding: 8px;
  text-align: left;
}

.char-list-item.active {
  border-color: rgba(111, 84, 47, 0.9);
  background: linear-gradient(165deg, rgba(238, 218, 181, 0.98), rgba(228, 202, 160, 0.96));
}

.char-list-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.char-detail {
  border: 1px solid rgba(206, 180, 135, 0.78);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  padding: 10px;
  display: grid;
  gap: 10px;
}

.char-title h3 {
  margin: 0;
}

.char-block {
  border: 1px solid rgba(206, 180, 135, 0.68);
  border-radius: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.72);
}

.char-block h4 {
  margin: 0 0 7px;
  font-size: 0.9rem;
}

.char-status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.char-status-chip {
  border: 1px solid rgba(206, 180, 135, 0.62);
  border-radius: 7px;
  padding: 6px 8px;
  display: flex;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.82);
}

.char-equipment-list {
  display: grid;
  gap: 6px;
}

.char-equipment-item {
  border: 1px solid rgba(206, 180, 135, 0.54);
  border-radius: 7px;
  padding: 6px 8px;
  display: grid;
  gap: 3px;
  background: rgba(255, 255, 255, 0.82);
}

.char-empty {
  border: 1px dashed rgba(189, 160, 119, 0.84);
  border-radius: 9px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.65);
}

@media (max-width: 900px) {
  .char-layout {
    grid-template-columns: 1fr;
  }

  .char-status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
