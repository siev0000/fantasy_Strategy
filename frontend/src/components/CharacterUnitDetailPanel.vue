<script setup>
import { computed, ref, watch } from "vue";
import equipmentDb from "../../../data/source/export/json/装備.json";
import { DEFAULT_ICON_NAME, getIconSrcByName, hasIconName, listIconOptions, resolveIconName } from "../lib/icon-library.js";
import SkillAcquiredTable from "./SkillAcquiredTable.vue";

const props = defineProps({
  unit: { type: Object, default: null },
  compact: { type: Boolean, default: false },
  hideIconEditor: { type: Boolean, default: false }
});

const emit = defineEmits([
  "update-unit-icon",
  "update-unit-equipment"
]);

const STATUS_FIELDS = ["HP", "攻撃", "魔力", "命中", "SIZ", "防御", "精神", "速度"];
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
const LEFT_PANEL_TABS = [
  { key: "status", label: "ステータス" },
  { key: "equipment", label: "装備" }
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
const iconPickerOpen = ref(false);
const leftPanelView = ref("status");

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

function resolveSkillFieldKeys(field) {
  if (!field) return [];
  if (typeof field === "string") return [field];
  const keys = [nonEmptyText(field?.key), ...(Array.isArray(field?.aliases) ? field.aliases.map(nonEmptyText) : [])]
    .filter(Boolean);
  return [...new Set(keys)];
}

function skillValue(unit, field) {
  const keys = resolveSkillFieldKeys(field);
  for (const key of keys) {
    const raw = Number(unit?.skillLevels?.[key]);
    if (Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  }
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
  const name = nonEmptyText(unit?.subIconName);
  if (name && hasIconName(name)) return name;
  return "";
}

function unitIconSrc(unit) {
  const direct = nonEmptyText(unit?.subIconSrc);
  if (direct) return direct;
  const iconName = unitIconName(unit);
  if (iconName) return getIconSrcByName(iconName, iconName);
  return "";
}

function unitIconGlyph(unit) {
  const race = nonEmptyText(unit?.race);
  if (race) return Array.from(race)[0] || "?";
  const className = nonEmptyText(unit?.className);
  if (className) return Array.from(className)[0] || "?";
  const name = nonEmptyText(unit?.name);
  if (name) return Array.from(name)[0] || "?";
  return "?";
}

function initDrafts(unit) {
  if (!unit) return;
  iconDraft.value = resolveIconName(unit?.subIconName, DEFAULT_ICON_NAME);
  iconPickerOpen.value = false;
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

function applyIconChange(iconNameOverride = "") {
  const unitId = nonEmptyText(props.unit?.id);
  if (!unitId) return;
  const nextIconName = resolveIconName(iconNameOverride || iconDraft.value, DEFAULT_ICON_NAME);
  iconDraft.value = nextIconName;
  emit("update-unit-icon", {
    unitId,
    iconName: nextIconName
  });
  iconPickerOpen.value = false;
}

function toggleIconPicker() {
  iconPickerOpen.value = !iconPickerOpen.value;
}

function applyIconByPick(iconName) {
  applyIconChange(iconName);
}

function detailRootStyle(unit) {
  const src = unitIconSrc(unit);
  if (!src) return {};
  return { "--unit-sub-icon-image": `url("${src}")` };
}

const skillRows = computed(() => {
  const unit = props.unit;
  if (!unit) return [];
  return SKILL_FIELD_DEFS.map(field => ({
    key: field.key,
    label: field.label || field.key,
    value: skillValue(unit, field)
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
    leftPanelView.value = "status";
  },
  { immediate: true }
);
</script>

<template>
  <section
    v-if="unit"
    class="detail-root"
    :class="{ compact, 'with-sub-icon': !!unitIconSrc(unit) }"
    :style="detailRootStyle(unit)"
  >
    <template v-if="!hideIconEditor">
      <header class="detail-root-head">
        <h4>詳細</h4>
        <button
          type="button"
          class="icon-header-button"
          :title="iconPickerOpen ? 'アイコン一覧を閉じる' : 'サブアイコン変更'"
          :aria-label="iconPickerOpen ? 'アイコン一覧を閉じる' : 'サブアイコン変更'"
          :disabled="!iconOptions.length"
          @click="toggleIconPicker"
        >
          <img v-if="unitIconSrc(unit)" :src="unitIconSrc(unit)" :alt="`${unit.name} アイコン`" class="char-unit-icon-preview" :class="{ mini: compact }" />
          <span v-else class="char-unit-icon-preview-fallback" :class="{ mini: compact }">{{ unitIconGlyph(unit) }}</span>
        </button>
      </header>

      <section v-if="iconPickerOpen" class="char-block icon-picker-block">
        <h4>サブアイコン選択</h4>
        <div v-if="iconOptions.length" class="icon-gallery-grid">
          <button
            v-for="row in iconOptions"
            :key="`icon-opt-${unit.id}-${row.name}`"
            type="button"
            class="icon-gallery-item"
            :class="{ active: iconDraft === row.name }"
            :title="row.name"
            @click="applyIconByPick(row.name)"
          >
            <img :src="row.src" :alt="row.name" />
          </button>
        </div>
        <div v-else class="small">アイコン一覧なし</div>
      </section>
    </template>

    <section class="detail-split">
      <div class="detail-left-pane">
        <div class="detail-view-tabs" role="tablist" aria-label="左パネル切替">
          <button
            v-for="tab in LEFT_PANEL_TABS"
            :key="`left-tab-${tab.key}`"
            type="button"
            class="detail-view-tab-btn"
            :class="{ active: leftPanelView === tab.key }"
            @click="leftPanelView = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <template v-if="leftPanelView === 'status'">
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
                <span>{{ row.label }}</span>
                <strong>{{ row.value }}</strong>
              </div>
            </div>
            <div v-else class="small">技能データなし</div>
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
        </template>

        <template v-else>
          <section class="char-block">
            <h4>装備一覧</h4>
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
        </template>
      </div>

      <section class="char-block detail-right-pane">
        <h4>スキル一覧</h4>
        <skill-acquired-table
          :skill-names="acquiredSkills"
          :status-source="unit?.status"
          :show-title="false"
          empty-text="取得スキルなし"
          :compact="compact"
        />
      </section>
    </section>
  </section>
</template>

<style scoped src="./CharacterDetailShared.css"></style>

<style scoped>
.detail-root {
  display: grid;
  gap: 8px;
}

.detail-split {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(340px, 0.95fr);
  gap: 5px;
  align-items: start;
}

.detail-left-pane {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.detail-right-pane {
  min-width: 0;
}

.detail-view-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.detail-view-tab-btn {
  border: 1px solid rgba(170, 140, 94, 0.82);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #2d2418;
  padding: 4px 10px;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
}

.detail-view-tab-btn.active {
  border-color: rgba(77, 165, 226, 0.9);
  box-shadow: 0 0 0 1px rgba(91, 198, 255, 0.35);
  background: linear-gradient(160deg, rgba(227, 244, 252, 0.96), rgba(209, 231, 246, 0.94));
}

.detail-root-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.detail-root-head h4 {
  margin: 0;
  font-size: 0.92rem;
}

.icon-header-button {
  border: 1px solid rgba(170, 140, 94, 0.82);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px;
  cursor: pointer;
}

.icon-header-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-header-button .char-unit-icon-preview,
.icon-header-button .char-unit-icon-preview-fallback {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}

.icon-picker-block {
  display: grid;
  gap: 8px;
}

.detail-root.with-sub-icon .char-block {
  position: relative;
  overflow: hidden;
}

.detail-root.with-sub-icon .char-block::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: var(--unit-sub-icon-image, none);
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 88px 88px;
  opacity: 0.12;
  pointer-events: none;
}

.detail-root.with-sub-icon .char-block > * {
  position: relative;
  z-index: 1;
}

.char-unit-icon-preview-fallback {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid rgba(189, 160, 119, 0.74);
  background: rgba(255, 255, 255, 0.65);
  color: #3a2d1a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
}

.char-unit-icon-preview-fallback.mini {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  font-size: 0.86rem;
}

.line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

@media (max-width: 1px) {
  .detail-split {
    grid-template-columns: 1fr;
  }
}
</style>
