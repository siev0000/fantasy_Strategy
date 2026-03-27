<script setup>
import { computed, ref, watch } from "vue";
import { DEFAULT_ICON_NAME, getIconSrcByName, hasIconName, listIconOptions, resolveIconName } from "../lib/icon-library.js";
import SkillAcquiredTable from "./SkillAcquiredTable.vue";
import EquipmentInventoryModal from "./EquipmentInventoryModal.vue";

const props = defineProps({
  unit: { type: Object, default: null },
  village: { type: Object, default: null },
  researchProgress: { type: Object, default: null },
  growthRows: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
  showCombatProfile: { type: Boolean, default: true },
  hideIconEditor: { type: Boolean, default: false }
});

const emit = defineEmits([
  "update-unit-icon",
  "update-unit-equipment"
]);

const STATUS_FIELD_ROWS = [
  ["HP", "SIZ"],
  ["攻撃", "魔力", "命中"],
  ["防御", "精神", "速度"]
];
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
  { key: "equipment", label: "装備" },
  { key: "role", label: "ロール" }
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
const EQUIPMENT_RARITY_ALIAS_MAP = {
  コモン: "common",
  アンコモン: "uncommon",
  レア: "rare",
  エピック: "epic",
  レジェンダリー: "legendary"
};
const EQUIPMENT_SLOT_KEYS = ["武器1", "武器2", "頭", "体", "足", "装飾1", "装飾2"];

const iconOptions = computed(() => listIconOptions());
const iconDraft = ref(DEFAULT_ICON_NAME);
const iconPickerOpen = ref(false);
const leftPanelView = ref("status");
const selectedEquipSlotKey = ref("武器1");
const showEquipmentPickerModal = ref(false);
const equipmentActionStatus = ref("");

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function toSafeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeResearchCompletedMap(progress, categoryKey) {
  const key = nonEmptyText(categoryKey);
  if (!key) return {};
  const source = progress?.completedByCategoryLevel?.[key];
  if (!source || typeof source !== "object") return {};
  return source;
}

function resolveResearchCurrentLevel(progress, categoryKey) {
  const completedMap = normalizeResearchCompletedMap(progress, categoryKey);
  let done = 0;
  const keys = Object.keys(completedMap);
  const maxLv = keys.reduce((acc, raw) => Math.max(acc, Math.max(1, Math.floor(Number(raw) || 1))), 1);
  for (let lv = 1; lv <= maxLv; lv += 1) {
    const value = completedMap[lv];
    const ids = Array.isArray(value)
      ? value.map(v => nonEmptyText(v)).filter(Boolean)
      : (value && typeof value === "object")
        ? Object.values(value).map(v => nonEmptyText(v)).filter(Boolean)
        : [nonEmptyText(value)].filter(Boolean);
    if (!ids.length) break;
    done = lv;
  }
  return Math.max(1, done + 1);
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
  if (["common", "uncommon", "rare", "epic", "legendary"].includes(lower)) return lower;
  return EQUIPMENT_RARITY_ALIAS_MAP[text] || "common";
}

function equipmentRarityShort(value) {
  const key = normalizeEquipmentRarity(value);
  if (key === "legendary") return "L";
  if (key === "epic") return "E";
  if (key === "rare") return "R";
  if (key === "uncommon") return "U";
  return "C";
}

function equipmentRarityLabel(value) {
  const key = normalizeEquipmentRarity(value);
  if (key === "legendary") return "レジェンダリー";
  if (key === "epic") return "エピック";
  if (key === "rare") return "レア";
  if (key === "uncommon") return "アンコモン";
  return "コモン";
}

function equipmentRarityClass(value) {
  return `rarity-${normalizeEquipmentRarity(value)}`;
}

function equipmentItemIconSrc(item) {
  const directName = nonEmptyText(item?.iconName || item?.name);
  if (directName && hasIconName(directName)) return getIconSrcByName(directName, directName);
  return "";
}

function equipmentItemGlyph(item) {
  const name = nonEmptyText(item?.name);
  if (!name) return "?";
  return Array.from(name)[0] || "?";
}

function equipmentApText(item) {
  const attackAp = Number(item?.attackAp);
  const magicAp = Number(item?.magicAp);
  const hasAttack = Number.isFinite(attackAp);
  const hasMagic = Number.isFinite(magicAp);
  if (hasAttack && hasMagic && Math.round(attackAp) !== Math.round(magicAp)) {
    return `${Math.round(attackAp)}/${Math.round(magicAp)}`;
  }
  if (hasAttack) return String(Math.round(attackAp));
  if (hasMagic) return String(Math.round(magicAp));
  return "0";
}

function equipmentResistancePairText(item) {
  const physical = Math.round(toSafeNumber(item?.resistanceBonus?.["物理耐性"], 0));
  const magic = Math.round(toSafeNumber(item?.resistanceBonus?.["魔法耐性"], 0));
  if (physical === 0 && magic === 0) return "";
  return `${physical}/${magic}`;
}

function normalizeEquipmentSlotKey(value) {
  const text = nonEmptyText(value);
  if (!text) return "";
  if (EQUIPMENT_SLOT_KEYS.includes(text)) return text;
  if (text === "武器") return "武器1";
  return "";
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
}

function selectEquipmentSlot(slotKey) {
  const key = normalizeEquipmentSlotKey(slotKey);
  if (!key) return;
  selectedEquipSlotKey.value = key;
}

function openEquipmentPickerModal() {
  const slotKey = normalizeEquipmentSlotKey(selectedEquipSlotKey.value);
  if (!slotKey) {
    equipmentActionStatus.value = "装備選択失敗: スロットを選択してください。";
    return;
  }
  const slot = equipmentSlots.value.find(row => row.key === slotKey);
  if (!slot?.enabled) {
    equipmentActionStatus.value = "装備選択失敗: このスロットは装備不可です。";
    return;
  }
  showEquipmentPickerModal.value = true;
}

function closeEquipmentPickerModal() {
  showEquipmentPickerModal.value = false;
}

function applyPickedEquipmentItem(payload = {}) {
  const unitId = nonEmptyText(props.unit?.id);
  const slotKey = normalizeEquipmentSlotKey(selectedEquipSlotKey.value);
  const equipmentName = nonEmptyText(payload?.equipmentName);
  const rarity = normalizeEquipmentRarity(payload?.rarity);
  if (!unitId || !slotKey || !equipmentName) {
    equipmentActionStatus.value = "在庫装備失敗: 対象が未選択です。";
    return;
  }
  const slot = equipmentSlots.value.find(row => row.key === slotKey);
  if (!slot?.enabled) {
    equipmentActionStatus.value = "在庫装備失敗: このスロットは装備不可です。";
    return;
  }
  emit("update-unit-equipment", {
    unitId,
    slotIndex: slot.index,
    slotKey: slot.key,
    equipmentName,
    rarity
  });
  equipmentActionStatus.value = `在庫から装備: ${slot.label} -> ${equipmentName}[${equipmentRarityShort(rarity)}]`;
  showEquipmentPickerModal.value = false;
}

function applyCraftFromPicker(payload = {}) {
  const unitId = nonEmptyText(props.unit?.id);
  const slotKey = normalizeEquipmentSlotKey(selectedEquipSlotKey.value);
  const equipmentName = nonEmptyText(payload?.equipmentName);
  const rarity = normalizeEquipmentRarity(payload?.rarity);
  if (!unitId || !slotKey || !equipmentName) {
    equipmentActionStatus.value = "装備生成失敗: 対象が未選択です。";
    return;
  }
  const slot = equipmentSlots.value.find(row => row.key === slotKey);
  if (!slot?.enabled) {
    equipmentActionStatus.value = "装備生成失敗: このスロットは装備不可です。";
    return;
  }
  emit("update-unit-equipment", {
    unitId,
    slotIndex: slot.index,
    slotKey: slot.key,
    equipmentName,
    rarity
  });
  equipmentActionStatus.value = `装備生成: ${slot.label} -> ${equipmentName}[${equipmentRarityShort(rarity)}]`;
}

function removeSelectedEquipment() {
  const unitId = nonEmptyText(props.unit?.id);
  const slotKey = normalizeEquipmentSlotKey(selectedEquipSlotKey.value);
  if (!unitId || !slotKey) {
    equipmentActionStatus.value = "装備解除失敗: 対象が未選択です。";
    return;
  }
  const slot = equipmentSlots.value.find(row => row.key === slotKey);
  if (!slot?.enabled || !slot?.item) {
    equipmentActionStatus.value = "装備解除失敗: 外せる装備がありません。";
    return;
  }
  emit("update-unit-equipment", {
    unitId,
    slotIndex: slot.index,
    slotKey: slot.key,
    equipmentName: "",
    rarity: normalizeEquipmentRarity(slot?.item?.quality || slot?.item?.qualityLabel || "common")
  });
  equipmentActionStatus.value = `装備解除: ${slot.label}`;
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

const combatProfileRows = computed(() => {
  const profile = props.unit?.combatProfile;
  if (!profile || typeof profile !== "object") return [];
  const hpMultiplier = Number(profile?.hpMultiplier);
  const attackCount = Number(profile?.attackCount);
  const populationCost = Number(profile?.populationCost);
  const rows = [];
  if (Number.isFinite(hpMultiplier) && hpMultiplier > 1) {
    rows.push({ key: "HP倍率", value: `x${Math.round(hpMultiplier * 10) / 10}` });
  }
  if (Number.isFinite(attackCount) && attackCount > 1) {
    rows.push({ key: "攻撃回数", value: `${Math.floor(attackCount)}回` });
  }
  if (Number.isFinite(populationCost) && populationCost > 0) {
    rows.push({ key: "人口消費", value: `${Math.floor(populationCost)}人/体` });
  }
  if (profile?.simpleActionOnly) {
    rows.push({ key: "行動制限", value: "単純行動のみ" });
  }
  return rows;
});

const acquiredSkills = computed(() => {
  const unit = props.unit;
  if (!unit || !Array.isArray(unit?.skills)) return [];
  return unit.skills.map(name => nonEmptyText(name)).filter(Boolean);
});

const roleGrowthRows = computed(() => {
  if (!Array.isArray(props.growthRows)) return [];
  return props.growthRows
    .map((row, index) => {
      const label = nonEmptyText(row?.label);
      const level = Math.max(0, Math.floor(toSafeNumber(row?.level, 0)));
      const skills = Array.isArray(row?.skills)
        ? row.skills.map(name => nonEmptyText(name)).filter(Boolean)
        : [];
      if (!label) return null;
      return {
        key: nonEmptyText(row?.key) || `${label}-${index}`,
        label,
        level,
        skills
      };
    })
    .filter(Boolean);
});

function roleRowSkillsText(row) {
  const skills = Array.isArray(row?.skills) ? row.skills : [];
  return skills.length ? skills.join(" / ") : "-";
}

const equipmentSlots = computed(() => {
  const unit = props.unit;
  if (!unit) return [];
  const slots = resolveUnitEquipmentSlots(unit);
  return EQUIPMENT_SLOT_KEYS.map((slotKey, index) => ({
    index,
    key: slotKey,
    label: slotKey,
    enabled: slots[slotKey] !== false,
    item: unitEquipmentAtSlot(unit, slotKey)
  }));
});

const canRemoveSelectedEquipment = computed(() => {
  const key = normalizeEquipmentSlotKey(selectedEquipSlotKey.value);
  if (!key) return false;
  const slot = equipmentSlots.value.find(row => row.key === key);
  return !!(slot?.enabled && slot?.item);
});

const smithLevelForModal = computed(() => {
  const cityLevel = Math.max(1, Math.floor(toSafeNumber(props?.village?.cityLevels?.["鍛冶場"], 1)));
  const researchLevel = resolveResearchCurrentLevel(props?.researchProgress, "鍛冶Lv");
  return Math.max(cityLevel, researchLevel, 1);
});

watch(
  () => props.unit,
  (unit) => {
    if (!unit) return;
    initDrafts(unit);
    leftPanelView.value = "status";
    equipmentActionStatus.value = "";
    showEquipmentPickerModal.value = false;
  },
  { immediate: true }
);

watch(
  equipmentSlots,
  (slots) => {
    const enabledSlot = slots.find(row => row.enabled) || slots[0] || null;
    const currentSlotKey = normalizeEquipmentSlotKey(selectedEquipSlotKey.value);
    if (!currentSlotKey || !slots.some(row => row.key === currentSlotKey)) {
      selectedEquipSlotKey.value = enabledSlot?.key || "";
    }
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
          <div class="detail-status-scroll">
            <section class="char-block">
              <h4>ステータス</h4>
              <div class="char-status-rows" :class="{ mini: compact }">
                <div
                  v-for="(rowKeys, rowIndex) in STATUS_FIELD_ROWS"
                  :key="`status-row-${unit.id}-${rowIndex}`"
                  class="char-status-row"
                  :class="`cols-${rowKeys.length}`"
                >
                  <div v-for="key in rowKeys" :key="`status-${unit.id}-${key}`" class="char-status-chip">
                    <span>{{ key }}</span>
                    <strong>{{ statusValue(unit, key) }}</strong>
                  </div>
                </div>
              </div>
              <div v-if="showCombatProfile && combatProfileRows.length" class="char-combat-grid">
                <div v-for="row in combatProfileRows" :key="`combat-${unit.id}-${row.key}`" class="char-skill-chip">
                  <span>{{ row.key }}</span>
                  <strong>{{ row.value }}</strong>
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
          </div>
        </template>

        <template v-else-if="leftPanelView === 'equipment'">
          <section class="char-block">
            <div class="equipment-head-row">
              <h4>装備一覧</h4>
              <div class="equipment-head-actions">
                <button type="button" class="secondary" :disabled="!selectedEquipSlotKey" @click="openEquipmentPickerModal">
                  スロットを変更
                </button>
                <button type="button" class="secondary" :disabled="!canRemoveSelectedEquipment" @click="removeSelectedEquipment">
                  外す
                </button>
              </div>
            </div>
            <div class="small">対象スロット: {{ selectedEquipSlotKey || "-" }}</div>
            <div v-if="equipmentSlots.length" class="equipment-edit-list">
              <article
                v-for="slot in equipmentSlots"
                :key="`equip-slot-${unit.id}-${slot.index}`"
                class="equipment-edit-item"
                :class="{ disabled: !slot.enabled, active: selectedEquipSlotKey === slot.key }"
                @click="selectEquipmentSlot(slot.key)"
              >
                <div class="equipment-edit-main">
                  <div
                    class="equipment-edit-icon-wrap"
                    :class="slot.item ? equipmentRarityClass(slot.item?.quality || slot.item?.qualityLabel) : ''"
                  >
                    <img
                      v-if="slot.item && equipmentItemIconSrc(slot.item)"
                      :src="equipmentItemIconSrc(slot.item)"
                      :alt="slot.item?.name || slot.label"
                      class="equipment-edit-icon"
                    />
                    <span v-else class="equipment-edit-icon-fallback">{{ slot.item ? equipmentItemGlyph(slot.item) : "-" }}</span>
                    <span
                      v-if="slot.item"
                      class="equipment-edit-rarity-badge"
                      :class="equipmentRarityClass(slot.item?.quality || slot.item?.qualityLabel)"
                      :title="equipmentRarityLabel(slot.item?.quality || slot.item?.qualityLabel)"
                    >
                      {{ equipmentRarityShort(slot.item?.quality || slot.item?.qualityLabel) }}
                    </span>
                  </div>
                  <div class="equipment-edit-meta">
                    <div class="line">
                      <strong>{{ slot.label }}</strong>
                      <span>
                        <template v-if="!slot.enabled">× 装備不可</template>
                        <template v-else>
                          {{ slot.item?.name || "-" }}
                        </template>
                      </span>
                    </div>
                    <div class="small" v-if="slot.item">
                      威/守 {{ toSafeNumber(slot.item.power, 0) }}/{{ toSafeNumber(slot.item.guard, 0) }} / Cr率 {{ toSafeNumber(slot.item.criticalRate, 0) }} / Cr威力 {{ toSafeNumber(slot.item.criticalPower, 0) }} / AP {{ equipmentApText(slot.item) }}
                      <template v-if="equipmentResistancePairText(slot.item)"> / 物/魔耐 {{ equipmentResistancePairText(slot.item) }}</template>
                    </div>
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="small">装備データなし</div>
            <div v-if="equipmentActionStatus" class="small equipment-action-status">{{ equipmentActionStatus }}</div>
          </section>
        </template>

        <template v-else>
          <section class="char-block role-growth-block">
            <h4>ロール</h4>
            <div v-if="roleGrowthRows.length" class="role-growth-list">
              <div
                v-for="row in roleGrowthRows"
                :key="`role-growth-${unit.id}-${row.key}`"
                class="role-growth-row"
              >
                <span class="role-growth-name">{{ row.label }}</span>
                <span class="role-growth-level">Lv{{ row.level }}</span>
                <span class="role-growth-skills">{{ roleRowSkillsText(row) }}</span>
              </div>
            </div>
            <div v-else class="small">ロールデータなし</div>
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

  <equipment-inventory-modal
    :show="showEquipmentPickerModal"
    :village="village"
    :smith-level="smithLevelForModal"
    :picker-mode="true"
    :allow-craft-in-picker-mode="true"
    :filter-slot-key="selectedEquipSlotKey"
    @close="closeEquipmentPickerModal"
    @select-item="applyPickedEquipmentItem"
    @craft-weapon="applyCraftFromPicker"
  />
</template>

<style scoped src="./CharacterDetailShared.css"></style>

<style scoped>
.detail-root {
  display: grid;
  gap: 8px;
}

.detail-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 1fr);
  gap: 8px;
  align-items: start;
}

.detail-left-pane {
  display: grid;
  gap: 5px;
  min-width: 0;
  min-height: 420px;
  align-content: start;
}

.detail-status-scroll {
  height: 420px;
  overflow-y: auto;
  overflow-x: hidden;
  display: grid;
  gap: 6px;
  padding-right: 2px;
}

.detail-right-pane {
  min-width: 0;
  display: grid;
  align-content: start;
  min-height: 0;
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

.equipment-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.char-status-rows {
  display: grid;
  gap: 6px;
}

.char-status-row {
  display: grid;
  gap: 6px;
}

.char-status-row.cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.char-status-row.cols-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.equipment-edit-item.active {
  border-color: rgba(77, 165, 226, 0.92);
  box-shadow: 0 0 0 1px rgba(91, 198, 255, 0.35);
}

.equipment-edit-row {
  grid-template-columns: minmax(120px, 1fr) auto;
}

.equipment-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.equipment-action-status {
  color: rgba(60, 46, 30, 0.92);
  font-weight: 700;
}

.equipment-edit-list {
  max-height: min(360px, 46vh);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
}

.equipment-edit-main {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.equipment-edit-icon-wrap {
  position: relative;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(175, 151, 112, 0.74);
  border-radius: 7px;
  background: rgba(25, 23, 20, 0.82);
  overflow: hidden;
}

.equipment-edit-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.equipment-edit-icon-fallback {
  width: 100%;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #f5e8c7;
  font-size: 0.9rem;
  font-weight: 700;
}

.equipment-edit-rarity-badge {
  position: absolute;
  left: 2px;
  top: 1px;
  min-width: 14px;
  border-radius: 3px;
  padding: 0 3px;
  font-size: 0.56rem;
  line-height: 1.25;
  color: #fdf3da;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.65);
  background: rgba(31, 22, 14, 0.86);
}

.equipment-edit-rarity-badge.rarity-common {
  color: #c9c9c9;
}

.equipment-edit-rarity-badge.rarity-uncommon {
  color: #78d86c;
}

.equipment-edit-rarity-badge.rarity-rare {
  color: #63b1ff;
}

.equipment-edit-rarity-badge.rarity-epic {
  color: #c992ff;
}

.equipment-edit-rarity-badge.rarity-legendary {
  color: #ffd06e;
}

.equipment-edit-icon-wrap.rarity-uncommon {
  border-color: rgba(126, 209, 124, 0.86);
}

.equipment-edit-icon-wrap.rarity-rare {
  border-color: rgba(99, 164, 241, 0.86);
}

.equipment-edit-icon-wrap.rarity-epic {
  border-color: rgba(201, 131, 255, 0.9);
}

.equipment-edit-icon-wrap.rarity-legendary {
  border-color: rgba(250, 188, 90, 0.94);
}

.equipment-edit-meta {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.char-combat-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.detail-right-pane :deep(.skill-table-root) {
  min-height: 0;
  display: grid;
}

.detail-right-pane :deep(.skill-table-wrap) {
  min-height: 0;
  height: 405px;
  overflow-y: auto;
  overflow-x: hidden;
}

.role-growth-block {
  display: grid;
  gap: 6px;
}

.role-growth-list {
  display: grid;
  gap: 5px;
}

.role-growth-row {
  display: grid;
  grid-template-columns: minmax(90px, 120px) 52px 1fr;
  gap: 8px;
  align-items: center;
  border: 1px solid rgba(206, 180, 135, 0.62);
  border-radius: 7px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.82);
  font-size: 0.8rem;
}

.role-growth-name {
  font-weight: 700;
  color: #3a2d1a;
}

.role-growth-level {
  font-weight: 700;
  color: #5b4528;
}

.role-growth-skills {
  color: #5f4b2b;
  word-break: break-word;
}

@media (max-width: 1px) {
  .detail-split {
    grid-template-columns: 1fr;
  }
}
</style>
