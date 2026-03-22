<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import { getIconSrcByName, hasIconName } from "../lib/icon-library.js";
import equipmentDb from "../../../data/source/export/json/装備.json";
import consumptionDb from "../../../data/source/export/json/消費量.json";

const props = defineProps({
  show: { type: Boolean, default: false },
  village: { type: Object, default: null },
  smithLevel: { type: Number, default: 0 },
  craftUsageState: { type: Object, default: null },
  enchantUsageState: { type: Object, default: null },
  allowCraftInPickerMode: { type: Boolean, default: false },
  craftWeaponHandler: { type: Function, default: null },
  craftCostHandler: { type: Function, default: null },
  enchantOptionsHandler: { type: Function, default: null },
  enchantApplyHandler: { type: Function, default: null },
  pickerMode: { type: Boolean, default: false },
  filterSlotKey: { type: String, default: "" }
});

const emit = defineEmits(["close", "craft-weapon", "select-item", "apply-enchant"]);

const GRID_COLUMNS = 10;
const MIN_GRID_SLOTS = 60;
const CATEGORY_DEFS = [
  { key: "all", label: "すべて" },
  { key: "weapon", label: "武器" },
  { key: "armor", label: "防具" },
  { key: "accessory", label: "装飾" },
  { key: "other", label: "その他" }
];
const CRAFT_TYPE_DEFS = [
  { key: "weapon", label: "武器" },
  { key: "armor", label: "防具" }
];
const WEAPON_EQUIPMENT_NAMES = ["短剣", "剣", "長剣", "槍", "斧", "戦槌", "棍棒", "弓", "銃", "杖"];
const SHIELD_EQUIPMENT_NAMES = ["盾", "大盾"];
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const EQUIPMENT_LEVEL_BY_RARITY = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5
};
const RARITY_REQUIRED_LEVEL = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5
};
const RARITY_LABELS = {
  common: "コモン",
  uncommon: "アンコモン",
  rare: "レア",
  epic: "エピック",
  legendary: "レジェンダリー"
};
const RARITY_MULTIPLIERS = {
  common: 1.0,
  uncommon: 1.25,
  rare: 1.5,
  epic: 1.75,
  legendary: 2.0
};
const MATERIAL_RESOURCE_KEYS = ["木材", "黒木", "特木", "石材", "鉄", "銀鉄", "青金鋼", "赤黒鋼", "金", "銀", "宝石"];
const EQUIPMENT_CRAFT_FALLBACK_BY_LEVEL = {
  1: { 木材: 10, 黒木: 0, 特木: 0, 鉄: 10, 銀鉄: 0, 青金鋼: 0, 赤黒鋼: 0 },
  2: { 木材: 20, 黒木: 0, 特木: 0, 鉄: 20, 銀鉄: 0, 青金鋼: 0, 赤黒鋼: 0 },
  3: { 木材: 10, 黒木: 10, 特木: 0, 鉄: 10, 銀鉄: 10, 青金鋼: 0, 赤黒鋼: 0 },
  4: { 木材: 10, 黒木: 20, 特木: 10, 鉄: 10, 銀鉄: 20, 青金鋼: 5, 赤黒鋼: 5 }
};
const RARITY_ALIAS_MAP = {
  コモン: "common",
  アンコモン: "uncommon",
  レア: "rare",
  エピック: "epic",
  レジェンダリー: "legendary"
};

const activeCategory = ref("all");
const activeRightPane = ref("detail");
const selectedKey = ref("");
const selectedWeaponName = ref("");
const selectedWeaponRarity = ref("common");
const weaponCraftCount = ref(1);
const selectedCraftType = ref("weapon");
const selectedEnchantName = ref("");
const craftStatusText = ref("");
const enchantStatusText = ref("");
const showEnchantModal = ref(false);
const modalCardWidth = computed(() => "1120px");
const modalCardHeight = computed(() => "700px");
const enchantModalCardWidth = computed(() => "980px");
const enchantModalCardHeight = computed(() => "760px");
const craftPaneEnabled = computed(() => !props.pickerMode || !!props.allowCraftInPickerMode);

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function toSafeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeRarity(value) {
  const text = nonEmptyText(value);
  if (!text) return "common";
  const lower = text.toLowerCase();
  if (RARITY_ORDER.includes(lower)) return lower;
  return RARITY_ALIAS_MAP[text] || "common";
}

function rarityLabel(value) {
  const key = normalizeRarity(value);
  return RARITY_LABELS[key] || RARITY_LABELS.common;
}

function rarityShort(value) {
  const key = normalizeRarity(value);
  if (key === "legendary") return "L";
  if (key === "epic") return "E";
  if (key === "rare") return "R";
  if (key === "uncommon") return "U";
  return "C";
}

function normalizeEquipmentSlotKey(value) {
  const text = nonEmptyText(value);
  if (!text) return "";
  if (text === "武器") return "武器1";
  return text;
}

function equipmentInventoryKey(name, quality) {
  const eqName = nonEmptyText(name);
  if (!eqName) return "";
  return `${eqName}::${normalizeRarity(quality)}`;
}

function normalizeInventoryRows(village) {
  const source = Array.isArray(village?.equipmentInventory) ? village.equipmentInventory : [];
  const map = new Map();
  for (const row of source) {
    if (!row || typeof row !== "object") continue;
    const rawItem = row?.item && typeof row.item === "object" ? row.item : row;
    const name = nonEmptyText(rawItem?.name || row?.name || row?.equipmentName);
    if (!name) continue;
    const quality = normalizeRarity(rawItem?.quality || row?.quality || rawItem?.qualityLabel || row?.qualityLabel);
    const key = equipmentInventoryKey(name, quality);
    if (!key) continue;
    const count = Math.max(0, Math.floor(toSafeNumber(row?.count, toSafeNumber(row?.quantity, 1))));
    if (!count) continue;
    const slot = normalizeEquipmentSlotKey(rawItem?.slot) || "";
    const item = {
      ...rawItem,
      name,
      quality,
      qualityLabel: rarityLabel(quality),
      slot
    };
    const prev = map.get(key);
    if (prev) {
      prev.count += count;
      if (!prev.item) prev.item = item;
      continue;
    }
    map.set(key, {
      key,
      name,
      quality,
      qualityLabel: rarityLabel(quality),
      count,
      item
    });
  }
  return Array.from(map.values())
    .filter(row => row.count > 0)
    .sort((a, b) => {
      const rarityDiff = RARITY_ORDER.indexOf(b.quality) - RARITY_ORDER.indexOf(a.quality);
      if (rarityDiff !== 0) return rarityDiff;
      return nonEmptyText(a.name).localeCompare(nonEmptyText(b.name), "ja");
    });
}

function slotCategory(row) {
  const slot = normalizeEquipmentSlotKey(row?.item?.slot || row?.slot);
  if (slot === "武器1" || slot === "武器2") return "weapon";
  if (slot === "頭" || slot === "体" || slot === "足") return "armor";
  if (slot === "装飾1" || slot === "装飾2") return "accessory";
  return "other";
}

function resolveEquipmentSlotCandidates(row) {
  const explicit = normalizeEquipmentSlotKey(row?.装備部位);
  if (explicit === "武器1") return ["武器1", "武器2"];
  if (explicit) return [explicit];
  const name = nonEmptyText(row?.装備名);
  if (!name) return [];
  if (SHIELD_EQUIPMENT_NAMES.includes(name)) return ["武器2"];
  if (WEAPON_EQUIPMENT_NAMES.includes(name)) return ["武器1", "武器2"];
  if (/(指輪|リング|首飾|首輪|護符|ペンダント|装飾)/.test(name)) {
    return ["装飾1", "装飾2"];
  }
  if (/(兜|ヘルム|帽|頭)/.test(name)) return ["頭"];
  if (/(鎧|ローブ|服|法衣|胸当|体)/.test(name)) return ["体"];
  if (/(靴|ブーツ|足)/.test(name)) return ["足"];
  return [];
}

function isWeaponEquipmentRow(row) {
  const slots = resolveEquipmentSlotCandidates(row);
  return slots.includes("武器1") || slots.includes("武器2");
}

function isArmorEquipmentRow(row) {
  const slots = resolveEquipmentSlotCandidates(row);
  return slots.includes("頭") || slots.includes("体") || slots.includes("足");
}

function categoryCount(rows, categoryKey) {
  if (categoryKey === "all") return rows.length;
  return rows.filter(row => slotCategory(row) === categoryKey).length;
}

function filterRowsByCategory(rows, categoryKey) {
  if (categoryKey === "all") return rows;
  return rows.filter(row => slotCategory(row) === categoryKey);
}

function itemIconSrc(row) {
  const item = row?.item && typeof row.item === "object" ? row.item : row;
  const directName = nonEmptyText(item?.iconName || item?.name || row?.name);
  if (directName && hasIconName(directName)) return getIconSrcByName(directName, directName);
  return "";
}

function itemGlyph(row) {
  const name = nonEmptyText(row?.name || row?.item?.name);
  if (!name) return "?";
  const chars = Array.from(name);
  return chars[0] || "?";
}

function formatEnchantCostAmount(value) {
  const num = toSafeNumber(value, 0);
  if (!Number.isFinite(num) || num <= 0) return "0";
  const rounded = Math.round(num * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.001) return String(Math.round(rounded));
  return rounded.toFixed(1);
}

function enchantCostIconInfo(nameRaw) {
  const name = nonEmptyText(nameRaw);
  if (!name) return { iconSrc: "", glyph: "?" };
  if (hasIconName(name)) {
    return { iconSrc: getIconSrcByName(name, name), glyph: "" };
  }
  const chars = Array.from(name);
  return { iconSrc: "", glyph: chars[0] || "?" };
}

function rarityClass(row) {
  return `rarity-${normalizeRarity(row?.quality || row?.item?.quality)}`;
}

function findEquipmentRowByName(nameRaw) {
  const name = nonEmptyText(nameRaw);
  if (!name || !Array.isArray(equipmentDb)) return null;
  return equipmentDb.find(row => nonEmptyText(row?.装備名) === name) || null;
}

function inventoryRowMatchesSlot(row, slotKeyRaw) {
  const slotKey = normalizeEquipmentSlotKey(slotKeyRaw);
  if (!slotKey) return true;
  if (!row || typeof row !== "object") return false;
  const item = row?.item && typeof row.item === "object" ? row.item : row;
  const itemName = nonEmptyText(item?.name || row?.name);
  const dbRow = findEquipmentRowByName(itemName);
  if (dbRow) return resolveEquipmentSlotCandidates(dbRow).includes(slotKey);
  const itemSlot = normalizeEquipmentSlotKey(item?.slot || row?.slot);
  if (!itemSlot) return true;
  if (itemSlot === "武器1") return slotKey === "武器1" || slotKey === "武器2";
  return itemSlot === slotKey;
}

function plainValueText(value, fallback = "0") {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return String(Math.round(num));
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

function scaleCriticalPower(baseValue, multiplier) {
  const base = Math.max(0, Math.round(toSafeNumber(baseValue, 0)));
  const top = Math.floor(base / 100) * 100;
  const tail = base % 100;
  return top + Math.round(tail * Math.max(0, toSafeNumber(multiplier, 1)));
}

function roundTo1(value) {
  return Math.round(toSafeNumber(value, 0) * 10) / 10;
}

function buildEmptyMaterialCost() {
  return MATERIAL_RESOURCE_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function resolveEquipmentCraftLevel(rarityKey) {
  const rarity = normalizeRarity(rarityKey);
  return Math.max(1, Math.floor(toSafeNumber(EQUIPMENT_LEVEL_BY_RARITY[rarity], 1)));
}

function normalizeMaterialCostBag(input) {
  const src = input && typeof input === "object" ? input : {};
  const out = buildEmptyMaterialCost();
  for (const key of MATERIAL_RESOURCE_KEYS) {
    out[key] = roundTo1(Math.max(0, toSafeNumber(src[key], 0)));
  }
  return out;
}

function multiplyMaterialCostBag(input, multiplier = 1) {
  const times = Math.max(1, Math.floor(toSafeNumber(multiplier, 1)));
  const out = buildEmptyMaterialCost();
  for (const key of MATERIAL_RESOURCE_KEYS) {
    out[key] = roundTo1(Math.max(0, toSafeNumber(input?.[key], 0) * times));
  }
  return out;
}

function buildFallbackCraftMaterialCost(row, rarityKey, count = 1) {
  const level = resolveEquipmentCraftLevel(rarityKey);
  const baseRow = (Array.isArray(consumptionDb) ? consumptionDb : []).find(item => (
    nonEmptyText(item?.種別) === "装備" && Math.floor(toSafeNumber(item?.Lv, 0)) === level
  )) || null;
  let material = buildEmptyMaterialCost();
  if (baseRow) {
    const woodRatioRaw = Math.max(0, toSafeNumber(row?.木材, 0));
    const oreRatioRaw = Math.max(0, toSafeNumber(row?.鉱石, 0));
    const hasRatio = woodRatioRaw > 0 || oreRatioRaw > 0;
    const woodScale = hasRatio ? woodRatioRaw : 1;
    const oreScale = hasRatio ? oreRatioRaw : 1;
    const woodKeys = ["木材", "黒木", "特木"];
    const oreKeys = ["鉄", "銀鉄", "青金鋼", "赤黒鋼"];
    for (const key of woodKeys) {
      material[key] = roundTo1(Math.max(0, toSafeNumber(baseRow?.[key], 0) * woodScale));
    }
    for (const key of oreKeys) {
      material[key] = roundTo1(Math.max(0, toSafeNumber(baseRow?.[key], 0) * oreScale));
    }
  } else {
    const fallbackLevel = Math.max(1, Math.min(4, level));
    material = normalizeMaterialCostBag(EQUIPMENT_CRAFT_FALLBACK_BY_LEVEL[fallbackLevel]);
  }
  return multiplyMaterialCostBag(material, count);
}

function buildEquipmentDetailRows(item) {
  if (!item || typeof item !== "object") return [];
  const rows = [];
  const power = Number(item?.power);
  const guard = Number(item?.guard);
  const criticalRate = Number(item?.criticalRate);
  const criticalPower = Number(item?.criticalPower);
  rows.push({
    label: "威/守",
    value: `${plainValueText(power)}/${plainValueText(guard)}`
  });
  const physicalRes = Number(item?.resistanceBonus?.["物理耐性"]);
  const magicRes = Number(item?.resistanceBonus?.["魔法耐性"]);
  if (Math.round(physicalRes || 0) !== 0 || Math.round(magicRes || 0) !== 0) {
    rows.push({
      label: "物/魔耐",
      value: `${plainValueText(physicalRes)}/${plainValueText(magicRes)}`
    });
  }
  rows.push({ label: "Cr率", value: plainValueText(criticalRate) });
  rows.push({ label: "Cr威力", value: plainValueText(criticalPower) });
  rows.push({ label: "AP", value: equipmentApText(item) });
  return rows;
}

const inventoryRows = computed(() => normalizeInventoryRows(props.village));
const totalItemCount = computed(() => inventoryRows.value.reduce((sum, row) => sum + Math.max(0, Math.floor(toSafeNumber(row?.count, 0))), 0));
const categoryRows = computed(() => filterRowsByCategory(inventoryRows.value, activeCategory.value));
const slotFilteredRows = computed(() => {
  const slotKey = normalizeEquipmentSlotKey(props.filterSlotKey);
  if (!slotKey) return categoryRows.value;
  return categoryRows.value.filter(row => inventoryRowMatchesSlot(row, slotKey));
});
const weaponRows = computed(() => {
  if (!Array.isArray(equipmentDb)) return [];
  return equipmentDb
    .filter(row => nonEmptyText(row?.装備名))
    .filter(row => isWeaponEquipmentRow(row))
    .sort((a, b) => nonEmptyText(a?.装備名).localeCompare(nonEmptyText(b?.装備名), "ja"));
});
const armorRows = computed(() => {
  if (!Array.isArray(equipmentDb)) return [];
  return equipmentDb
    .filter(row => nonEmptyText(row?.装備名))
    .filter(row => isArmorEquipmentRow(row))
    .sort((a, b) => nonEmptyText(a?.装備名).localeCompare(nonEmptyText(b?.装備名), "ja"));
});
const selectedCraftTypeLabel = computed(() => (
  selectedCraftType.value === "armor" ? "防具" : "武器"
));
const craftTargetRows = computed(() => (
  selectedCraftType.value === "armor" ? armorRows.value : weaponRows.value
));
const selectedCraftRow = computed(() => {
  const name = nonEmptyText(selectedWeaponName.value);
  if (!name) return null;
  return craftTargetRows.value.find(row => nonEmptyText(row?.装備名) === name) || null;
});
const craftPreviewItem = computed(() => {
  const row = selectedCraftRow.value;
  if (!row) return null;
  const rarityKey = normalizeRarity(selectedWeaponRarity.value);
  const multiplier = Math.max(0, toSafeNumber(RARITY_MULTIPLIERS[rarityKey], 1));
  const power = Math.round(toSafeNumber(row?.威力, 0) * multiplier);
  const guard = Math.round(toSafeNumber(row?.ガード, 0) * multiplier);
  const criticalRate = Math.round(toSafeNumber(row?.Cr率, 0) * multiplier);
  const criticalPower = scaleCriticalPower(toSafeNumber(row?.Cr威力, 0), multiplier);
  const attackAp = Math.round(toSafeNumber(row?.攻撃AP, 0));
  const magicAp = Math.round(toSafeNumber(row?.魔法AP, 0));
  const baseResistance = Math.round(toSafeNumber(row?.耐性, 0) * multiplier);
  const physicalResistance = Math.round(toSafeNumber(row?.["物理耐性"], 0) * multiplier);
  const magicResistance = Math.round(toSafeNumber(row?.["魔法耐性"], 0) * multiplier);
  return {
    power,
    guard,
    criticalRate,
    criticalPower,
    attackAp,
    magicAp,
    resistanceBonus: {
      "物理耐性": physicalResistance || baseResistance,
      "魔法耐性": magicResistance || baseResistance
    }
  };
});
const craftPreviewStats = computed(() => {
  const item = craftPreviewItem.value;
  return {
    weaponKind: nonEmptyText(selectedWeaponName.value) || "-",
    powerGuard: item ? `${plainValueText(item.power)}/${plainValueText(item.guard)}` : "-",
    ap: item ? equipmentApText(item) : "-",
    criticalRate: item ? plainValueText(item.criticalRate) : "-",
    criticalPower: item ? plainValueText(item.criticalPower) : "-"
  };
});
const smithLevel = computed(() => {
  const fromProp = Math.max(0, Math.floor(toSafeNumber(props?.smithLevel, 0)));
  if (fromProp > 0) return fromProp;
  const raw = toSafeNumber(props?.village?.cityLevels?.["鍛冶場"], 1);
  return Math.max(1, Math.floor(raw));
});
const craftUsageDisplay = computed(() => {
  const source = props?.craftUsageState && typeof props.craftUsageState === "object"
    ? props.craftUsageState
    : {};
  const max = Math.max(0, Math.floor(toSafeNumber(source?.max, 0)));
  const used = Math.max(0, Math.floor(toSafeNumber(source?.used, 0)));
  const remainingRaw = Number(source?.remaining);
  const remaining = Number.isFinite(remainingRaw)
    ? Math.max(0, Math.floor(remainingRaw))
    : Math.max(0, max - used);
  return { max, used, remaining };
});
const hasCraftUsageLimit = computed(() => craftUsageDisplay.value.max > 0);
const availableRarities = computed(() => (
  RARITY_ORDER.filter(key => Math.max(1, Math.floor(toSafeNumber(RARITY_REQUIRED_LEVEL[key], 1))) <= smithLevel.value)
));
const canCraftWeapon = computed(() => {
  const name = nonEmptyText(selectedWeaponName.value);
  const rarity = normalizeRarity(selectedWeaponRarity.value);
  const count = Math.max(1, Math.floor(toSafeNumber(weaponCraftCount.value, 1)));
  if (!name) return false;
  if (!availableRarities.value.includes(rarity)) return false;
  return count >= 1;
});
const craftDisabledReason = computed(() => {
  if (!craftTargetRows.value.length) return `${selectedCraftTypeLabel.value}データがありません。`;
  const name = nonEmptyText(selectedWeaponName.value);
  if (!name) return `${selectedCraftTypeLabel.value}が未選択です。`;
  const rarity = normalizeRarity(selectedWeaponRarity.value);
  if (!availableRarities.value.length) return "生成可能なレア度がありません。";
  if (!availableRarities.value.includes(rarity)) {
    return `鍛冶Lv不足（必要Lv${selectedWeaponRarityRequiredLevel.value}）`;
  }
  const count = Math.max(1, Math.floor(toSafeNumber(weaponCraftCount.value, 1)));
  if (count < 1) return "個数は1以上が必要です。";
  if (hasCraftUsageLimit.value && craftUsageDisplay.value.remaining < count) {
    return `作成回数不足（残り ${craftUsageDisplay.value.remaining}/${craftUsageDisplay.value.max}, 必要${count}）`;
  }
  if (!craftCostResult.value.ok && nonEmptyText(craftCostResult.value.reason)) {
    return nonEmptyText(craftCostResult.value.reason);
  }
  return "";
});
const selectedWeaponRarityRequiredLevel = computed(() => {
  const rarity = normalizeRarity(selectedWeaponRarity.value);
  return Math.max(1, Math.floor(toSafeNumber(RARITY_REQUIRED_LEVEL[rarity], 1)));
});
const craftCostResult = computed(() => {
  const equipmentName = nonEmptyText(selectedWeaponName.value);
  if (!equipmentName) return { ok: false, reason: "", materialCost: {} };
  const payload = {
    equipmentName,
    rarity: normalizeRarity(selectedWeaponRarity.value),
    count: Math.max(1, Math.floor(toSafeNumber(weaponCraftCount.value, 1))),
    craftType: nonEmptyText(selectedCraftType.value)
  };
  if (typeof props.craftCostHandler !== "function") {
    const row = findEquipmentRowByName(equipmentName);
    if (!row) return { ok: false, reason: "装備データが見つかりません。", materialCost: {} };
    const isWeapon = isWeaponEquipmentRow(row);
    const isArmor = isArmorEquipmentRow(row);
    if (payload.craftType === "weapon" && !isWeapon) {
      return { ok: false, reason: "武器を選択してください。", materialCost: {} };
    }
    if (payload.craftType === "armor" && !isArmor) {
      return { ok: false, reason: "防具を選択してください。", materialCost: {} };
    }
    return {
      ok: true,
      reason: "",
      materialCost: buildFallbackCraftMaterialCost(row, payload.rarity, payload.count)
    };
  }
  try {
    const result = props.craftCostHandler(payload);
    if (result && typeof result === "object") {
      return {
        ok: result.ok !== false,
        reason: nonEmptyText(result.reason),
        materialCost: result.materialCost && typeof result.materialCost === "object" ? result.materialCost : {}
      };
    }
  } catch (error) {
    return {
      ok: false,
      reason: nonEmptyText(error?.message) || "必要素材の取得に失敗しました。",
      materialCost: {}
    };
  }
  return { ok: false, reason: "", materialCost: {} };
});
const craftCostEntries = computed(() => {
  const source = craftCostResult.value?.materialCost && typeof craftCostResult.value.materialCost === "object"
    ? craftCostResult.value.materialCost
    : {};
  const out = [];
  for (const [name, rawValue] of Object.entries(source)) {
    const value = toSafeNumber(rawValue, 0);
    if (!Number.isFinite(value) || value <= 0) continue;
    const icon = enchantCostIconInfo(name);
    out.push({
      key: `craft-cost-${name}`,
      name: nonEmptyText(name),
      countText: formatEnchantCostAmount(value),
      iconSrc: icon.iconSrc,
      glyph: icon.glyph
    });
  }
  return out;
});

const displaySlots = computed(() => {
  const rows = slotFilteredRows.value;
  const rowCount = Math.max(1, Math.ceil(rows.length / GRID_COLUMNS));
  const totalSlots = Math.max(MIN_GRID_SLOTS, rowCount * GRID_COLUMNS);
  const slots = rows.map(item => ({ key: item.key, item }));
  for (let i = slots.length; i < totalSlots; i += 1) {
    slots.push({ key: `empty-${activeCategory.value}-${i}`, item: null });
  }
  return slots;
});

const selectedItem = computed(() => {
  const key = nonEmptyText(selectedKey.value);
  if (!key) return null;
  return slotFilteredRows.value.find(row => row.key === key) || null;
});
const enchantOptionResult = computed(() => {
  const row = selectedItem.value;
  if (!row || typeof props.enchantOptionsHandler !== "function") {
    return { ok: false, reason: "", options: [] };
  }
  try {
    const result = props.enchantOptionsHandler({
      itemKey: nonEmptyText(row?.key),
      item: row?.item || null,
      equipmentName: nonEmptyText(row?.name),
      quality: nonEmptyText(row?.quality)
    });
    if (Array.isArray(result)) {
      return { ok: true, reason: "", options: result };
    }
    if (result && typeof result === "object") {
      const options = Array.isArray(result.options) ? result.options : [];
      return {
        ok: result.ok !== false,
        reason: nonEmptyText(result.reason),
        options
      };
    }
  } catch (error) {
    return {
      ok: false,
      reason: nonEmptyText(error?.message) || "付与候補の取得に失敗しました。",
      options: []
    };
  }
  return { ok: false, reason: "", options: [] };
});
const enchantOptions = computed(() => {
  return Array.isArray(enchantOptionResult.value?.options)
    ? enchantOptionResult.value.options.filter(row => nonEmptyText(row?.abilityName))
    : [];
});
const selectedEnchantOption = computed(() => {
  const target = nonEmptyText(selectedEnchantName.value);
  if (!target) return null;
  return enchantOptions.value.find(row => nonEmptyText(row?.abilityName) === target) || null;
});
const selectedItemEnchantments = computed(() => {
  const item = selectedItem.value?.item;
  const source = Array.isArray(item?.enchantments) ? item.enchantments : [];
  const names = [];
  for (const row of source) {
    const name = typeof row === "string"
      ? nonEmptyText(row)
      : nonEmptyText(row?.name || row?.abilityName || row?.付与能力);
    if (!name) continue;
    if (names.includes(name)) continue;
    names.push(name);
    if (names.length >= 3) break;
  }
  return names;
});
const enchantModalTitle = computed(() => {
  const row = selectedItem.value;
  if (!row) return "装備付与";
  return `${nonEmptyText(row?.name) || "装備"} [${rarityShort(row?.quality || row?.qualityLabel)}]`;
});
const selectedEnchantCostEntries = computed(() => {
  const option = selectedEnchantOption.value;
  if (!option) return [];
  const out = [];
  const pushFromBag = (bagRaw, groupLabel) => {
    const bag = bagRaw && typeof bagRaw === "object" ? bagRaw : {};
    for (const [name, rawValue] of Object.entries(bag)) {
      const value = toSafeNumber(rawValue, 0);
      if (!Number.isFinite(value) || value <= 0) continue;
      const icon = enchantCostIconInfo(name);
      out.push({
        key: `${groupLabel}-${name}`,
        groupLabel,
        name: nonEmptyText(name),
        value,
        countText: formatEnchantCostAmount(value),
        iconSrc: icon.iconSrc,
        glyph: icon.glyph
      });
    }
  };
  pushFromBag(option?.materialCost, "資材");
  pushFromBag(option?.foodCost, "食料");
  const tools = Array.isArray(option?.requiredTools) ? option.requiredTools : [];
  for (const row of tools) {
    const name = nonEmptyText(row?.name);
    const value = Math.max(1, Math.floor(toSafeNumber(row?.count, 1)));
    if (!name) continue;
    const icon = enchantCostIconInfo(name);
    out.push({
      key: `tool-${name}`,
      groupLabel: "道具",
      name,
      value,
      countText: String(value),
      iconSrc: icon.iconSrc,
      glyph: icon.glyph
    });
  }
  return out;
});
const enchantOpenDisabledReason = computed(() => {
  if (!selectedItem.value) return "付与対象の道具を選択してください。";
  return "";
});
const enchantDisabledReason = computed(() => {
  if (!selectedItem.value) return "付与対象の道具を選択してください。";
  if (enchantOptionResult.value?.reason) return nonEmptyText(enchantOptionResult.value.reason);
  if (!enchantOptions.value.length) return "条件を満たす付与候補がありません。";
  if (!nonEmptyText(selectedEnchantName.value)) return "付与能力を選択してください。";
  const option = selectedEnchantOption.value;
  const usageMax = Math.max(0, Math.floor(toSafeNumber(option?.usageMax, 0)));
  const usageRemaining = Math.max(0, Math.floor(toSafeNumber(option?.usageRemaining, 0)));
  const usageCost = Math.max(1, Math.floor(toSafeNumber(option?.usageCost, 1)));
  if (option && usageMax > 0 && usageRemaining < usageCost) {
    return `${option.usageType || "付与"}回数不足（残り ${usageRemaining}/${usageMax}, 必要${usageCost}）`;
  }
  return "";
});
const selectedItemPickable = computed(() => {
  const item = selectedItem.value;
  if (!item) return false;
  return inventoryRowMatchesSlot(item, props.filterSlotKey);
});

const selectedItemDetailRows = computed(() => {
  return buildEquipmentDetailRows(selectedItem.value?.item);
});

watch(
  () => props.show,
  isOpen => {
    if (!isOpen) return;
    activeCategory.value = "all";
    activeRightPane.value = "detail";
    selectedKey.value = "";
    if (!nonEmptyText(selectedWeaponName.value)) {
      selectedWeaponName.value = nonEmptyText(craftTargetRows.value[0]?.装備名);
    }
    if (!availableRarities.value.includes(selectedWeaponRarity.value)) {
      selectedWeaponRarity.value = availableRarities.value[availableRarities.value.length - 1] || "common";
    }
    craftStatusText.value = "";
    enchantStatusText.value = "";
    selectedEnchantName.value = "";
    showEnchantModal.value = false;
  }
);

watch(
  enchantOptions,
  rows => {
    const current = nonEmptyText(selectedEnchantName.value);
    if (current && rows.some(row => nonEmptyText(row?.abilityName) === current)) return;
    selectedEnchantName.value = nonEmptyText(rows[0]?.abilityName);
  },
  { immediate: true }
);

watch(
  selectedItem,
  item => {
    if (item && activeRightPane.value === "detail") return;
    if (item && !nonEmptyText(selectedKey.value)) {
      activeRightPane.value = "detail";
    }
    if (!item) {
      showEnchantModal.value = false;
    }
  }
);

function setRightPaneMode(mode) {
  const next = nonEmptyText(mode);
  if (!next) return;
  if (next !== "detail" && next !== "craft") return;
  if (next === "craft" && !craftPaneEnabled.value) return;
  activeRightPane.value = next;
}

watch(
  slotFilteredRows,
  rows => {
    const current = nonEmptyText(selectedKey.value);
    if (!current || !rows.some(row => row.key === current)) {
      selectedKey.value = rows[0]?.key || "";
    }
  },
  { immediate: true }
);

watch(
  craftTargetRows,
  rows => {
    const current = nonEmptyText(selectedWeaponName.value);
    if (!current || !rows.some(row => nonEmptyText(row?.装備名) === current)) {
      selectedWeaponName.value = nonEmptyText(rows[0]?.装備名);
    }
  },
  { immediate: true }
);

watch(
  availableRarities,
  rows => {
    const normalized = normalizeRarity(selectedWeaponRarity.value);
    if (!rows.includes(normalized)) {
      selectedWeaponRarity.value = rows[rows.length - 1] || "common";
    }
  },
  { immediate: true }
);

function normalizeWeaponCraftCount() {
  const count = Math.max(1, Math.floor(toSafeNumber(weaponCraftCount.value, 1)));
  weaponCraftCount.value = count;
}

function nudgeWeaponCraftCount(delta = 0) {
  const step = Math.floor(toSafeNumber(delta, 0));
  if (!step) return;
  const next = Math.max(1, Math.floor(toSafeNumber(weaponCraftCount.value, 1)) + step);
  weaponCraftCount.value = next;
}

function applyWeaponCraftResult(result) {
  if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "ok")) {
    if (result.ok) {
      craftStatusText.value = `${selectedCraftTypeLabel.value}生成を実行しました。`;
    } else {
      const reason = nonEmptyText(result?.reason || result?.result?.reason);
      craftStatusText.value = reason ? `${selectedCraftTypeLabel.value}生成失敗: ${reason}` : `${selectedCraftTypeLabel.value}生成失敗`;
    }
    return true;
  }
  return false;
}

function submitPickItem() {
  if (!selectedItem.value || !selectedItemPickable.value) {
    craftStatusText.value = "装備選択不可: スロットに対応する在庫を選択してください。";
    return;
  }
  emit("select-item", {
    equipmentName: nonEmptyText(selectedItem.value?.name),
    rarity: normalizeRarity(selectedItem.value?.quality || selectedItem.value?.qualityLabel),
    key: nonEmptyText(selectedItem.value?.key)
  });
}

function submitWeaponCraft() {
  normalizeWeaponCraftCount();
  const reason = nonEmptyText(craftDisabledReason.value);
  if (reason || !canCraftWeapon.value) {
    craftStatusText.value = reason ? `${selectedCraftTypeLabel.value}生成不可: ${reason}` : `${selectedCraftTypeLabel.value}生成不可: 条件を確認してください。`;
    return;
  }
  const payload = {
    equipmentName: nonEmptyText(selectedWeaponName.value),
    rarity: normalizeRarity(selectedWeaponRarity.value),
    count: Math.max(1, Math.floor(toSafeNumber(weaponCraftCount.value, 1))),
    craftType: nonEmptyText(selectedCraftType.value)
  };
  if (typeof props.craftWeaponHandler === "function") {
    try {
      const result = props.craftWeaponHandler(payload);
      if (result && typeof result?.then === "function") {
        craftStatusText.value = `${selectedCraftTypeLabel.value}生成を実行中...`;
        result
          .then(resolved => {
            if (!applyWeaponCraftResult(resolved)) {
              craftStatusText.value = `${selectedCraftTypeLabel.value}生成を実行しました。`;
            }
          })
          .catch(error => {
            const reason = nonEmptyText(error?.message);
            craftStatusText.value = reason ? `${selectedCraftTypeLabel.value}生成失敗: ${reason}` : `${selectedCraftTypeLabel.value}生成失敗`;
          });
        return;
      }
      if (applyWeaponCraftResult(result)) {
        return;
      }
    } catch (error) {
      const reason = nonEmptyText(error?.message);
      craftStatusText.value = reason ? `${selectedCraftTypeLabel.value}生成失敗: ${reason}` : `${selectedCraftTypeLabel.value}生成失敗`;
      return;
    }
  }
  emit("craft-weapon", payload);
  craftStatusText.value = `${selectedCraftTypeLabel.value}生成を送信しました。`;
}

function applyEnchantResult(result) {
  if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "ok")) {
    if (result.ok) {
      enchantStatusText.value = "付与を実行しました。";
    } else {
      const reason = nonEmptyText(result?.reason || result?.result?.reason);
      enchantStatusText.value = reason ? `付与失敗: ${reason}` : "付与失敗";
    }
    return true;
  }
  return false;
}

function openEnchantModal() {
  if (!selectedItem.value) {
    enchantStatusText.value = "付与対象の道具を選択してください。";
    return;
  }
  if (!nonEmptyText(selectedEnchantName.value)) {
    selectedEnchantName.value = nonEmptyText(enchantOptions.value[0]?.abilityName);
  }
  enchantStatusText.value = "";
  showEnchantModal.value = true;
}

function closeEnchantModal() {
  showEnchantModal.value = false;
}

function selectEnchantOption(nameRaw) {
  selectedEnchantName.value = nonEmptyText(nameRaw);
}

function submitEnchant() {
  const row = selectedItem.value;
  const enchantName = nonEmptyText(selectedEnchantName.value);
  if (!row || !enchantName) {
    enchantStatusText.value = nonEmptyText(enchantDisabledReason.value) || "付与不可: 条件を確認してください。";
    return;
  }
  const payload = {
    itemKey: nonEmptyText(row?.key),
    enchantName,
    equipmentName: nonEmptyText(row?.name),
    quality: nonEmptyText(row?.quality)
  };
  if (typeof props.enchantApplyHandler === "function") {
    try {
      const result = props.enchantApplyHandler(payload);
      if (result && typeof result?.then === "function") {
        enchantStatusText.value = "付与を実行中...";
        result
          .then(resolved => {
            if (!applyEnchantResult(resolved)) {
              enchantStatusText.value = "付与を実行しました。";
            }
          })
          .catch(error => {
            const reason = nonEmptyText(error?.message);
            enchantStatusText.value = reason ? `付与失敗: ${reason}` : "付与失敗";
          });
        return;
      }
      if (applyEnchantResult(result)) return;
    } catch (error) {
      const reason = nonEmptyText(error?.message);
      enchantStatusText.value = reason ? `付与失敗: ${reason}` : "付与失敗";
      return;
    }
  }
  emit("apply-enchant", payload);
  enchantStatusText.value = "付与を送信しました。";
}
</script>

<template>
  <div
    class="equipment-modal-wrap"
    :style="{ '--equipment-modal-width': modalCardWidth, '--equipment-modal-height': modalCardHeight }"
  >
    <base-modal :show="show" title="道具一覧" @close="emit('close')">
      <section class="equipment-inventory-root">
      <header class="inventory-head">
        <div class="inventory-tabs" role="tablist" aria-label="装備カテゴリ">
          <button
            v-for="cat in CATEGORY_DEFS"
            :key="`inv-cat-${cat.key}`"
            type="button"
            class="inventory-tab"
            :class="{ active: activeCategory === cat.key }"
            @click="activeCategory = cat.key"
          >
            {{ cat.label }} ({{ categoryCount(inventoryRows, cat.key) }})
          </button>
        </div>
        <div class="small inventory-summary">
          種類 {{ inventoryRows.length }} / 合計 {{ totalItemCount }}
        </div>
      </header>

      <div class="inventory-layout">
        <section class="inventory-grid-pane">
          <div class="inventory-grid">
            <button
              v-for="slot in displaySlots"
              :key="`inv-slot-${slot.key}`"
              type="button"
              class="inventory-slot"
              :class="[
                slot.item ? 'filled' : 'empty',
                slot.item ? rarityClass(slot.item) : '',
                slot.item && selectedKey === slot.item.key ? 'active' : ''
              ]"
              :disabled="!slot.item"
              :title="slot.item ? `${slot.item.name} [${rarityLabel(slot.item?.quality || slot.item?.qualityLabel)}] x${slot.item.count}` : ''"
              @click="slot.item && (selectedKey = slot.item.key)"
            >
              <template v-if="slot.item">
                <img
                  v-if="itemIconSrc(slot.item)"
                  :src="itemIconSrc(slot.item)"
                  :alt="slot.item.name"
                  class="inventory-slot-icon"
                />
                <span v-else class="inventory-slot-fallback">{{ itemGlyph(slot.item) }}</span>
                <span
                  class="inventory-slot-rarity"
                  :title="rarityLabel(slot.item?.quality || slot.item?.qualityLabel)"
                >
                  {{ rarityShort(slot.item?.quality || slot.item?.qualityLabel) }}
                </span>
                <span class="inventory-slot-count">{{ slot.item.count }}</span>
              </template>
            </button>
          </div>
        </section>

        <aside class="inventory-detail-pane">
          <header
            v-if="craftPaneEnabled"
            class="detail-pane-tabs"
            role="tablist"
            aria-label="右ペイン切替"
          >
            <button
              type="button"
              class="detail-pane-tab"
              :class="{ active: activeRightPane === 'detail' }"
              @click="setRightPaneMode('detail')"
            >
              詳細
            </button>
            <button
              type="button"
              class="detail-pane-tab"
              :class="{ active: activeRightPane === 'craft' }"
              @click="setRightPaneMode('craft')"
            >
              生成
            </button>
            <button
              v-if="!pickerMode"
              type="button"
              class="detail-pane-tab"
              :class="{ active: showEnchantModal }"
              :disabled="!!enchantOpenDisabledReason"
              :title="enchantOpenDisabledReason || '付与一覧を開く'"
              @click="openEnchantModal"
            >
              付与
            </button>
          </header>

          <section v-if="activeRightPane === 'detail' || !craftPaneEnabled" class="detail-block">
            <h4>選択アイテム</h4>
            <div v-if="pickerMode" class="small">
              対象スロット: {{ normalizeEquipmentSlotKey(filterSlotKey) || "未指定" }}
            </div>
            <template v-if="selectedItem">
              <div class="detail-title-row">
                <strong>{{ selectedItem.name }}</strong>
                <span
                  class="detail-rarity"
                  :class="rarityClass(selectedItem)"
                  :title="rarityLabel(selectedItem?.quality || selectedItem?.qualityLabel)"
                >
                  [{{ rarityShort(selectedItem?.quality || selectedItem?.qualityLabel) }}]
                </span>
              </div>
              <div class="small detail-count">在庫: x{{ selectedItem.count }}</div>
              <div v-if="selectedItemDetailRows.length" class="detail-grid">
                <div
                  v-for="row in selectedItemDetailRows"
                  :key="`inv-detail-${selectedItem.key}-${row.label}`"
                  class="detail-item"
                >
                  <span>{{ row.label }}</span>
                  <strong>{{ row.value }}</strong>
                </div>
              </div>
              <div v-else class="small">詳細データなし</div>
              <button
                v-if="pickerMode"
                type="button"
                class="weapon-craft-submit"
                :disabled="!selectedItemPickable"
                @click="submitPickItem"
              >
                この装備を選択
              </button>
            </template>
            <div v-else class="small">左の道具を選択すると詳細を表示します。</div>
          </section>

          <section v-else-if="craftPaneEnabled && activeRightPane === 'craft'" class="weapon-craft-block">
            <div class="weapon-craft-head">
              <h4>装備生成</h4>
              <div class="small">
                鍛冶Lv: {{ smithLevel }}
                <template v-if="hasCraftUsageLimit"> / 残り回数 {{ craftUsageDisplay.remaining }}/{{ craftUsageDisplay.max }}</template>
              </div>
            </div>
            <div class="weapon-craft-row">
              <label>種別</label>
              <select v-model="selectedCraftType">
                <option
                  v-for="row in CRAFT_TYPE_DEFS"
                  :key="`equip-craft-type-${row.key}`"
                  :value="row.key"
                >
                  {{ row.label }}
                </option>
              </select>
            </div>
            <div class="weapon-craft-row">
              <label>{{ selectedCraftTypeLabel }}</label>
              <select v-model="selectedWeaponName">
                <option v-for="row in craftTargetRows" :key="`weapon-craft-name-${row.装備名}`" :value="row.装備名">
                  {{ row.装備名 }}
                </option>
              </select>
            </div>
            <div class="weapon-craft-row">
              <label>レア度</label>
              <select v-model="selectedWeaponRarity">
                <option
                  v-for="rarity in RARITY_ORDER"
                  :key="`weapon-craft-rarity-${rarity}`"
                  :value="rarity"
                  :disabled="!availableRarities.includes(rarity)"
                >
                  {{ rarityLabel(rarity) }} (必要鍛冶Lv{{ RARITY_REQUIRED_LEVEL[rarity] }})
                </option>
              </select>
            </div>
            <div class="weapon-craft-row weapon-craft-row-count">
              <label>個数</label>
              <div class="weapon-craft-count-control">
                <input
                  v-model.number="weaponCraftCount"
                  class="weapon-craft-count-input"
                  type="number"
                  min="1"
                  step="1"
                  @change="normalizeWeaponCraftCount"
                />
                <button type="button" class="weapon-craft-step-btn" title="個数を増やす" @click="nudgeWeaponCraftCount(1)">△</button>
                <button type="button" class="weapon-craft-step-btn" title="個数を減らす" @click="nudgeWeaponCraftCount(-1)">▽</button>
              </div>
            </div>
            <div class="detail-block craft-preview-block">
              <div class="craft-preview-head-row">
                <h4>性能</h4>
              </div>
      
              <div v-if="craftPreviewItem" class="craft-preview-grid">
                <div class="craft-preview-pair-row">
                  <div class="detail-item">
                    <span>威/守</span>
                    <strong>{{ craftPreviewStats.powerGuard }}</strong>
                  </div>
                  <div class="detail-item">
                    <span>AP</span>
                    <strong>{{ craftPreviewStats.ap }}</strong>
                  </div>
                </div>
                <div class="craft-preview-pair-row">
                  <div class="detail-item">
                    <span>Cr率</span>
                    <strong>{{ craftPreviewStats.criticalRate }}</strong>
                  </div>
                  <div class="detail-item">
                    <span>Cr威力</span>
                    <strong>{{ craftPreviewStats.criticalPower }}</strong>
                  </div>
                </div>
              </div>
              <div v-else class="small">性能データなし</div>
            </div>
            <div v-if="craftDisabledReason" class="small weapon-craft-hint">
              生成不可理由: {{ craftDisabledReason }}
            </div>
            <div class="small">必要素材</div>
            <div v-if="craftCostEntries.length" class="enchant-cost-icons">
              <div
                v-for="cost in craftCostEntries"
                :key="cost.key"
                class="enchant-cost-chip"
                :title="`${cost.name} x${cost.countText}`"
              >
                <img v-if="cost.iconSrc" :src="cost.iconSrc" :alt="cost.name" class="enchant-cost-icon" />
                <span v-else class="enchant-cost-fallback">{{ cost.glyph }}</span>
                <span class="enchant-cost-value">x{{ cost.countText }}</span>
              </div>
            </div>
            <div v-else-if="nonEmptyText(craftCostResult.reason)" class="small weapon-craft-hint">
              {{ craftCostResult.reason }}
            </div>
            <div v-else class="small">必要素材なし</div>
            <button type="button" class="weapon-craft-submit" @click="submitWeaponCraft">
              {{ selectedCraftTypeLabel }}を生成
            </button>
            <div class="small weapon-craft-status" v-if="craftStatusText">{{ craftStatusText }}</div>
          </section>
        </aside>
      </div>
      </section>
    </base-modal>
  </div>

  <div
    class="equipment-modal-wrap"
    :style="{ '--equipment-modal-width': enchantModalCardWidth, '--equipment-modal-height': enchantModalCardHeight }"
  >
    <base-modal :show="showEnchantModal" :title="enchantModalTitle" @close="closeEnchantModal">
      <section class="equipment-enchant-root">
      <header class="equipment-enchant-head">
        <h3>{{ enchantModalTitle }}</h3>
        <div class="small">付与済み効果（最大3）</div>
        <div class="enchant-applied-list">
          <span v-if="!selectedItemEnchantments.length" class="enchant-applied-chip empty">なし</span>
          <span
            v-for="name in selectedItemEnchantments"
            :key="`enchant-applied-${name}`"
            class="enchant-applied-chip"
          >
            {{ name }}
          </span>
        </div>
      </header>

      <div class="equipment-enchant-layout">
        <aside class="enchant-option-pane">
          <h4>付与一覧</h4>
          <div v-if="enchantOptions.length" class="enchant-option-list">
            <button
              v-for="option in enchantOptions"
              :key="`enchant-modal-option-${option.abilityName}`"
              type="button"
              class="enchant-option-item"
              :class="{ active: selectedEnchantName === option.abilityName }"
              @click="selectEnchantOption(option.abilityName)"
            >
              <strong>{{ option.abilityName }}</strong>
              <span class="small">Lv{{ option.level }}</span>
            </button>
          </div>
          <div v-else class="small">
            {{ nonEmptyText(enchantOptionResult?.reason) || "条件を満たす付与候補がありません。" }}
          </div>
        </aside>

        <section class="enchant-detail-pane">
          <h4>{{ selectedEnchantOption?.abilityName || "付与を選択" }}</h4>
          <template v-if="selectedEnchantOption">
            <div class="enchant-detail-grid">
              <div class="detail-item">
                <span>対象</span>
                <strong>{{ selectedEnchantOption.target }}</strong>
              </div>
              <div class="detail-item">
                <span>条件</span>
                <strong>{{ selectedEnchantOption.requirementText }}</strong>
              </div>
              <div class="detail-item">
                <span>効果</span>
                <strong>{{ selectedEnchantOption.effectSummary }}</strong>
              </div>
              <div class="detail-item" v-if="selectedEnchantOption.requiredToolsText !== 'なし'">
                <span>必要道具</span>
                <strong>{{ selectedEnchantOption.requiredToolsText }}</strong>
              </div>
              <div class="detail-item" v-if="selectedEnchantOption.capacityText">
                <span>上限</span>
                <strong>{{ selectedEnchantOption.capacityText }}</strong>
              </div>
              <div class="detail-item" v-if="selectedEnchantOption.usageText">
                <span>回数</span>
                <strong>{{ selectedEnchantOption.usageText }}</strong>
              </div>
            </div>

            <div class="enchant-cost-icons">
              <div
                v-for="cost in selectedEnchantCostEntries"
                :key="cost.key"
                class="enchant-cost-chip"
                :title="`${cost.groupLabel}: ${cost.name} x${cost.countText}`"
              >
                <img v-if="cost.iconSrc" :src="cost.iconSrc" :alt="cost.name" class="enchant-cost-icon" />
                <span v-else class="enchant-cost-fallback">{{ cost.glyph }}</span>
                <span class="enchant-cost-value">x{{ cost.countText }}</span>
              </div>
            </div>
          </template>
          <div v-else class="small">
            左の付与一覧から能力を選択してください。
          </div>
          <button type="button" class="weapon-craft-submit" :disabled="!!enchantDisabledReason" @click="submitEnchant">
            付与を実行
          </button>
          <div class="small weapon-craft-status" v-if="enchantStatusText">{{ enchantStatusText }}</div>
        </section>
      </div>
      </section>
    </base-modal>
  </div>
</template>

<style scoped>
.equipment-modal-wrap :deep(.modal-backdrop > .modal-card) {
  width: var(--equipment-modal-width) !important;
  height: var(--equipment-modal-height) !important;
  max-width: none !important;
  max-height: none !important;
}

.equipment-modal-wrap :deep(.modal-body) {
  overflow: hidden;
}

.equipment-inventory-root {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.inventory-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.inventory-tabs {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

.inventory-tab {
  border: 1px solid rgba(221, 185, 126, 0.42);
  border-radius: 8px;
  padding: 6px 9px;
  font-size: 0.84rem;
  font-weight: 700;
  color: #f1e2be;
  background: linear-gradient(170deg, rgba(27, 21, 15, 0.86), rgba(15, 11, 8, 0.82));
}

.inventory-tab.active {
  border-color: rgba(147, 212, 255, 0.88);
  box-shadow: inset 0 0 0 1px rgba(147, 212, 255, 0.24);
  color: #ecf7ff;
  background: linear-gradient(170deg, rgba(26, 54, 74, 0.92), rgba(12, 29, 41, 0.9));
}

.inventory-summary {
  color: rgba(246, 232, 197, 0.86);
}

.inventory-layout {
  display: flex;
  gap: 8px;
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  align-items: stretch;
}

.inventory-grid-pane,
.inventory-detail-pane {
  min-height: 0;
  border: 1px solid rgba(219, 184, 125, 0.34);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(22, 17, 12, 0.76), rgba(11, 9, 7, 0.74));
  box-shadow: inset 0 0 0 1px rgba(255, 232, 180, 0.08);
}

.inventory-grid-pane {
  width: 640px;
  min-width: 640px;
  padding: 7px;
  overflow: auto;
}

.inventory-detail-pane {
  width: 360px;
  min-width: 360px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(5, 120px);
  gap: 4px;
  justify-content: start;
}

.inventory-slot {
  position: relative;
  aspect-ratio: 1 / 1;
  border: 1px solid rgba(157, 145, 126, 0.44);
  border-radius: 5px;
  background: linear-gradient(170deg, rgba(14, 15, 20, 0.92), rgba(8, 9, 12, 0.96));
  padding: 0;
  overflow: hidden;
}

.inventory-slot.empty {
  cursor: default;
}

.inventory-slot.filled {
  border-color: rgba(213, 188, 137, 0.68);
}

.inventory-slot.active {
  box-shadow: inset 0 0 0 1px rgba(165, 231, 255, 0.55), 0 0 0 1px rgba(147, 212, 255, 0.34);
}

.inventory-slot.rarity-uncommon {
  border-color: rgba(126, 209, 124, 0.76);
}

.inventory-slot.rarity-rare {
  border-color: rgba(99, 164, 241, 0.82);
}

.inventory-slot.rarity-epic {
  border-color: rgba(201, 131, 255, 0.84);
}

.inventory-slot.rarity-legendary {
  border-color: rgba(250, 188, 90, 0.9);
}

.inventory-slot-icon,
.inventory-slot-fallback {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  transform: translate(-50%, -50%);
  border-radius: 6px;
}

.inventory-slot-icon {
  object-fit: cover;
}

.inventory-slot-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #f6e6c0;
  background: rgba(255, 255, 255, 0.1);
  font-size: 0.98rem;
  font-weight: 700;
}

.inventory-slot-rarity {
  position: absolute;
  left: 2px;
  top: 2px;
  font-size: 0.56rem;
  line-height: 1;
  color: #b8b8b8;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.65);
}

.inventory-slot.rarity-common .inventory-slot-rarity {
  color: #b8b8b8;
}

.inventory-slot.rarity-uncommon .inventory-slot-rarity {
  color: #78d86c;
}

.inventory-slot.rarity-rare .inventory-slot-rarity {
  color: #63b1ff;
}

.inventory-slot.rarity-epic .inventory-slot-rarity {
  color: #c992ff;
}

.inventory-slot.rarity-legendary .inventory-slot-rarity {
  color: #ffd06e;
}

.inventory-slot-count {
  position: absolute;
  right: 3px;
  bottom: 2px;
  min-width: 22px;
  border-radius: 999px;
  padding: 0 5px;
  text-align: center;
  font-size: 0.62rem;
  line-height: 1.35;
  color: #1f1710;
  background: linear-gradient(180deg, rgba(244, 229, 198, 0.96), rgba(220, 197, 154, 0.94));
}

.inventory-detail-pane h4,
.inventory-detail-pane strong {
  color: #fff1cb;
}

.inventory-detail-pane .small {
  color: rgba(246, 232, 197, 0.88);
}

.detail-pane-tabs {
  display: flex;
  gap: 6px;
  padding: 0;
}

.detail-pane-tab {
  width: 112px;
  min-width: 112px;
  min-height: 30px;
  border: 1px solid rgba(220, 184, 125, 0.42);
  border-radius: 8px;
  color: #f0dfb8;
  background: linear-gradient(170deg, rgba(20, 16, 12, 0.82), rgba(11, 9, 7, 0.78));
  font-size: 0.82rem;
  font-weight: 700;
}

.detail-pane-tab.active {
  border-color: rgba(147, 212, 255, 0.84);
  color: #ecf7ff;
  background: linear-gradient(170deg, rgba(24, 53, 73, 0.9), rgba(10, 27, 38, 0.88));
}

.detail-block {
  display: grid;
    gap: 3px;
    border: 1px solid rgba(215, 182, 130, .3);
    border-radius: 5px;
    padding: 5px;
    background: #120f0c85;
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
}

.inventory-detail-pane h4 {
  margin: 0;
}

.weapon-craft-block {
  display: grid;
  gap: 7px;
  border: 1px solid rgba(215, 182, 130, 0.3);
  border-radius: 8px;
  padding: 8px;
  background: rgba(18, 15, 12, 0.52);
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
}

.weapon-craft-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.weapon-craft-row {
  display: grid;
  grid-template-columns: 72px 250px;
  gap: 8px;
  align-items: center;
}

.weapon-craft-row label {
  font-size: 20px;
  line-height: 1.25;
  color: rgba(236, 223, 192, 0.88);
}

.weapon-craft-row-count {
  grid-template-columns: 72px auto;
}

.weapon-craft-row select,
.weapon-craft-row input {
  width: 100%;
  min-height: 38px;
  border: 1px solid rgba(212, 182, 128, 0.52);
  border-radius: 7px;
  background: rgba(255, 247, 233, 0.92);
  color: #332515;
  font-size: 20px;
  padding: 6px 8px;
  line-height: 1.25;
}

.weapon-craft-count-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.weapon-craft-count-input {
  width: 96px;
  text-align: center;
}

.weapon-craft-count-input::-webkit-outer-spin-button,
.weapon-craft-count-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.weapon-craft-count-input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.weapon-craft-step-btn {
  width: 38px;
  min-width: 38px;
  height: 38px;
  border: 1px solid rgba(236, 200, 140, 0.68);
  border-radius: 7px;
  color: #2f2416;
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
  background: linear-gradient(180deg, rgba(246, 224, 184, 0.96), rgba(219, 191, 145, 0.94));
}

.weapon-craft-submit {
  border: 1px solid rgba(236, 200, 140, 0.68);
  border-radius: 8px;
  min-height: 34px;
  font-weight: 700;
  color: #2f2416;
  background: linear-gradient(180deg, rgba(246, 224, 184, 0.96), rgba(219, 191, 145, 0.94));
}

.weapon-craft-submit:disabled {
  opacity: 0.45;
}

.weapon-craft-status {
  color: #f7e7bf;
}

.weapon-craft-hint {
  color: rgba(246, 209, 146, 0.92);
}

.detail-divider {
  width: 100%;
  border: none;
  border-top: 1px solid rgba(221, 186, 128, 0.24);
  margin: 2px 0;
}

.detail-title-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: baseline;
}

.craft-preview-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.craft-preview-kind {
  border: 1px solid rgba(221, 186, 128, 0.24);
  border-radius: 8px;
  padding: 4px 8px;
  background: rgba(18, 16, 13, 0.62);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.craft-preview-kind span {
  color: rgba(236, 223, 192, 0.84);
  font-size: 0.8rem;
}

.craft-preview-kind strong {
  color: #fff1cb;
  font-size: 0.84rem;
}

.craft-preview-grid {
  display: grid;
  gap: 8px;
}

.craft-preview-pair-row {
  display: flex;
  gap: 8px;
}

.craft-preview-pair-row .detail-item {
  width: 154px;
  min-width: 154px;
}

.detail-rarity {
  font-size: 0.82rem;
}

.detail-rarity.rarity-common {
  color: #b8b8b8;
}

.detail-rarity.rarity-uncommon {
  color: #97e39c;
}

.detail-rarity.rarity-rare {
  color: #7bc3ff;
}

.detail-rarity.rarity-epic {
  color: #d6a2ff;
}

.detail-rarity.rarity-legendary {
  color: #ffd18b;
}

.detail-count {
  color: rgba(244, 230, 196, 0.86);
}

.detail-grid {
  display: grid;
  gap: 6px;
}

.detail-item {
  border: 1px solid rgba(221, 186, 128, 0.24);
  border-radius: 8px;
  padding: 6px 8px;
  background: rgba(18, 16, 13, 0.62);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.detail-item span {
  color: rgba(236, 223, 192, 0.84);
}

.detail-item strong {
  color: #fff1cb;
}

.equipment-enchant-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  height: 100%;
}

.equipment-enchant-head {
  display: grid;
  gap: 5px;
}

.equipment-enchant-head h3 {
  margin: 0;
  font-size: 1rem;
  color: #f4e6bf;
}

.enchant-applied-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.enchant-applied-chip {
  border: 1px solid rgba(218, 185, 132, 0.4);
  border-radius: 999px;
  padding: 3px 9px;
  background: rgba(31, 24, 17, 0.78);
  color: #f4e7c5;
  font-size: 0.82rem;
}

.enchant-applied-chip.empty {
  color: rgba(236, 223, 193, 0.78);
}

.equipment-enchant-layout {
  min-height: 0;
  display: flex;
  gap: 10px;
  flex: 1 1 auto;
  overflow: auto;
}

.enchant-option-pane,
.enchant-detail-pane {
  min-height: 0;
  border: 1px solid rgba(219, 184, 125, 0.34);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(22, 17, 12, 0.76), rgba(11, 9, 7, 0.74));
  box-shadow: inset 0 0 0 1px rgba(255, 232, 180, 0.08);
  padding: 8px;
}

.enchant-option-pane {
  width: 320px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.enchant-option-pane h4,
.enchant-detail-pane h4 {
  margin: 0;
}

.enchant-option-list {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  display: grid;
  gap: 6px;
  align-content: start;
}

.enchant-option-item {
  border: 1px solid rgba(218, 186, 133, 0.36);
  border-radius: 8px;
  background: rgba(24, 19, 14, 0.68);
  padding: 7px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  color: #f5e8c6;
}

.enchant-option-item.active {
  border-color: rgba(147, 212, 255, 0.84);
  background: linear-gradient(170deg, rgba(28, 54, 74, 0.88), rgba(14, 31, 41, 0.86));
  color: #ecf7ff;
}

.enchant-detail-pane {
  width: 620px;
  min-width: 620px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}

.enchant-detail-grid {
  display: grid;
  gap: 6px;
}

.enchant-cost-icons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  align-content: flex-start;
  min-height: 40px;
}

.enchant-cost-chip {
  border: 1px solid rgba(219, 184, 125, 0.34);
  border-radius: 8px;
  background: rgba(17, 14, 11, 0.72);
  padding: 3px 6px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.enchant-cost-icon,
.enchant-cost-fallback {
  width: 40px;
  height: 40px;
  border-radius: 5px;
}

.enchant-cost-icon {
  object-fit: cover;
}

.enchant-cost-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #f6e6c0;
  background: rgba(255, 255, 255, 0.12);
  font-size: 0.76rem;
  font-weight: 700;
}

.enchant-cost-value {
  color: #f7e6be;
  font-size: 0.76rem;
  font-weight: 700;
  font-size: 20px;
}

.enchant-cost-text {
  color: rgba(241, 226, 188, 0.9);
}
</style>
