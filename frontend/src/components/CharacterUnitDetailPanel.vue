<script setup>
import { computed, ref, watch } from "vue";
import equipmentDb from "../../../data/source/export/json/装備.json";
import { DEFAULT_ICON_NAME, getIconSrcByName, listIconOptions, resolveIconName } from "../lib/icon-library.js";
import SkillAcquiredTable from "./SkillAcquiredTable.vue";

const props = defineProps({
  unit: { type: Object, default: null },
  compact: { type: Boolean, default: false }
});

const emit = defineEmits([
  "update-unit-icon",
  "update-unit-equipment"
]);

const STATUS_FIELDS = ["HP", "攻撃", "防御", "魔力", "精神", "速度", "命中", "SIZ"];
const SKILL_FIELDS = [
  "指揮",
  "威圧",
  "看破",
  "早業",
  "技術",
  "隠密",
  "索敵",
  "農業",
  "林業",
  "漁業",
  "工業",
  "統治",
  "交渉",
  "魔法技術",
  "信仰"
];
const RESISTANCE_FIELDS = [
  "物理耐性",
  "魔法耐性",
  "炎耐性",
  "氷耐性",
  "雷耐性",
  "毒耐性",
  "光耐性",
  "闇耐性",
  "精神耐性",
  "怯み耐性",
  "出血耐性",
  "拘束耐性",
  "幻覚耐性",
  "Cr率耐性",
  "Cr威力耐性"
];
const EQUIPMENT_RARITY_OPTIONS = [
  { key: "common", label: "コモン" },
  { key: "uncommon", label: "アンコモン" },
  { key: "rare", label: "レア" },
  { key: "epic", label: "エピック" },
  { key: "legendary", label: "レジェンダリー" }
];
const EQUIPMENT_RARITY_ALIAS_MAP = {
  コモン: "common",
  アンコモン: "uncommon",
  レア: "rare",
  エピック: "epic",
  レジェンダリー: "legendary"
};
const EQUIPMENT_SLOT_KEYS = ["武器1", "武器2", "頭", "体", "足", "装飾1", "装飾2"];
const WEAPON_EQUIPMENT_NAMES = ["短剣", "剣", "長剣", "槍", "斧", "戦槌", "棍棒", "弓", "銃", "杖"];
const SHIELD_EQUIPMENT_NAMES = ["盾", "大盾"];

const iconOptions = computed(() => listIconOptions());
const equipmentRows = computed(() => {
  if (!Array.isArray(equipmentDb)) return [];
  return equipmentDb
    .filter(row => nonEmptyText(row?.装備名))
    .sort((a, b) => nonEmptyText(a?.装備名).localeCompare(nonEmptyText(b?.装備名), "ja"));
});

const equipmentEditBySlot = ref({});
const iconDraft = ref(DEFAULT_ICON_NAME);

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function toSafeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function statusValue(unit, key) {
  const raw = Number(unit?.status?.[key]);
  if (!Number.isFinite(raw)) return "-";
  return Math.round(raw);
}

function signedValueText(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  const rounded = Math.round(num);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function skillValue(unit, key) {
  const raw = Number(unit?.skillLevels?.[key]);
  if (Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  return 0;
}

function resistanceValue(unit, key) {
  const raw = Number(unit?.resistances?.[key]);
  if (Number.isFinite(raw)) return Math.round(raw);
  return null;
}

function normalizeEquipmentRarity(value) {
  const text = nonEmptyText(value);
  if (!text) return "common";
  const lower = text.toLowerCase();
  if (EQUIPMENT_RARITY_OPTIONS.some(row => row.key === lower)) return lower;
  return EQUIPMENT_RARITY_ALIAS_MAP[text] || "common";
}

function equipmentRarityLabel(value) {
  const key = normalizeEquipmentRarity(value);
  return EQUIPMENT_RARITY_OPTIONS.find(row => row.key === key)?.label || "コモン";
}

function normalizeEquipmentSlotKey(value) {
  const text = nonEmptyText(value);
  if (!text) return "";
  if (EQUIPMENT_SLOT_KEYS.includes(text)) return text;
  if (text === "武器") return "武器1";
  return "";
}

function resolveEquipmentSlotCandidates(row) {
  const explicitSlot = normalizeEquipmentSlotKey(row?.装備部位);
  if (explicitSlot === "武器1") return ["武器1", "武器2"];
  if (explicitSlot) return [explicitSlot];
  const name = nonEmptyText(row?.装備名);
  if (SHIELD_EQUIPMENT_NAMES.includes(name)) return ["武器2"];
  if (WEAPON_EQUIPMENT_NAMES.includes(name)) return ["武器1", "武器2"];
  if (/(兜|ヘルム|帽|頭)/.test(name)) return ["頭"];
  if (/(鎧|ローブ|服|法衣|胸当|体)/.test(name)) return ["体"];
  if (/(靴|ブーツ|足)/.test(name)) return ["足"];
  if (/(指輪|リング|首飾|首輪|護符|ペンダント|装飾)/.test(name)) return ["装飾1", "装飾2"];
  return ["武器1"];
}

function equipmentRowMatchesSlot(row, slotKey) {
  const key = nonEmptyText(slotKey);
  if (!key) return false;
  const slots = resolveEquipmentSlotCandidates(row);
  return slots.includes(key);
}

function resolveUnitEquipmentSlots(unit) {
  const source = unit?.equipmentSlots;
  const out = {};
  for (const key of EQUIPMENT_SLOT_KEYS) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = !!source[key];
    } else {
      out[key] = true;
    }
  }
  return out;
}

function normalizeEquipmentList(unit) {
  const source = Array.isArray(unit?.equipment) ? unit.equipment : [];
  return source
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const slot = normalizeEquipmentSlotKey(item?.slot) || EQUIPMENT_SLOT_KEYS[index] || EQUIPMENT_SLOT_KEYS[0];
      return {
        ...item,
        slot
      };
    })
    .filter(Boolean);
}

function unitEquipmentAtSlot(unit, slotKey) {
  return normalizeEquipmentList(unit).find(item => item.slot === slotKey) || null;
}

function equipmentOptionsForSlot(slotKey) {
  return equipmentRows.value.filter(row => equipmentRowMatchesSlot(row, slotKey));
}

function unitIconName(unit) {
  return resolveIconName(unit?.iconName, DEFAULT_ICON_NAME);
}

function unitIconSrc(unit) {
  return getIconSrcByName(unitIconName(unit), DEFAULT_ICON_NAME);
}

function initDrafts(unit) {
  if (!unit) return;
  iconDraft.value = unitIconName(unit);
  const slots = resolveUnitEquipmentSlots(unit);
  const next = {};
  for (const slotKey of EQUIPMENT_SLOT_KEYS) {
    const options = equipmentOptionsForSlot(slotKey);
    const defaultName = nonEmptyText(options[0]?.装備名);
    const item = unitEquipmentAtSlot(unit, slotKey);
    next[slotKey] = {
      equipmentName: slots[slotKey] === false ? "" : (nonEmptyText(item?.name) || defaultName),
      rarity: normalizeEquipmentRarity(item?.quality || item?.qualityLabel)
    };
  }
  equipmentEditBySlot.value = next;
}

function slotDraft(slotKey) {
  const draft = equipmentEditBySlot.value?.[slotKey];
  if (draft && nonEmptyText(draft.equipmentName)) {
    return {
      equipmentName: draft.equipmentName,
      rarity: normalizeEquipmentRarity(draft.rarity)
    };
  }
  const unit = props.unit;
  const currentItem = unitEquipmentAtSlot(unit, slotKey);
  const options = equipmentOptionsForSlot(slotKey);
  return {
    equipmentName: nonEmptyText(currentItem?.name) || nonEmptyText(options[0]?.装備名),
    rarity: normalizeEquipmentRarity(currentItem?.quality || currentItem?.qualityLabel)
  };
}

function updateSlotDraft(slotKey, patch) {
  const current = slotDraft(slotKey);
  equipmentEditBySlot.value = {
    ...equipmentEditBySlot.value,
    [slotKey]: {
      ...current,
      ...patch
    }
  };
}

function applyEquipmentChange(slot) {
  const unitId = nonEmptyText(props.unit?.id);
  if (!unitId || !slot?.enabled) return;
  const draft = slotDraft(slot.key);
  const equipmentName = nonEmptyText(draft.equipmentName);
  if (!equipmentName) return;
  emit("update-unit-equipment", {
    unitId,
    slotIndex: slot.index,
    slotKey: slot.key,
    equipmentName,
    rarity: normalizeEquipmentRarity(draft.rarity)
  });
}

function applyIconChange() {
  const unitId = nonEmptyText(props.unit?.id);
  if (!unitId) return;
  emit("update-unit-icon", {
    unitId,
    iconName: resolveIconName(iconDraft.value, DEFAULT_ICON_NAME)
  });
}

const skillRows = computed(() => {
  const unit = props.unit;
  if (!unit) return [];
  return SKILL_FIELDS.map(key => ({
    key,
    value: skillValue(unit, key)
  }));
});

const resistanceRows = computed(() => {
  const unit = props.unit;
  if (!unit) return [];
  return RESISTANCE_FIELDS.map(key => ({
    key,
    value: resistanceValue(unit, key)
  })).filter(row => row.value !== null && row.value !== 0);
});

const acquiredSkills = computed(() => {
  const unit = props.unit;
  if (!unit || !Array.isArray(unit?.skills)) return [];
  return unit.skills.map(name => nonEmptyText(name)).filter(Boolean);
});

const equipmentSlots = computed(() => {
  const unit = props.unit;
  if (!unit) return [];
  const slots = resolveUnitEquipmentSlots(unit);
  return EQUIPMENT_SLOT_KEYS.map((slotKey, index) => ({
    index,
    key: slotKey,
    label: slotKey,
    enabled: slots[slotKey] !== false,
    item: unitEquipmentAtSlot(unit, slotKey),
    options: equipmentOptionsForSlot(slotKey)
  }));
});

watch(
  [() => props.unit, equipmentRows],
  ([unit]) => {
    if (!unit) return;
    initDrafts(unit);
  },
  { immediate: true }
);
</script>

<template>
  <section v-if="unit" class="detail-root" :class="{ compact }">
    <section class="char-block">
      <h4>アイコン</h4>
      <div class="icon-edit-row">
        <img :src="unitIconSrc(unit)" :alt="`${unit.name} アイコン`" class="char-unit-icon-preview" :class="{ mini: compact }" />
        <select :value="iconDraft" @change="iconDraft = $event.target.value">
          <option v-for="row in iconOptions" :key="`icon-opt-${unit.id}-${row.name}`" :value="row.name">
            {{ row.name }}
          </option>
        </select>
        <button type="button" class="secondary" :disabled="!iconOptions.length" @click="applyIconChange">
          アイコン変更
        </button>
      </div>
    </section>

    <section class="char-block">
      <h4>ステータス</h4>
      <div class="char-status-grid" :class="{ mini: compact }">
        <div v-for="key in STATUS_FIELDS" :key="`status-${unit.id}-${key}`" class="char-status-chip">
          <span>{{ key }}</span>
          <strong>{{ statusValue(unit, key) }}</strong>
        </div>
      </div>
    </section>

    <section class="char-block">
      <h4>技能</h4>
      <div v-if="skillRows.length" class="char-skill-grid">
        <div v-for="row in skillRows" :key="`skill-${unit.id}-${row.key}`" class="char-skill-chip">
          <span>{{ row.key }}</span>
          <strong>Lv{{ row.value }}</strong>
        </div>
      </div>
      <div v-else class="small">技能データなし</div>
      <skill-acquired-table
        :skill-names="acquiredSkills"
        :show-title="true"
        title="取得スキル詳細"
        empty-text="取得スキルなし"
        :compact="compact"
      />
    </section>

    <section class="char-block">
      <h4>耐性</h4>
      <div v-if="resistanceRows.length" class="char-resist-grid">
        <div v-for="row in resistanceRows" :key="`resist-${unit.id}-${row.key}`" class="char-resist-chip">
          <span>{{ row.key }}</span>
          <strong>{{ signedValueText(row.value) }}</strong>
        </div>
      </div>
      <div v-else class="small">耐性データなし</div>
    </section>

    <section class="char-block">
      <h4>装備</h4>
      <div v-if="equipmentSlots.length" class="equipment-edit-list">
        <article
          v-for="slot in equipmentSlots"
          :key="`equip-slot-${unit.id}-${slot.index}`"
          class="equipment-edit-item"
          :class="{ disabled: !slot.enabled }"
        >
          <div class="line">
            <strong>{{ slot.label }}</strong>
            <span>
              <template v-if="!slot.enabled">× 装備不可</template>
              <template v-else>
                {{ slot.item?.name || "-" }}
                <template v-if="slot.item">[{{ slot.item?.qualityLabel || equipmentRarityLabel(slot.item?.quality) }}]</template>
              </template>
            </span>
          </div>
          <div class="small" v-if="slot.item">
            威力 {{ slot.item.power ?? "-" }} / ガード {{ slot.item.guard ?? "-" }} / Cr率 {{ slot.item.criticalRate ?? "-" }} / Cr威力 {{ slot.item.criticalPower ?? "-" }}
            <span> / 価格(仮): 金{{ slot.item.priceGold ?? "-" }}</span>
            <span v-if="slot.item.requiredMaterial"> / 必要素材: {{ slot.item.requiredMaterial }}</span>
          </div>
          <div v-if="slot.enabled" class="equipment-edit-row">
            <select
              :value="slotDraft(slot.key).equipmentName"
              @change="updateSlotDraft(slot.key, { equipmentName: $event.target.value })"
            >
              <option
                v-for="row in slot.options"
                :key="`equip-opt-${unit.id}-${slot.key}-${row.装備名}`"
                :value="row.装備名"
              >
                {{ row.装備名 }}
              </option>
            </select>
            <select
              :value="slotDraft(slot.key).rarity"
              @change="updateSlotDraft(slot.key, { rarity: $event.target.value })"
            >
              <option
                v-for="row in EQUIPMENT_RARITY_OPTIONS"
                :key="`rarity-opt-${unit.id}-${slot.key}-${row.key}`"
                :value="row.key"
              >
                {{ row.label }}
              </option>
            </select>
            <button type="button" class="secondary" :disabled="!slot.options.length" @click="applyEquipmentChange(slot)">装備変更</button>
          </div>
        </article>
      </div>
      <div v-else class="small">装備データなし</div>
    </section>
  </section>
</template>

<style scoped>
.detail-root {
  display: grid;
  gap: 10px;
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

.icon-edit-row {
  display: grid;
  grid-template-columns: auto minmax(140px, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.icon-edit-row select,
.equipment-edit-row select {
  width: 100%;
  border: 1px solid rgba(170, 140, 94, 0.86);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  color: #2d2418;
  padding: 6px 8px;
  font-size: 0.79rem;
}

.char-unit-icon-preview {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid rgba(189, 160, 119, 0.74);
  background: rgba(255, 255, 255, 0.65);
}

.char-unit-icon-preview.mini {
  width: 30px;
  height: 30px;
  border-radius: 6px;
}

.char-status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.char-status-grid.mini {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.char-status-chip {
  border: 1px solid rgba(206, 180, 135, 0.62);
  border-radius: 7px;
  padding: 6px 8px;
  display: flex;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.82);
}

.char-skill-grid,
.char-resist-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.char-skill-chip,
.char-resist-chip {
  border: 1px solid rgba(206, 180, 135, 0.62);
  border-radius: 7px;
  padding: 6px 8px;
  display: flex;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.82);
  font-size: 0.79rem;
}

.equipment-edit-list {
  display: grid;
  gap: 7px;
}

.equipment-edit-item {
  border: 1px solid rgba(206, 180, 135, 0.62);
  border-radius: 7px;
  padding: 7px 8px;
  background: rgba(255, 255, 255, 0.82);
  display: grid;
  gap: 6px;
}

.equipment-edit-item.disabled {
  opacity: 0.72;
  background: rgba(240, 236, 226, 0.72);
}

.line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.equipment-edit-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(120px, 150px) auto;
  gap: 6px;
  align-items: center;
}

@media (max-width: 900px) {
  .char-status-grid,
  .char-status-grid.mini {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .char-skill-grid,
  .char-resist-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .equipment-edit-row,
  .icon-edit-row {
    grid-template-columns: 1fr;
  }
}
</style>
