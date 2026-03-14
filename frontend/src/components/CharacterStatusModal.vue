<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import CharacterUnitDetailPanel from "./CharacterUnitDetailPanel.vue";
import equipmentDb from "../../../data/source/export/json/装備.json";
import classDb from "../../../data/source/export/json/クラス.json";
import { DEFAULT_ICON_NAME, getIconSrcByName, hasIconName, listIconOptions, resolveIconName } from "../lib/icon-library.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  units: { type: Array, default: () => [] },
  squads: { type: Array, default: () => [] },
  village: { type: Object, default: null },
  ruleText: { type: String, default: "" },
  defaultSelectedId: { type: String, default: "" },
  testMode: { type: Boolean, default: false }
});

const emit = defineEmits([
  "close",
  "promote-unit",
  "remove-mob",
  "create-squad",
  "rename-squad",
  "dissolve-squad",
  "update-squad-icon",
  "update-unit-equipment",
  "update-unit-icon",
  "level-unit",
  "assign-secondary-class"
]);

const STATUS_FIELDS = ["HP", "攻撃", "防御", "魔力", "精神", "速度", "命中", "SIZ"];
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
const FOOD_KEYS = ["穀物", "野菜", "肉", "魚"];
const MAT_KEYS = ["木材", "石材", "鉄"];
const FOOD_LABEL = { 穀物: "穀", 野菜: "野", 肉: "肉", 魚: "魚" };
const MAT_LABEL = { 木材: "木", 石材: "石", 鉄: "鉄" };
const MAX_SQUAD_MEMBER_COUNT = 5;
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

const activeTab = ref("character");
const activeUnitId = ref("");
const activeSquadId = ref("");
const activeSquadMemberId = ref("");
const activeUnitIconModalOpen = ref(false);
const activeUnitIconModalDraft = ref(DEFAULT_ICON_NAME);
const activeSquadIconModalOpen = ref(false);
const activeSquadIconModalDraft = ref(DEFAULT_ICON_NAME);

const creatingSquad = ref(false);
const createStep = ref("leader");
const draftLeaderId = ref("");
const draftMemberIds = ref([]);
const draftSquadName = ref("");

const renameInput = ref("");
const equipmentEditBySlot = ref({});
const iconDraftByUnit = ref({});
const secondaryClassDraftByUnit = ref({});

const unitList = computed(() => {
  if (!Array.isArray(props.units)) return [];
  return props.units;
});

const equipmentRows = computed(() => {
  if (!Array.isArray(equipmentDb)) return [];
  return equipmentDb
    .filter(row => nonEmptyText(row?.装備名))
    .sort((a, b) => nonEmptyText(a?.装備名).localeCompare(nonEmptyText(b?.装備名), "ja"));
});

const jobClassNames = computed(() => {
  if (!Array.isArray(classDb)) return [];
  return classDb
    .filter(row => nonEmptyText(row?.種類) === "職業")
    .map(row => nonEmptyText(row?.名前))
    .filter(Boolean);
});

const squadList = computed(() => {
  if (!Array.isArray(props.squads)) return [];
  return props.squads
    .map(row => ({
      ...row,
      id: String(row?.id || "").trim(),
      name: String(row?.name || "").trim(),
      leaderId: String(row?.leaderId || "").trim(),
      leaderName: String(row?.leaderName || "").trim(),
      squadIconName: String(row?.squadIconName || "").trim(),
      memberIds: Array.isArray(row?.memberIds)
        ? row.memberIds.map(id => String(id || "").trim()).filter(Boolean)
        : []
    }))
    .filter(row => row.id && row.leaderId);
});

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function toSafeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function roundTo1(value) {
  return Math.round(toSafeNumber(value, 0) * 10) / 10;
}

function findUnitById(unitId) {
  const key = nonEmptyText(unitId);
  if (!key) return null;
  return unitList.value.find(unit => String(unit?.id || "").trim() === key) || null;
}

const activeUnit = computed(() => {
  if (!unitList.value.length) return null;
  const found = findUnitById(activeUnitId.value);
  return found || unitList.value[0];
});

const activeSquad = computed(() => {
  if (!squadList.value.length) return null;
  const found = squadList.value.find(squad => squad.id === activeSquadId.value);
  return found || squadList.value[0];
});

function isSovereign(unit) {
  return !!unit?.isSovereign;
}

function isNamed(unit) {
  return !!unit?.isNamed || String(unit?.unitType || "") === "ネームド" || isSovereign(unit);
}

function hasSquad(unit) {
  return Math.max(0, Math.floor(toSafeNumber(unit?.squadCount, 0))) > 0;
}

function isInAnySquad(unit) {
  if (!unit) return false;
  if (hasSquad(unit)) return true;
  return nonEmptyText(unit?.squadLeaderId).length > 0;
}

function unitRoleLabel(unit) {
  if (isSovereign(unit)) return "統治者";
  if (isNamed(unit)) return "ネームド";
  return "モブ";
}

const villageScaleLabel = computed(() => {
  const pop = Number(props?.village?.population || 0);
  if (pop >= 260) return "都市";
  if (pop >= 160) return "町";
  return "村";
});

const namedLimit = computed(() => {
  if (villageScaleLabel.value === "都市") return 7;
  if (villageScaleLabel.value === "町") return 4;
  return 2;
});

const namedCount = computed(() => {
  return unitList.value.reduce((sum, unit) => {
    if (isSovereign(unit)) return sum;
    return isNamed(unit) ? sum + 1 : sum;
  }, 0);
});

function canPromote(unit) {
  if (!unit) return false;
  if (isSovereign(unit) || isNamed(unit)) return false;
  return namedCount.value < namedLimit.value;
}

function canRemoveMob(unit) {
  if (!unit) return false;
  return !isSovereign(unit) && !isNamed(unit);
}

function isHumanUnit(unit) {
  const race = nonEmptyText(unit?.race);
  return race === "只人" || race === "ヒューマン";
}

function unitLevel(unit) {
  return Math.max(1, Math.min(10, Math.floor(toSafeNumber(unit?.level, 1))));
}

function canLevelUp(unit) {
  return !!unit && unitLevel(unit) < 10;
}

function canLevelDown(unit) {
  return !!unit && unitLevel(unit) > 1;
}

function secondaryClassDraft(unit) {
  const unitId = nonEmptyText(unit?.id);
  if (!unitId) return "";
  return nonEmptyText(secondaryClassDraftByUnit.value[unitId] || unit?.secondaryClassName);
}

function secondaryClassOptionsForUnit(unit) {
  const main = nonEmptyText(unit?.className);
  const current = nonEmptyText(unit?.secondaryClassName);
  return jobClassNames.value.filter(name => name && name !== main && (!current || name !== current));
}

function initSecondaryClassDraft(unit) {
  const unitId = nonEmptyText(unit?.id);
  if (!unitId) return;
  const current = nonEmptyText(unit?.secondaryClassName);
  const options = secondaryClassOptionsForUnit(unit);
  secondaryClassDraftByUnit.value = {
    ...secondaryClassDraftByUnit.value,
    [unitId]: current || options[0] || ""
  };
}

function updateSecondaryClassDraft(unit, className) {
  const unitId = nonEmptyText(unit?.id);
  if (!unitId) return;
  secondaryClassDraftByUnit.value = {
    ...secondaryClassDraftByUnit.value,
    [unitId]: nonEmptyText(className)
  };
}

function levelUpActiveUnit(delta = 1) {
  const unit = activeUnit.value;
  if (!unit || !props.testMode) return;
  const amount = Math.max(-5, Math.min(5, Math.floor(toSafeNumber(delta, 1))));
  if (!amount) return;
  emit("level-unit", { unitId: unit.id, delta: amount });
}

function assignSecondaryClassToActiveUnit() {
  const unit = activeUnit.value;
  if (!unit || !props.testMode) return;
  if (!isHumanUnit(unit) || unitLevel(unit) < 10) return;
  const className = secondaryClassDraft(unit);
  if (!className) return;
  emit("assign-secondary-class", {
    unitId: unit.id,
    secondaryClassName: className
  });
}

function promoteActiveUnit() {
  if (!activeUnit.value || !canPromote(activeUnit.value)) return;
  emit("promote-unit", { unitId: activeUnit.value.id });
}

function removeActiveMob() {
  if (!activeUnit.value || !canRemoveMob(activeUnit.value)) return;
  emit("remove-mob", { unitId: activeUnit.value.id });
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

const iconOptions = computed(() => listIconOptions());

function iconNameForUnit(unit) {
  const name = nonEmptyText(unit?.iconName);
  if (name && hasIconName(name)) return name;
  return "";
}

function iconSrcForUnit(unit) {
  const direct = nonEmptyText(unit?.iconSrc);
  if (direct) return direct;
  const iconName = iconNameForUnit(unit);
  if (iconName) return getIconSrcByName(iconName, iconName);
  return "";
}

function iconGlyphForUnit(unit) {
  const race = nonEmptyText(unit?.race);
  if (race) return Array.from(race)[0] || "?";
  const className = nonEmptyText(unit?.className);
  if (className) return Array.from(className)[0] || "?";
  const name = nonEmptyText(unit?.name);
  if (name) return Array.from(name)[0] || "?";
  return "?";
}

function subIconNameForUnit(unit) {
  const name = nonEmptyText(unit?.subIconName);
  if (name && hasIconName(name)) return name;
  return "";
}

function subIconSrcForUnit(unit) {
  const direct = nonEmptyText(unit?.subIconSrc);
  if (direct) return direct;
  const iconName = subIconNameForUnit(unit);
  if (iconName) return getIconSrcByName(iconName, iconName);
  return "";
}

function cardSubIconStyle(unit) {
  const src = subIconSrcForUnit(unit);
  if (!src) return {};
  return { "--card-sub-icon-image": `url("${src}")` };
}

function iconDraft(unit) {
  const unitId = nonEmptyText(unit?.id);
  if (!unitId) return DEFAULT_ICON_NAME;
  const current = nonEmptyText(iconDraftByUnit.value[unitId]);
  return resolveIconName(current || unit?.subIconName, DEFAULT_ICON_NAME);
}

function updateIconDraft(unit, iconName) {
  const unitId = nonEmptyText(unit?.id);
  if (!unitId) return;
  iconDraftByUnit.value = {
    ...iconDraftByUnit.value,
    [unitId]: resolveIconName(iconName, DEFAULT_ICON_NAME)
  };
}

function initIconDraft(unit) {
  const unitId = nonEmptyText(unit?.id);
  if (!unitId) return;
  const nextName = resolveIconName(unit?.subIconName, DEFAULT_ICON_NAME);
  iconDraftByUnit.value = {
    ...iconDraftByUnit.value,
    [unitId]: nextName
  };
}

function applyUnitIconChange(unit) {
  const unitId = nonEmptyText(unit?.id);
  if (!unitId) return;
  const iconName = iconDraft(unit);
  emit("update-unit-icon", { unitId, iconName });
}

function openActiveUnitIconModal() {
  const unit = activeUnit.value;
  if (!unit || !iconOptions.value.length) return;
  activeUnitIconModalDraft.value = iconDraft(unit);
  activeUnitIconModalOpen.value = true;
}

function closeActiveUnitIconModal() {
  activeUnitIconModalOpen.value = false;
}

function selectActiveUnitModalIcon(iconName) {
  activeUnitIconModalDraft.value = resolveIconName(iconName, DEFAULT_ICON_NAME);
}

function applyActiveUnitIconModal() {
  const unit = activeUnit.value;
  if (!unit) return;
  updateIconDraft(unit, activeUnitIconModalDraft.value);
  applyUnitIconChange(unit);
  activeUnitIconModalOpen.value = false;
}

function iconSrcByName(iconName) {
  const name = resolveIconName(iconName, DEFAULT_ICON_NAME);
  return getIconSrcByName(name, name);
}

function squadIconNameForSquad(squad) {
  const raw = nonEmptyText(squad?.squadIconName);
  if (!raw) return "";
  return resolveIconName(raw, "");
}

function squadIconSrcForSquad(squad) {
  const name = squadIconNameForSquad(squad);
  if (!name) return "";
  return getIconSrcByName(name, name);
}

function squadIconGlyphForSquad(squad) {
  const name = squadIconNameForSquad(squad);
  if (name) return Array.from(name)[0] || "隊";
  const squadName = nonEmptyText(squad?.name);
  if (squadName) return Array.from(squadName)[0] || "隊";
  return "隊";
}

function openActiveSquadIconModal() {
  const squad = activeSquad.value;
  if (!squad || !iconOptions.value.length) return;
  activeSquadIconModalDraft.value = resolveIconName(squad?.squadIconName, DEFAULT_ICON_NAME);
  activeSquadIconModalOpen.value = true;
}

function closeActiveSquadIconModal() {
  activeSquadIconModalOpen.value = false;
}

function selectActiveSquadModalIcon(iconName) {
  activeSquadIconModalDraft.value = resolveIconName(iconName, DEFAULT_ICON_NAME);
}

function applyActiveSquadIconModal() {
  const squad = activeSquad.value;
  if (!squad) return;
  const leaderId = nonEmptyText(squad?.leaderId);
  if (!leaderId) return;
  emit("update-squad-icon", {
    leaderId,
    iconName: resolveIconName(activeSquadIconModalDraft.value, DEFAULT_ICON_NAME)
  });
  activeSquadIconModalOpen.value = false;
}

function formatBag(raw, keys, labels) {
  if (!raw || typeof raw !== "object") return "-";
  return keys.map(key => `${labels[key] || key}${Math.round(toSafeNumber(raw[key], 0))}`).join(" ");
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

function equipmentDraftSlotKey(unitId, slotKey) {
  return `${nonEmptyText(unitId)}::${nonEmptyText(slotKey)}`;
}

function initEquipmentDraftsForUnit(unit) {
  const unitId = nonEmptyText(unit?.id);
  if (!unitId) return;
  const next = { ...equipmentEditBySlot.value };
  const slots = resolveUnitEquipmentSlots(unit);
  for (const slotKey of EQUIPMENT_SLOT_KEYS) {
    const options = equipmentOptionsForSlot(slotKey);
    const defaultName = nonEmptyText(options[0]?.装備名);
    const item = unitEquipmentAtSlot(unit, slotKey);
    const key = equipmentDraftSlotKey(unitId, slotKey);
    next[key] = {
      equipmentName: nonEmptyText(item?.name) || defaultName,
      rarity: normalizeEquipmentRarity(item?.quality || item?.qualityLabel)
    };
    if (slots[slotKey] === false) {
      next[key] = {
        equipmentName: "",
        rarity: "common"
      };
    }
  }
  equipmentEditBySlot.value = next;
}

function slotDraft(unit, slotKey) {
  const unitId = nonEmptyText(unit?.id);
  if (!unitId) return { equipmentName: "", rarity: "common" };
  const key = equipmentDraftSlotKey(unitId, slotKey);
  const row = equipmentEditBySlot.value[key];
  if (row && nonEmptyText(row.equipmentName)) {
    return {
      equipmentName: row.equipmentName,
      rarity: normalizeEquipmentRarity(row.rarity)
    };
  }
  const currentItem = unitEquipmentAtSlot(unit, slotKey);
  const options = equipmentOptionsForSlot(slotKey);
  return {
    equipmentName: nonEmptyText(currentItem?.name) || nonEmptyText(options[0]?.装備名),
    rarity: normalizeEquipmentRarity(currentItem?.quality || currentItem?.qualityLabel)
  };
}

function updateSlotDraft(unit, slotKey, patch) {
  const unitId = nonEmptyText(unit?.id);
  if (!unitId) return;
  const key = equipmentDraftSlotKey(unitId, slotKey);
  const current = slotDraft(unit, slotKey);
  equipmentEditBySlot.value = {
    ...equipmentEditBySlot.value,
    [key]: {
      ...current,
      ...patch
    }
  };
}

function applyEquipmentChange(slot) {
  const unit = activeUnit.value;
  if (!unit) return;
  if (!slot?.enabled) return;
  const draft = slotDraft(unit, slot.key);
  const equipmentName = nonEmptyText(draft.equipmentName);
  if (!equipmentName) return;
  emit("update-unit-equipment", {
    unitId: unit.id,
    slotIndex: slot.index,
    slotKey: slot.key,
    equipmentName,
    rarity: normalizeEquipmentRarity(draft.rarity)
  });
}

function buildSkillRows(unit) {
  if (!unit) return [];
  return SKILL_FIELD_DEFS.map(field => ({
    key: field.key,
    label: field.label || field.key,
    value: skillValue(unit, field)
  }));
}

function buildResistanceRows(unit) {
  if (!unit) return [];
  return RESISTANCE_FIELDS.map(key => ({
    key,
    value: resistanceValue(unit, key)
  })).filter(row => row.value !== null && row.value !== 0);
}

function buildAcquiredSkills(unit) {
  if (!unit || !Array.isArray(unit?.skills)) return [];
  return unit.skills.map(name => nonEmptyText(name)).filter(Boolean);
}

function acquiredSkillsSummary(unit, limit = 4) {
  const list = buildAcquiredSkills(unit);
  if (!list.length) return "なし";
  const safeLimit = Math.max(1, Math.floor(toSafeNumber(limit, 4)));
  const visible = list.slice(0, safeLimit);
  const suffix = list.length > visible.length ? ` +${list.length - visible.length}` : "";
  return `${visible.join(" / ")}${suffix}`;
}

function consoleLogCharacterModalOpen() {
  const snapshot = unitList.value.map(unit => ({
    id: nonEmptyText(unit?.id),
    name: nonEmptyText(unit?.name),
    unitType: nonEmptyText(unit?.unitType),
    race: nonEmptyText(unit?.race),
    className: nonEmptyText(unit?.className),
    level: Math.floor(toSafeNumber(unit?.level, 0)),
    growthRule: unit?.growthRule || null,
    status: unit?.status || null,
    skillLevels: unit?.skillLevels || null,
    skills: Array.isArray(unit?.skills) ? unit.skills : [],
    resistances: unit?.resistances || null,
    pos: {
      x: Number.isFinite(Number(unit?.x)) ? Number(unit?.x) : null,
      y: Number.isFinite(Number(unit?.y)) ? Number(unit?.y) : null
    }
  }));
  console.groupCollapsed(`[CharacterStatusModal] open units=${snapshot.length}`);
  console.log("units(snapshot)", snapshot);
  console.log("village", props.village || null);
  console.groupEnd();
}

function buildEquipmentSlotRows(unit) {
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
}

const activeUnitSkillRows = computed(() => buildSkillRows(activeUnit.value));
const activeUnitResistanceRows = computed(() => buildResistanceRows(activeUnit.value));
const activeUnitAcquiredSkills = computed(() => buildAcquiredSkills(activeUnit.value));
const activeUnitEquipmentSlots = computed(() => buildEquipmentSlotRows(activeUnit.value));

const activeSquadMemberSkillRows = computed(() => buildSkillRows(activeSquadMemberUnit.value));
const activeSquadMemberResistanceRows = computed(() => buildResistanceRows(activeSquadMemberUnit.value));
const activeSquadMemberAcquiredSkills = computed(() => buildAcquiredSkills(activeSquadMemberUnit.value));
const activeSquadMemberEquipmentSlots = computed(() => buildEquipmentSlotRows(activeSquadMemberUnit.value));

const villagePopulationText = computed(() => {
  const byRace = props?.village?.populationByRace;
  if (!byRace || typeof byRace !== "object") return "-";
  const rows = Object.entries(byRace)
    .map(([race, count]) => ({ race: String(race || "").trim(), count: Math.floor(toSafeNumber(count, 0)) }))
    .filter(row => row.race && row.count > 0)
    .sort((a, b) => b.count - a.count);
  if (!rows.length) return "-";
  return rows.map(row => `${row.race}:${row.count}人`).join(" / ");
});

const villageFoodText = computed(() => formatBag(props?.village?.foodStockByType, FOOD_KEYS, FOOD_LABEL));
const villageMaterialText = computed(() => formatBag(props?.village?.materialStockByType, MAT_KEYS, MAT_LABEL));

function selectUnit(id) {
  activeUnitId.value = String(id || "");
}

function selectTab(tabKey) {
  const key = tabKey === "squad" ? "squad" : "character";
  activeTab.value = key;
  if (key !== "squad") {
    creatingSquad.value = false;
  }
}

function generateDefaultSquadName() {
  let maxNo = 0;
  for (const squad of squadList.value) {
    const name = nonEmptyText(squad?.name);
    if (!name.startsWith("部隊")) continue;
    const tail = name.slice(2);
    const no = Number(tail);
    if (Number.isFinite(no) && no > maxNo) maxNo = no;
  }
  return `部隊${maxNo + 1}`;
}

const leaderCandidates = computed(() => {
  return unitList.value.filter(unit => {
    if (!unit) return false;
    const x = Number(unit?.x);
    const y = Number(unit?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return false;
    return !isInAnySquad(unit);
  });
});

const draftLeader = computed(() => findUnitById(draftLeaderId.value));

const memberCandidates = computed(() => {
  const leader = draftLeader.value;
  if (!leader) return [];
  return unitList.value.filter(unit => {
    if (!unit || String(unit?.id || "") === String(leader?.id || "")) return false;
    if (isInAnySquad(unit)) return false;
    const x = Number(unit?.x);
    const y = Number(unit?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return false;
    return x === Number(leader.x) && y === Number(leader.y);
  });
});

function startSquadCreate() {
  creatingSquad.value = true;
  createStep.value = "leader";
  draftLeaderId.value = "";
  draftMemberIds.value = [];
  draftSquadName.value = "";
}

function cancelSquadCreate() {
  creatingSquad.value = false;
  createStep.value = "leader";
  draftLeaderId.value = "";
  draftMemberIds.value = [];
  draftSquadName.value = "";
}

function chooseDraftLeader(unitId) {
  draftLeaderId.value = String(unitId || "").trim();
  draftMemberIds.value = [];
  createStep.value = "members";
}

function toggleDraftMember(unitId) {
  const id = String(unitId || "").trim();
  if (!id) return;
  const candidates = memberCandidates.value;
  if (!candidates.some(unit => String(unit?.id || "").trim() === id)) return;
  const current = new Set(draftMemberIds.value.map(v => String(v || "").trim()).filter(Boolean));
  if (current.has(id)) {
    current.delete(id);
  } else {
    if (current.size >= MAX_SQUAD_MEMBER_COUNT) return;
    current.add(id);
  }
  draftMemberIds.value = Array.from(current);
}

function moveCreateStepNext() {
  if (createStep.value === "leader") {
    if (!draftLeader.value) return;
    createStep.value = "members";
    return;
  }
  if (createStep.value === "members") {
    if (!draftMemberIds.value.length) return;
    if (!draftSquadName.value.trim()) {
      draftSquadName.value = generateDefaultSquadName();
    }
    createStep.value = "name";
  }
}

function moveCreateStepBack() {
  if (createStep.value === "name") {
    createStep.value = "members";
    return;
  }
  if (createStep.value === "members") {
    createStep.value = "leader";
  }
}

function completeSquadCreate() {
  const leaderId = nonEmptyText(draftLeaderId.value);
  const memberIds = draftMemberIds.value
    .map(id => nonEmptyText(id))
    .filter(Boolean)
    .slice(0, MAX_SQUAD_MEMBER_COUNT);
  const squadName = nonEmptyText(draftSquadName.value) || generateDefaultSquadName();
  if (!leaderId || !memberIds.length) return;
  emit("create-squad", { leaderId, memberIds, squadName });
  creatingSquad.value = false;
  createStep.value = "leader";
  draftLeaderId.value = "";
  draftMemberIds.value = [];
  draftSquadName.value = "";
  activeTab.value = "squad";
}

function selectSquad(squadId) {
  activeSquadId.value = String(squadId || "");
}

function buildSquadMemberRows(squad) {
  if (!squad) return [];
  const leader = findUnitById(squad.leaderId);
  const leaderRow = leader
    ? [{ id: leader.id, name: leader.name || "リーダー", role: "リーダー", unit: leader }]
    : [];
  const memberRows = (Array.isArray(squad.memberIds) ? squad.memberIds : [])
    .map(memberId => {
      const unit = findUnitById(memberId);
      if (!unit) return null;
      return { id: unit.id, name: unit.name || unit.id, role: "メンバー", unit };
    })
    .filter(Boolean);
  return [...leaderRow, ...memberRows];
}

const squadMemberRowsMap = computed(() => {
  const map = new Map();
  for (const squad of squadList.value) {
    map.set(squad.id, buildSquadMemberRows(squad));
  }
  return map;
});

function squadMembersForList(squad) {
  const squadId = nonEmptyText(squad?.id);
  if (!squadId) return [];
  return squadMemberRowsMap.value.get(squadId) || [];
}

function isSquadExpanded(squadId) {
  return nonEmptyText(activeSquad.value?.id) === nonEmptyText(squadId);
}

function selectSquadMemberFromList(squadId, memberId) {
  activeSquadId.value = nonEmptyText(squadId);
  activeSquadMemberId.value = nonEmptyText(memberId);
}

const activeSquadMemberOptions = computed(() => {
  const squad = activeSquad.value;
  return buildSquadMemberRows(squad);
});

const activeSquadMemberUnit = computed(() => {
  const rows = activeSquadMemberOptions.value;
  if (!rows.length) return null;
  const found = rows.find(row => row.id === activeSquadMemberId.value);
  return (found || rows[0])?.unit || null;
});

function applyRenameSquad() {
  const squad = activeSquad.value;
  const nextName = nonEmptyText(renameInput.value);
  if (!squad || !nextName) return;
  emit("rename-squad", { leaderId: squad.leaderId, squadName: nextName });
}

function dissolveSquad() {
  const squad = activeSquad.value;
  if (!squad) return;
  emit("dissolve-squad", { leaderId: squad.leaderId });
}

watch(
  [() => props.show, unitList, () => props.defaultSelectedId],
  ([isOpen, units, selectedId], previous) => {
    if (!isOpen) return;
    const wasOpen = Array.isArray(previous) ? !!previous[0] : false;
    const justOpened = isOpen && !wasOpen;
    const hasCurrent = !!activeUnitId.value && units.some(unit => String(unit?.id || "") === activeUnitId.value);
    const preferred = String(selectedId || "").trim();
    if (preferred && units.some(unit => String(unit?.id || "") === preferred) && (!hasCurrent || justOpened)) {
      activeUnitId.value = preferred;
    } else if (!hasCurrent) {
      activeUnitId.value = units.length ? String(units[0]?.id || "") : "";
    }
    if (justOpened) {
      activeTab.value = "character";
      creatingSquad.value = false;
      createStep.value = "leader";
      draftLeaderId.value = "";
      draftMemberIds.value = [];
      draftSquadName.value = "";
    }
  },
  { immediate: true }
);

watch(
  [() => props.show, squadList],
  ([isOpen, squads]) => {
    if (!isOpen) return;
    const list = Array.isArray(squads) ? squads : [];
    if (!list.length) {
      activeSquadId.value = "";
      activeSquadMemberId.value = "";
      renameInput.value = "";
      return;
    }
    if (!list.some(squad => squad.id === activeSquadId.value)) {
      activeSquadId.value = list[0].id;
    }
  },
  { immediate: true }
);

watch(
  [activeSquad, activeSquadMemberOptions],
  ([squad, options]) => {
    if (!squad) {
      renameInput.value = "";
      activeSquadMemberId.value = "";
      return;
    }
    renameInput.value = nonEmptyText(squad.name);
    if (!options.length) {
      activeSquadMemberId.value = "";
      return;
    }
    if (!options.some(row => row.id === activeSquadMemberId.value)) {
      activeSquadMemberId.value = options[0].id;
    }
  },
  { immediate: true }
);

watch(
  [() => props.show, activeUnit, equipmentRows],
  ([isOpen, unit]) => {
    if (!isOpen || !unit) return;
    initEquipmentDraftsForUnit(unit);
    initIconDraft(unit);
    initSecondaryClassDraft(unit);
    activeUnitIconModalOpen.value = false;
    activeSquadIconModalOpen.value = false;
  },
  { immediate: true }
);

watch(
  [() => props.show, activeSquadMemberUnit],
  ([isOpen, unit]) => {
    if (!isOpen || !unit) return;
    initIconDraft(unit);
  },
  { immediate: true }
);

watch(
  () => props.show,
  (isOpen, wasOpen) => {
    if (isOpen && !wasOpen) {
      consoleLogCharacterModalOpen();
      activeUnitIconModalOpen.value = false;
      activeSquadIconModalOpen.value = false;
    }
  }
);
</script>

<template>
  <base-modal :show="show" title="自キャラステータス" :wide="true" @close="emit('close')">
    <div class="char-tabs">
      <div class="char-tabs-left">
        <button type="button" class="char-tab-btn" :class="{ active: activeTab === 'character' }" @click="selectTab('character')">キャラクター</button>
        <button type="button" class="char-tab-btn" :class="{ active: activeTab === 'squad' }" @click="selectTab('squad')">部隊</button>
      </div>
      <button type="button" class="secondary char-tabs-close-btn" @click="emit('close')">閉じる</button>
    </div>

    <div v-if="activeTab === 'character'">
      <div v-if="unitList.length" class="char-layout">
        <aside class="char-list">
          <button
            v-for="unit in unitList"
            :key="unit.id"
            type="button"
            class="char-list-item"
            :class="{ active: activeUnit?.id === unit.id, 'with-sub-icon': !!subIconSrcForUnit(unit) }"
            :style="cardSubIconStyle(unit)"
            @click="selectUnit(unit.id)"
          >
            <div class="char-list-line">
              <span class="char-list-name-with-icon">
                <img v-if="iconSrcForUnit(unit)" :src="iconSrcForUnit(unit)" :alt="`${unit.name} アイコン`" class="char-list-icon" />
                <span v-else class="char-list-icon-fallback">{{ iconGlyphForUnit(unit) }}</span>
                <strong>{{ unit.name }}<span v-if="isSovereign(unit)"> ◆</span></strong>
              </span>
              <span>Lv{{ unit.level || "-" }}</span>
            </div>
            <div class="small">種族: {{ unit.race || "-" }} / クラス: {{ unit.className || "-" }} / 役割: {{ unitRoleLabel(unit) }}</div>
          </button>
        </aside>

        <section
          v-if="activeUnit"
          class="char-detail"
          :class="{ 'with-sub-icon': !!subIconSrcForUnit(activeUnit) }"
          :style="cardSubIconStyle(activeUnit)"
        >
          <header class="char-title">
            <div class="char-title-top">
              <h3>{{ activeUnit.name }}</h3>
              <button
                type="button"
                class="char-title-subicon-btn"
                title="サブアイコン変更"
                aria-label="サブアイコン変更"
                :disabled="!iconOptions.length"
                @click="openActiveUnitIconModal"
              >
                <img v-if="subIconSrcForUnit(activeUnit)" :src="subIconSrcForUnit(activeUnit)" :alt="`${activeUnit.name} サブアイコン`" class="char-title-subicon-image" />
                <span v-else class="char-title-subicon-fallback">{{ iconGlyphForUnit(activeUnit) }}</span>
              </button>
            </div>
            <div class="small">
              {{ unitRoleLabel(activeUnit) }}<span v-if="isSovereign(activeUnit)"> / 統治者</span><span v-if="hasSquad(activeUnit)"> / リーダー</span><span v-else-if="activeUnit.squadLeaderId"> / 隊員</span> / Lv{{ activeUnit.level || "-" }} / {{ activeUnit.race || "-" }} / {{ activeUnit.className || "-" }}
            </div>
            <div class="char-actions">
              <button type="button" :disabled="!canPromote(activeUnit)" @click="promoteActiveUnit">モブをネームドへ昇格</button>
              <button type="button" :disabled="!canRemoveMob(activeUnit)" @click="removeActiveMob">モブを削除</button>
            </div>
            <div v-if="testMode" class="test-level-tools">
              <div class="small">テストON: 手動レベル操作</div>
              <div class="test-level-row">
                <button type="button" :disabled="!canLevelDown(activeUnit)" @click="levelUpActiveUnit(-1)">Lv-1</button>
                <button type="button" :disabled="!canLevelUp(activeUnit)" @click="levelUpActiveUnit(1)">Lv+1</button>
              </div>
              <div v-if="isHumanUnit(activeUnit) && unitLevel(activeUnit) >= 10" class="test-level-row">
                <select
                  :value="secondaryClassDraft(activeUnit)"
                  @change="updateSecondaryClassDraft(activeUnit, $event.target.value)"
                >
                  <option
                    v-for="className in secondaryClassOptionsForUnit(activeUnit)"
                    :key="`secondary-class-${activeUnit.id}-${className}`"
                    :value="className"
                  >
                    {{ className }}
                  </option>
                </select>
                <button type="button" :disabled="!secondaryClassDraft(activeUnit)" @click="assignSecondaryClassToActiveUnit">
                  第2クラス取得
                </button>
              </div>
            </div>
          </header>

          <character-unit-detail-panel
            :unit="activeUnit"
            :hide-icon-editor="true"
            @update-unit-icon="emit('update-unit-icon', $event)"
            @update-unit-equipment="emit('update-unit-equipment', $event)"
          />
        </section>
      </div>

      <div v-else class="char-empty">自キャラデータがありません。村配置後にユニット作成からモブを追加してください。</div>
    </div>

    <div v-else>
      <div class="squad-layout">
        <aside class="squad-list-panel">
          <button type="button" class="squad-create-btn" @click="startSquadCreate">部隊を作成</button>
          <div class="small squad-rule-note">既に部隊に所属しているキャラは選べません。</div>
          <div
            v-for="squad in squadList"
            :key="`squad-row-${squad.id}`"
            class="squad-group"
            :class="{ active: isSquadExpanded(squad.id) }"
          >
            <button
              type="button"
              class="squad-list-item"
              :class="{ active: activeSquad?.id === squad.id }"
              @click="selectSquad(squad.id)"
            >
              <div class="move-unit-line">
                <span class="char-list-name-with-icon">
                  <img
                    v-if="squadIconSrcForSquad(squad)"
                    :src="squadIconSrcForSquad(squad)"
                    :alt="`${squad.name || '部隊'} アイコン`"
                    class="char-list-icon"
                  />
                  <span v-else class="char-list-icon-fallback">{{ squadIconGlyphForSquad(squad) }}</span>
                  <strong>{{ squad.name || "無名部隊" }}</strong>
                </span>
                <span>{{ squad.totalMemberCount || (squad.memberIds.length + 1) }}人</span>
              </div>
              <div class="small">リーダー: {{ squad.leaderName || squad.leaderId }}</div>
              <div class="small" v-if="squad.leaderPos">座標: ({{ squad.leaderPos?.x }}, {{ squad.leaderPos?.y }})</div>
              <div class="small squad-expand-hint">{{ isSquadExpanded(squad.id) ? "▾ メンバー" : "▸ メンバー" }}</div>
            </button>

            <div v-if="isSquadExpanded(squad.id)" class="squad-group-member-list">
              <button
                v-for="row in squadMembersForList(squad)"
                :key="`squad-inline-member-${squad.id}-${row.id}`"
                type="button"
                class="squad-inline-member-item"
                :class="{ active: activeSquadMemberId === row.id }"
                @click.stop="selectSquadMemberFromList(squad.id, row.id)"
              >
                <div class="move-unit-line">
                  <span class="char-list-name-with-icon">
                    <img v-if="iconSrcForUnit(row.unit)" :src="iconSrcForUnit(row.unit)" :alt="`${row.name} アイコン`" class="char-list-icon" />
                    <span v-else class="char-list-icon-fallback">{{ iconGlyphForUnit(row.unit) }}</span>
                    <strong>{{ row.name }}</strong>
                  </span>
                  <span>Lv{{ row.unit?.level || "-" }}</span>
                </div>
                <div class="small">{{ row.role }} / {{ row.unit?.race || "-" }} / {{ row.unit?.className || "-" }}</div>
              </button>
            </div>
          </div>
          <div v-if="!squadList.length" class="small squad-empty-note">部隊はまだありません。</div>
        </aside>

        <section class="squad-detail-panel">
          <div v-if="creatingSquad" class="squad-create-wizard">
            <h3>部隊作成</h3>
            <div class="small">手順: リーダー選択 → メンバー選択 → 名前決定</div>

            <div v-if="createStep === 'leader'">
              <h4>1. リーダーを選択</h4>
              <div class="small">部隊未所属のユニットのみ表示されます。</div>
              <div class="squad-candidate-grid">
                <button
                  v-for="unit in leaderCandidates"
                  :key="`leader-candidate-${unit.id}`"
                  type="button"
                  class="squad-candidate-item"
                  :class="{ active: draftLeaderId === unit.id }"
                  @click="chooseDraftLeader(unit.id)"
                >
                  <strong>{{ unit.name }}</strong>
                  <div class="small">{{ unit.race || "-" }} / {{ unit.className || "-" }} / 座標({{ unit.x }}, {{ unit.y }})</div>
                </button>
              </div>
              <div v-if="!leaderCandidates.length" class="small squad-empty-note">候補がいません（全員が部隊所属中か、座標未確定）。</div>
            </div>

            <div v-else-if="createStep === 'members'">
              <h4>2. メンバーを選択</h4>
              <div class="small">リーダー: {{ draftLeader?.name || "-" }} / 同座標({{ draftLeader?.x }}, {{ draftLeader?.y }})の未所属ユニットのみ選択可能</div>
              <div class="small">選択数: {{ draftMemberIds.length }} / {{ MAX_SQUAD_MEMBER_COUNT }}</div>
              <div class="squad-candidate-grid">
                <button
                  v-for="unit in memberCandidates"
                  :key="`member-candidate-${unit.id}`"
                  type="button"
                  class="squad-candidate-item"
                  :class="{ active: draftMemberIds.includes(unit.id) }"
                  @click="toggleDraftMember(unit.id)"
                >
                  <strong>{{ unit.name }}</strong>
                  <div class="small">{{ unit.race || "-" }} / {{ unit.className || "-" }} / 索敵 {{ unit.scoutRange || 0 }}</div>
                </button>
              </div>
              <div v-if="!memberCandidates.length" class="small squad-empty-note">同じ場所にいる未所属ユニットがいません。</div>
            </div>

            <div v-else>
              <h4>3. 部隊名を決定</h4>
              <div class="small">未入力なら {{ generateDefaultSquadName() }} が使われます。</div>
              <input v-model.trim="draftSquadName" type="text" maxlength="24" class="squad-name-input" :placeholder="generateDefaultSquadName()" />
              <div class="small">リーダー: {{ draftLeader?.name || "-" }} / メンバー: {{ draftMemberIds.length }}名</div>
            </div>

            <div class="squad-action-row">
              <button type="button" class="secondary" @click="cancelSquadCreate">キャンセル</button>
              <button v-if="createStep !== 'leader'" type="button" class="secondary" @click="moveCreateStepBack">戻る</button>
              <button
                v-if="createStep !== 'name'"
                type="button"
                class="secondary"
                :disabled="createStep === 'leader' ? !draftLeader : !draftMemberIds.length"
                @click="moveCreateStepNext"
              >
                次へ
              </button>
              <button
                v-else
                type="button"
                class="secondary"
                :disabled="!draftLeader || !draftMemberIds.length"
                @click="completeSquadCreate"
              >
                作成完了
              </button>
            </div>
          </div>

          <div v-else-if="activeSquad" class="squad-detail">
            <div class="char-title-top">
              <h3>{{ activeSquad.name || "無名部隊" }}</h3>
              <button
                type="button"
                class="char-title-subicon-btn"
                title="部隊アイコン変更"
                aria-label="部隊アイコン変更"
                :disabled="!iconOptions.length"
                @click="openActiveSquadIconModal"
              >
                <img
                  v-if="squadIconSrcForSquad(activeSquad)"
                  :src="squadIconSrcForSquad(activeSquad)"
                  :alt="`${activeSquad.name || '部隊'} アイコン`"
                  class="char-title-subicon-image"
                />
                <span v-else class="char-title-subicon-fallback">{{ squadIconGlyphForSquad(activeSquad) }}</span>
              </button>
            </div>
            <div class="small">リーダー: {{ activeSquad.leaderName || activeSquad.leaderId }} / 座標: ({{ activeSquad.leaderPos?.x }}, {{ activeSquad.leaderPos?.y }})</div>
            <div class="small">
              索敵: {{ roundTo1(activeSquad.scoutValue) }}（最高索敵 + 各員索敵/5） /
              隠密: {{ roundTo1(activeSquad.stealthValue) }}（合計隠密 ÷ 人数×0.75）
            </div>

            <div class="squad-rename-row">
              <input v-model.trim="renameInput" type="text" maxlength="24" class="squad-name-input" placeholder="部隊名" />
              <button type="button" class="secondary" :disabled="!renameInput" @click="applyRenameSquad">部隊名変更</button>
              <button type="button" class="secondary danger" @click="dissolveSquad">部隊を解除</button>
            </div>

            <section
              v-if="activeSquadMemberUnit"
              class="char-detail squad-member-detail"
              :class="{ 'with-sub-icon': !!subIconSrcForUnit(activeSquadMemberUnit) }"
              :style="cardSubIconStyle(activeSquadMemberUnit)"
            >
              <header class="char-title">
                <h3>{{ activeSquadMemberUnit.name }}</h3>
                <div class="small">
                  {{ unitRoleLabel(activeSquadMemberUnit) }} / Lv{{ activeSquadMemberUnit.level || "-" }} / {{ activeSquadMemberUnit.race || "-" }} / {{ activeSquadMemberUnit.className || "-" }}
                </div>
                <div class="small">座標: ({{ activeSquadMemberUnit.x }}, {{ activeSquadMemberUnit.y }}) / 索敵: {{ activeSquadMemberUnit.scoutRange || 0 }}</div>
              </header>
              <character-unit-detail-panel
                :unit="activeSquadMemberUnit"
                :hide-icon-editor="true"
                @update-unit-icon="emit('update-unit-icon', $event)"
                @update-unit-equipment="emit('update-unit-equipment', $event)"
              />
            </section>
            <div v-else class="char-empty">左の部隊メンバーを選択してください。</div>
          </div>

          <div v-else class="char-empty">部隊がありません。左の「部隊を作成」から開始してください。</div>
        </section>
      </div>
    </div>
  </base-modal>

  <base-modal
    :show="show && activeUnitIconModalOpen"
    title="サブアイコン変更"
    @close="closeActiveUnitIconModal"
  >
    <div class="subicon-modal-head">
      <span class="small">対象: {{ activeUnit?.name || "-" }}</span>
      <span class="small">選択中: {{ activeUnitIconModalDraft || "-" }}</span>
    </div>
    <div class="subicon-modal-current">
      <img :src="iconSrcByName(activeUnitIconModalDraft)" :alt="`選択中アイコン ${activeUnitIconModalDraft}`" />
    </div>
    <div class="subicon-modal-grid">
      <button
        v-for="row in iconOptions"
        :key="`subicon-modal-${activeUnit?.id || 'none'}-${row.name}`"
        type="button"
        class="subicon-modal-item"
        :class="{ active: activeUnitIconModalDraft === row.name }"
        :title="row.name"
        @click="selectActiveUnitModalIcon(row.name)"
      >
        <img :src="row.src" :alt="row.name" />
      </button>
    </div>
    <div class="subicon-modal-actions">
      <button type="button" class="secondary" :disabled="!activeUnit || !iconOptions.length" @click="applyActiveUnitIconModal">変更する</button>
      <button type="button" class="secondary" @click="closeActiveUnitIconModal">閉じる</button>
    </div>
  </base-modal>

  <base-modal
    :show="show && activeSquadIconModalOpen"
    title="部隊アイコン変更"
    @close="closeActiveSquadIconModal"
  >
    <div class="subicon-modal-head">
      <span class="small">対象: {{ activeSquad?.name || "-" }}</span>
      <span class="small">選択中: {{ activeSquadIconModalDraft || "-" }}</span>
    </div>
    <div class="subicon-modal-current">
      <img :src="iconSrcByName(activeSquadIconModalDraft)" :alt="`選択中アイコン ${activeSquadIconModalDraft}`" />
    </div>
    <div class="subicon-modal-grid">
      <button
        v-for="row in iconOptions"
        :key="`squad-icon-modal-${activeSquad?.id || 'none'}-${row.name}`"
        type="button"
        class="subicon-modal-item"
        :class="{ active: activeSquadIconModalDraft === row.name }"
        :title="row.name"
        @click="selectActiveSquadModalIcon(row.name)"
      >
        <img :src="row.src" :alt="row.name" />
      </button>
    </div>
    <div class="subicon-modal-actions">
      <button type="button" class="secondary" :disabled="!activeSquad || !iconOptions.length" @click="applyActiveSquadIconModal">変更する</button>
      <button type="button" class="secondary" @click="closeActiveSquadIconModal">閉じる</button>
    </div>
  </base-modal>
</template>

<style scoped src="./CharacterDetailShared.css"></style>

<style scoped>
:deep(.modal-card.modal-card-wide) {
  width: min(1120px, calc(100vw - 24px));
  /* height: min(860px, calc(100vh - 24px)); */
  max-height: min(860px, calc(100vh - 24px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:deep(.modal-body) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

:deep(.modal-head) {
  display: none;
}

.char-tabs {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.char-tabs-left {
  display: flex;
  gap: 8px;
}

.char-tab-btn {
  border: 1px solid rgba(178, 145, 95, 0.85);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #2d2418;
  padding: 5px 12px;
  font-weight: 700;
}

.char-tab-btn.active {
  background: linear-gradient(165deg, rgba(238, 218, 181, 0.98), rgba(228, 202, 160, 0.96));
}

.char-tabs-close-btn {
  padding: 5px 12px;
}

.char-layout,
.squad-layout {
  --char-panel-max-height: min(68vh, 720px);
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: 0px;
  align-items: start;
  max-height: var(--char-panel-max-height);
  overflow: hidden;
}

.char-list,
.squad-list-panel {
  border: 1px solid rgba(206, 180, 135, 0.78);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  padding: 4px;
  display: grid;
  gap: 7px;
  align-content: start;
  min-height: 0;
}

.char-list {
  max-height: var(--char-panel-max-height);
  overflow: auto;
  overscroll-behavior: contain;
}

.char-note {
  border: 1px solid rgba(201, 173, 129, 0.62);
  border-radius: 8px;
  padding: 6px 8px;
  background: rgba(247, 240, 228, 0.9);
}

.char-list-item,
.squad-list-item,
.squad-candidate-item {
  width: 100%;
  border: 1px solid rgba(197, 168, 124, 0.8);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  color: #2d2418;
  padding: 4px;
  text-align: left;
}

.squad-group {
  display: grid;
  gap: 4px;
}

.squad-group-member-list {
  display: grid;
  gap: 4px;
  padding-left: 14px;
  border-left: 2px solid rgba(178, 149, 102, 0.48);
}

.squad-inline-member-item {
  width: 100%;
  border: 1px solid rgba(197, 168, 124, 0.62);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #2d2418;
  padding: 4px;
  text-align: left;
}

.squad-inline-member-item.active {
  border-color: rgba(95, 134, 72, 0.9);
  background: linear-gradient(165deg, rgba(221, 242, 199, 0.96), rgba(195, 227, 162, 0.94));
}

.squad-expand-hint {
  margin-top: 2px;
  color: #6f5932;
  font-size: 0.62rem;
}

.char-list-item,
.char-detail,
.squad-member-detail {
  position: relative;
  overflow: hidden;
}

.with-sub-icon::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: var(--card-sub-icon-image, none);
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 76px 76px;
  opacity: 0.15;
  pointer-events: none;
}

.with-sub-icon > * {
  position: relative;
  z-index: 1;
}

.char-detail.with-sub-icon::after {
  background-size: 160px 160px;
  opacity: 0.11;
}

.squad-member-detail.with-sub-icon::after {
  background-size: 92px 92px;
  opacity: 0.13;
}

.char-list-item.active,
.squad-list-item.active,
.squad-candidate-item.active {
  border-color: rgba(111, 84, 47, 0.9);
  background: linear-gradient(165deg, rgba(238, 218, 181, 0.98), rgba(228, 202, 160, 0.96));
}

.char-detail,
.squad-detail-panel {
  border: 1px solid rgba(206, 180, 135, 0.78);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  padding: 10px;
  display: grid;
  gap: 10px;
  min-height: 0;
}

.char-detail {
  max-height: var(--char-panel-max-height);
  overflow: auto;
  overscroll-behavior: contain;
}

.squad-detail-panel {
  max-height: var(--char-panel-max-height);
  overflow: auto;
  overscroll-behavior: contain;
}

.char-title h3,
.squad-detail h3,
.squad-create-wizard h3 {
  margin: 0;
}

.char-title-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.char-title-subicon-btn {
  border: 1px solid rgba(169, 138, 92, 0.88);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  width: 30px;
  height: 30px;
  padding: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.char-title-subicon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.char-title-subicon-image,
.char-title-subicon-fallback {
  width: 100%;
  height: 100%;
  border-radius: 6px;
}

.char-title-subicon-image {
  object-fit: cover;
}

.char-title-subicon-fallback {
  border: 1px solid rgba(189, 160, 119, 0.7);
  background: rgba(255, 255, 255, 0.7);
  color: #3a2d1a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1;
}

.subicon-modal-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.subicon-modal-current {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}

.subicon-modal-current img {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  border: 1px solid rgba(170, 140, 94, 0.74);
  object-fit: cover;
  background: rgba(255, 255, 255, 0.92);
}

.subicon-modal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(54px, 54px));
  gap: 7px;
  max-height: 240px;
  overflow: auto;
  padding: 2px;
}

.subicon-modal-item {
  width: 54px;
  height: 54px;
  border: 1px solid rgba(170, 140, 94, 0.72);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.92);
  padding: 2px;
  cursor: pointer;
}

.subicon-modal-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 5px;
}

.subicon-modal-item.active {
  border-color: rgba(77, 165, 226, 0.96);
  box-shadow: 0 0 0 1px rgba(91, 198, 255, 0.44);
}

.subicon-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.char-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.char-actions button,
.squad-create-btn,
.squad-action-row button,
.squad-rename-row button {
  border: 1px solid rgba(169, 138, 92, 0.88);
  border-radius: 7px;
  background: linear-gradient(180deg, rgba(248, 228, 192, 0.96), rgba(226, 197, 152, 0.94));
  color: #2d2418;
  padding: 5px 10px;
}

.char-actions button:disabled,
.squad-action-row button:disabled,
.squad-rename-row button:disabled {
  opacity: 0.5;
}

.test-level-tools {
  border: 1px solid rgba(206, 180, 135, 0.7);
  border-radius: 8px;
  padding: 4px;
  background: rgba(255, 255, 255, 0.62);
  display: grid;
  gap: 6px;
}

.test-level-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.test-level-row select {
  min-width: 180px;
  border: 1px solid rgba(186, 160, 112, 0.9);
  border-radius: 6px;
  padding: 4px 6px;
  background: #fffdf8;
}

.char-status-grid.mini {
  margin-top: 8px;
}

.acquired-skills-line {
  margin-top: 6px;
}

.icon-edit-row.mini {
  margin-top: 8px;
}

.equipment-read-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 6px;
}

.equipment-read-item {
  border: 1px solid rgba(206, 180, 135, 0.62);
  border-radius: 7px;
  padding: 5px 7px;
  background: rgba(255, 255, 255, 0.82);
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.75rem;
}

.char-empty {
  border: 1px dashed rgba(189, 160, 119, 0.84);
  border-radius: 9px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.65);
}

.char-list-line,
.move-unit-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.char-list-name-with-icon {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.char-list-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  object-fit: cover;
  /* border: 1px solid rgba(189, 160, 119, 0.68);
  background: rgba(255, 255, 255, 0.65); */
}

.char-list-icon-fallback {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  /* border: 1px solid rgba(189, 160, 119, 0.68);
  background: rgba(255, 255, 255, 0.65); */
  color: #3a2d1a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1;
}

.squad-rule-note,
.squad-empty-note {
  color: #5f4b2b;
}

.squad-candidate-grid {
  display: grid;
  gap: 7px;
  max-height: 260px;
  overflow: auto;
  margin-top: 8px;
}

.squad-create-wizard {
  display: grid;
  gap: 8px;
}

.squad-action-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.squad-name-input {
  width: 100%;
  border: 1px solid rgba(170, 140, 94, 0.86);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  color: #2d2418;
  padding: 7px 9px;
}

.squad-rename-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.squad-rename-row .danger {
  border-color: rgba(161, 84, 73, 0.82);
}

.squad-member-select {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.squad-member-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(177, 145, 98, 0.86);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #2d2418;
  padding: 4px 10px;
  font-size: 0.8rem;
}

.squad-member-chip-icon {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  object-fit: cover;
  border: 1px solid rgba(189, 160, 119, 0.68);
  background: rgba(255, 255, 255, 0.65);
}

.squad-member-chip-icon-fallback {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid rgba(189, 160, 119, 0.68);
  background: rgba(255, 255, 255, 0.65);
  color: #3a2d1a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1;
}

.squad-member-chip.active {
  border-color: rgba(95, 134, 72, 0.9);
  background: linear-gradient(165deg, rgba(221, 242, 199, 0.96), rgba(195, 227, 162, 0.94));
}

.squad-member-detail {
  min-height: 0;
}

.squad-member-block {
  display: grid;
  gap: 6px;
}

@media (max-width: 1px) {
  .char-layout,
  .squad-layout {
    --char-panel-max-height: min(72vh, 760px);
    grid-template-columns: 1fr;
  }

  .squad-rename-row {
    grid-template-columns: 1fr;
  }

  .equipment-read-list {
    grid-template-columns: 1fr;
  }
}
</style>
