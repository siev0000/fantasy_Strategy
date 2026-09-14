import { getGameDataRows } from "./game-data-registry.js";
import { MATERIAL_RESOURCE_KEYS, normalizeV39Village } from "./v39-economy-rules.js";
import { resolveCompletedResearchLevel } from "./research-progress.js";
import { getSelectedSettlement, replaceFactionSettlement } from "./settlement-state.js";
import { EQUIPMENT_SLOT_KEYS, RESISTANCE_FIELDS, STATUS_FIELDS } from "../constants/unitCommon.js";
import { isMobUnit } from "../composables/unitCoreUtils.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round1 = value => Math.round(number(value) * 10) / 10;
const optionalNumber = value => value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const consumptionRows = getGameDataRows("消費量");

export const V39_EQUIPMENT_RARITIES = Object.freeze(consumptionRows
  .filter(row => text(row?.種別) === "装備" && text(row?.品質キー) && text(row?.品質名))
  .map(row => Object.freeze({
    key:text(row.品質キー),
    label:text(row.品質名),
    short:text(row.品質略称) || text(row.品質名).slice(0, 1),
    level:Math.max(1, Math.floor(number(row.Lv, 1))),
    multiplier:Math.max(0, number(row.品質倍率, 1))
  }))
  .sort((a, b) => a.level - b.level));

if (!V39_EQUIPMENT_RARITIES.length) {
  throw new Error("[装備品質] 消費量.json の装備行に品質定義がありません");
}
if (new Set(V39_EQUIPMENT_RARITIES.map(row => row.key)).size !== V39_EQUIPMENT_RARITIES.length) {
  throw new Error("[装備品質] 消費量.json の品質キーが重複しています");
}

export const DEFAULT_V39_EQUIPMENT_RARITY_KEY = V39_EQUIPMENT_RARITIES[0].key;

const RARITY_ALIASES = Object.freeze(Object.fromEntries(V39_EQUIPMENT_RARITIES.flatMap(row => [
  [row.key, row.key], [row.label, row.key], [row.short, row.key]
])));
const equipmentRows = getGameDataRows("装備").filter(row => text(row?.装備名));
const equipmentByName = new Map(equipmentRows.map(row => [text(row.装備名), row]));
const classByName = new Map(getGameDataRows("クラス").map(row => [text(row?.名前), row]).filter(([name]) => name));
const enchantmentRows = getGameDataRows("付与").filter(row => text(row?.付与能力));
const enchantmentByName = new Map(enchantmentRows.map(row => [text(row.付与能力), row]));
const SLOT_LABELS = Object.freeze({ 武器1:"武器1", 武器2:"武器2", 頭:"頭", 体:"体", 足:"足", 装飾1:"装飾1", 装飾2:"装飾2" });
const EQUIPMENT_ACTION_POPULATION_STEP = 25;

export function normalizeV39EquipmentRarity(value, fallback = DEFAULT_V39_EQUIPMENT_RARITY_KEY) {
  return RARITY_ALIASES[text(value)] || RARITY_ALIASES[text(value).toLowerCase()] || fallback;
}

export function getV39EquipmentRarity(value) {
  const key = normalizeV39EquipmentRarity(value);
  return V39_EQUIPMENT_RARITIES.find(row => row.key === key) || V39_EQUIPMENT_RARITIES[0];
}

export function normalizeV39EquipmentSlot(value) {
  const raw = text(value);
  if (EQUIPMENT_SLOT_KEYS.includes(raw)) return raw;
  if (raw === "武器") return "武器1";
  if (raw === "胴") return "体";
  if (raw === "装飾") return "装飾1";
  return "";
}

export function getV39EquipmentSlotCandidates(rowOrName) {
  const row = typeof rowOrName === "string" ? equipmentByName.get(text(rowOrName)) : rowOrName;
  const part = text(row?.装備箇所 ?? row?.装備部位);
  if (part === "武器") return ["武器1", "武器2"];
  if (part === "頭") return ["頭"];
  if (part === "体" || part === "胴") return ["体"];
  if (part === "足") return ["足"];
  if (part === "装飾") return ["装飾1", "装飾2"];
  return [];
}

function scaleCriticalPower(value, multiplier) {
  const base = Math.max(0, Math.round(number(value)));
  return Math.floor(base / 100) * 100 + Math.round((base % 100) * multiplier);
}

function equipmentConsumptionRow(level) {
  return consumptionRows.find(row => text(row?.種別) === "装備" && Math.floor(number(row?.Lv)) === level) || null;
}

export function getV39EquipmentCraftCost(rowOrName, rarityValue = DEFAULT_V39_EQUIPMENT_RARITY_KEY, countValue = 1) {
  const row = typeof rowOrName === "string" ? equipmentByName.get(text(rowOrName)) : rowOrName;
  if (!row) return { ok:false, reason:"装備データが見つかりません", material:{} };
  const rarity = getV39EquipmentRarity(rarityValue);
  const source = equipmentConsumptionRow(rarity.level);
  if (!source) return { ok:false, reason:`消費量.jsonに装備Lv${rarity.level}がありません`, material:{} };
  const count = Math.max(1, Math.floor(number(countValue, 1)));
  const hasRatio = number(row?.木材) > 0 || number(row?.鉱石) > 0;
  const woodScale = hasRatio ? Math.max(0, number(row?.木材)) : 1;
  const oreScale = hasRatio ? Math.max(0, number(row?.鉱石)) : 1;
  const material = Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key => [key, 0]));
  for (const key of ["木材", "黒木", "特木"]) material[key] = round1(Math.max(0, number(source[key]) * woodScale * count));
  for (const key of ["鉄", "銀鉄", "青金鋼", "赤黒鋼"]) material[key] = round1(Math.max(0, number(source[key]) * oreScale * count));
  return { ok:true, level:rarity.level, rarity, count, material };
}

export function createV39EquipmentEntry(rowOrName, rarityValue = DEFAULT_V39_EQUIPMENT_RARITY_KEY, slotValue = "") {
  const row = typeof rowOrName === "string" ? equipmentByName.get(text(rowOrName)) : rowOrName;
  if (!row) return null;
  const rarity = getV39EquipmentRarity(rarityValue);
  const slotCandidates = getV39EquipmentSlotCandidates(row);
  const requestedSlot = normalizeV39EquipmentSlot(slotValue);
  const slot = slotCandidates.includes(requestedSlot) ? requestedSlot : slotCandidates[0];
  if (!slot) return null;
  const craft = getV39EquipmentCraftCost(row, rarity.key);
  const resistanceBonus = Object.fromEntries(RESISTANCE_FIELDS.map(key => [key, Math.round(number(row?.[key]) * rarity.multiplier)]));
  const armorBase = Math.max(0, number(row?.耐性)) * rarity.multiplier;
  const consumption = equipmentConsumptionRow(rarity.level);
  if (!["武器1", "武器2", "装飾1", "装飾2"].includes(slot) && armorBase > 0) {
    const physical = Math.round(armorBase * Math.max(0, number(consumption?.防具_物理, 1)));
    const magic = Math.round(armorBase * Math.max(0, number(consumption?.防具_魔法)));
    resistanceBonus.物理耐性 += physical;
    resistanceBonus.魔法耐性 += magic;
  }
  return {
    slot,
    slotLabel:SLOT_LABELS[slot],
    name:text(row.装備名),
    quality:rarity.key,
    qualityLabel:rarity.label,
    rarityMultiplier:rarity.multiplier,
    power:Math.round(number(row?.威力) * rarity.multiplier),
    guard:Math.round(number(row?.ガード) * rarity.multiplier),
    attackAp:Math.round(number(row?.攻撃AP)),
    magicAp:Math.round(number(row?.魔法AP)),
    shot:Math.round(number(row?.射撃) * rarity.multiplier),
    criticalRate:Math.round(number(row?.Cr率) * rarity.multiplier),
    criticalPower:scaleCriticalPower(row?.Cr威力, rarity.multiplier),
    range:optionalNumber(row?.射程) === null ? null : Math.round(optionalNumber(row?.射程)),
    penalty:Math.round(number(row?.ペナルティ)),
    resistanceBonus,
    traits:[row?.特性1, row?.特性2, row?.特性3, row?.特性4].map(text).filter(Boolean),
    craftLevel:craft.level,
    craftCostMaterial:{ ...(craft.material || {}) },
    source:row
  };
}

export function normalizeV39EquipmentItem(item, index = 0) {
  const name = text(item?.name ?? item?.equipmentName ?? item?.装備名);
  if (!name) return null;
  const normalized = createV39EquipmentEntry(name, item?.quality ?? item?.qualityLabel, item?.slot ?? EQUIPMENT_SLOT_KEYS[index]);
  if (!normalized) return null;
  const resistanceBonus = { ...normalized.resistanceBonus };
  for (const key of RESISTANCE_FIELDS) resistanceBonus[key] += number(item?.enchantResistanceBonus?.[key]);
  return {
    ...normalized,
    slot:normalized.slot,
    name,
    quality:normalized.quality,
    qualityLabel:normalized.qualityLabel,
    ...(text(item?.id) ? { id:text(item.id) } : {}),
    ...(text(item?.instanceId) ? { instanceId:text(item.instanceId) } : {}),
    resistanceBonus,
    enchantments:Array.isArray(item?.enchantments) ? item.enchantments.map(text).filter(Boolean) : [],
    enchantBonus:item?.enchantBonus && typeof item.enchantBonus === "object" ? { ...item.enchantBonus } : {},
    enchantResistanceBonus:item?.enchantResistanceBonus && typeof item.enchantResistanceBonus === "object" ? { ...item.enchantResistanceBonus } : {}
  };
}

export function buildV39EquipmentResistanceBonus(equipment) {
  const result = Object.fromEntries(RESISTANCE_FIELDS.map(key => [key, 0]));
  for (const [index, item] of (Array.isArray(equipment) ? equipment : []).entries()) {
    const normalized = normalizeV39EquipmentItem(item, index);
    for (const key of RESISTANCE_FIELDS) result[key] += Math.round(number(normalized?.resistanceBonus?.[key]));
  }
  return result;
}

function inventoryKey(name, rarity, enchantments = []) {
  const suffix = (Array.isArray(enchantments) ? enchantments : []).map(text).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja")).join("+");
  return `${text(name)}::${normalizeV39EquipmentRarity(rarity)}::${suffix}`;
}

export function normalizeV39EquipmentInventory(inventory) {
  const merged = new Map();
  for (const row of Array.isArray(inventory) ? inventory : []) {
    const item = normalizeV39EquipmentItem(row?.item || row);
    const count = Math.max(0, Math.floor(number(row?.count ?? row?.quantity, 1)));
    if (!item || count <= 0) continue;
    const key = inventoryKey(item.name, item.quality, item.enchantments);
    const previous = merged.get(key);
    merged.set(key, { key, name:item.name, quality:item.quality, qualityLabel:item.qualityLabel, count:count + number(previous?.count), item });
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, "ja") || V39_EQUIPMENT_RARITIES.findIndex(r => r.key === a.quality) - V39_EQUIPMENT_RARITIES.findIndex(r => r.key === b.quality));
}

function updatePlayer(state, playerId, updater) {
  let changed = false;
  const players = (state?.players || []).map(player => {
    if (text(player?.id) !== text(playerId)) return player;
    changed = true;
    return updater(player);
  });
  return changed ? { ...state, players } : state;
}

function storeInventoryItem(inventory, item, amount = 1) {
  return normalizeV39EquipmentInventory([...normalizeV39EquipmentInventory(inventory), { item, count:amount }]);
}

function takeInventoryItem(inventory, name, rarity, requestedKey = "") {
  const rows = normalizeV39EquipmentInventory(inventory);
  const key = text(requestedKey) || inventoryKey(name, rarity);
  const index = rows.findIndex(row => row.key === key);
  if (index < 0 || rows[index].count < 1) return { ok:false, inventory:rows, item:null };
  const item = { ...rows[index].item };
  rows[index] = { ...rows[index], count:rows[index].count - 1 };
  return { ok:true, item, inventory:rows.filter(row => row.count > 0) };
}

function researchLevel(player, field) {
  return Math.max(number(getSelectedSettlement(player?.factionState)?.cityLevels?.[field]), resolveCompletedResearchLevel(player?.factionState?.research, field.replace(/Lv$/, "")));
}

function selectedVillage(player) {
  return normalizeV39Village(getSelectedSettlement(player?.factionState), player?.race);
}

function updateSelectedVillage(player, village, factionPatch = {}) {
  return {
    ...player,
    factionState:replaceFactionSettlement({ ...player.factionState, ...factionPatch }, village, { ownerPlayerId:player.id })
  };
}

export function craftV39Equipment(state, playerId, request = {}) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  if (!player) return { ok:false, reason:"プレイヤーが見つかりません", state };
  const village = selectedVillage(player);
  if (!village?.placed) return { ok:false, reason:"装備作成には拠点配置が必要です", state };
  const count = Math.max(1, Math.min(99, Math.floor(number(request.count, 1))));
  const item = createV39EquipmentEntry(request.name, request.rarity);
  if (!item) return { ok:false, reason:"装備データが見つかりません", state };
  const cost = getV39EquipmentCraftCost(item.name, item.quality, count);
  if (!cost.ok) return { ...cost, state };
  if (researchLevel(player, "鍛冶Lv") < cost.level) return { ok:false, reason:`鍛冶Lv${cost.level}が必要です`, state, cost };
  const stock = { ...village.materialStockByType };
  const missing = Object.entries(cost.material).filter(([key, amount]) => number(stock[key]) < number(amount)).map(([key]) => key);
  if (missing.length) return { ok:false, reason:`素材不足: ${missing.join("・")}`, state, cost };
  for (const [key, amount] of Object.entries(cost.material)) stock[key] = round1(Math.max(0, number(stock[key]) - number(amount)));
  const nextVillage = normalizeV39Village({ ...village, materialStockByType:stock, equipmentInventory:storeInventoryItem(village.equipmentInventory, item, count) }, player.race);
  const nextState = updatePlayer(state, playerId, row => updateSelectedVillage(row, nextVillage));
  return { ok:true, state:nextState, item, count, cost };
}

export function changeV39UnitEquipment(state, playerId, request = {}) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const unit = player?.factionState?.units?.find(row => text(row?.id) === text(request.unitId));
  if (!unit) return { ok:false, reason:"キャラクターが見つかりません", state };
  if (isMobUnit(unit)) return { ok:false, reason:"モブは固定装備です。レア度一新を使用してください", state };
  const slot = normalizeV39EquipmentSlot(request.slot);
  if (!slot) return { ok:false, reason:"装備部位が不正です", state };
  const village = selectedVillage(player);
  if (!village?.placed) return { ok:false, reason:"装備変更には拠点配置が必要です", state };
  const current = (unit.equipment || []).map(normalizeV39EquipmentItem).filter(Boolean);
  const oldItem = current.find(item => item.slot === slot) || null;
  let inventory = normalizeV39EquipmentInventory(village.equipmentInventory);
  let nextItem = null;
  if (text(request.name)) {
    const template = createV39EquipmentEntry(request.name, request.rarity, slot);
    if (!template || !getV39EquipmentSlotCandidates(template.source).includes(slot)) return { ok:false, reason:"この部位には装備できません", state };
    const taken = takeInventoryItem(inventory, template.name, template.quality, request.inventoryKey);
    if (!taken.ok) return { ok:false, reason:"装備在庫がありません", state };
    inventory = taken.inventory;
    nextItem = { ...taken.item, slot, slotLabel:SLOT_LABELS[slot] };
  }
  if (oldItem) inventory = storeInventoryItem(inventory, oldItem, 1);
  const equipment = current.filter(item => item.slot !== slot);
  if (nextItem) equipment.push(nextItem);
  const nextVillage = normalizeV39Village({ ...village, equipmentInventory:inventory }, player.race);
  const nextState = updatePlayer(state, playerId, row => updateSelectedVillage(row, nextVillage, {
    units:row.factionState.units.map(entry => entry.id === unit.id ? { ...entry, equipment } : entry)
  }));
  return { ok:true, state:nextState, item:nextItem, removed:oldItem, slot };
}

export function rerollV39MobEquipment(state, playerId, request = {}) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const unit = player?.factionState?.units?.find(row => text(row?.id) === text(request.unitId));
  if (!unit) return { ok:false, reason:"キャラクターが見つかりません", state };
  if (!isMobUnit(unit)) return { ok:false, reason:"レア度一新はモブ専用です", state };
  const classRow = classByName.get(text(unit.className));
  if (!classRow) return { ok:false, reason:"クラスデータが見つかりません", state };
  const rarity = normalizeV39EquipmentRarity(request.rarity);
  const equipment = EQUIPMENT_SLOT_KEYS.map(slot => createV39EquipmentEntry(classRow?.[slot], rarity, slot)).filter(Boolean);
  if (!equipment.length) return { ok:false, reason:"固定装備が設定されていません", state };
  const village = selectedVillage(player);
  if (!village?.placed) return { ok:false, reason:"レア度一新には拠点配置が必要です", state };
  const totalCost = Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key => [key, 0]));
  for (const item of equipment) for (const key of MATERIAL_RESOURCE_KEYS) totalCost[key] = round1(totalCost[key] + number(item.craftCostMaterial?.[key]));
  if (researchLevel(player, "鍛冶Lv") < getV39EquipmentRarity(rarity).level) return { ok:false, reason:`鍛冶Lv${getV39EquipmentRarity(rarity).level}が必要です`, state };
  const stock = { ...village.materialStockByType };
  const missing = Object.entries(totalCost).filter(([key, amount]) => number(stock[key]) < amount).map(([key]) => key);
  if (missing.length) return { ok:false, reason:`素材不足: ${missing.join("・")}`, state };
  for (const [key, amount] of Object.entries(totalCost)) stock[key] = round1(Math.max(0, number(stock[key]) - amount));
  const nextVillage = normalizeV39Village({ ...village, materialStockByType:stock }, player.race);
  const nextState = updatePlayer(state, playerId, row => updateSelectedVillage(row, nextVillage, {
    units:row.factionState.units.map(entry => entry.id === unit.id ? { ...entry, equipment } : entry)
  }));
  return { ok:true, state:nextState, equipment, cost:totalCost };
}

export function getV39EquipmentCatalog() {
  return equipmentRows.map(row => ({ row, name:text(row.装備名), slots:getV39EquipmentSlotCandidates(row) })).filter(entry => entry.slots.length);
}

export function getV39EquipmentInventoryView(player) {
  const village = selectedVillage(player);
  const stock = normalizeV39EquipmentInventory(village?.equipmentInventory);
  const equipped = new Map();
  for (const unit of player?.factionState?.units || []) {
    if (isMobUnit(unit)) continue;
    for (const item of unit.equipment || []) {
      const normalized = normalizeV39EquipmentItem(item);
      if (!normalized) continue;
      const key = inventoryKey(normalized.name, normalized.quality, normalized.enchantments);
      equipped.set(key, number(equipped.get(key)) + 1);
    }
  }
  const combined = new Map(stock.map(row => [row.key, { ...row, remainingCount:row.count, equippedCount:number(equipped.get(row.key)) }]));
  for (const [key, equippedCount] of equipped) {
    if (combined.has(key)) continue;
    const [name, quality] = key.split("::");
    const item = createV39EquipmentEntry(name, quality);
    if (item) combined.set(key, { key, name, quality, qualityLabel:item.qualityLabel, count:0, remainingCount:0, equippedCount, item });
  }
  return [...combined.values()].sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function enchantTargetMatches(row, item) {
  const targets = text(row?.対象装備).split(/[,、\/／|]/).map(text).filter(Boolean);
  if (!targets.length) return true;
  const slots = getV39EquipmentSlotCandidates(item?.source || item?.name);
  return targets.some(target => {
    if (target === "武器") return slots.some(slot => slot.startsWith("武器"));
    if (target === "防具") return slots.some(slot => ["頭", "体", "足"].includes(slot));
    if (target === "装飾") return slots.some(slot => slot.startsWith("装飾"));
    return target === item.name || item.name.includes(target) || target.includes(item.name);
  });
}

function enchantRequirements(player, row) {
  const failed = [];
  for (const key of ["鍛冶Lv", "魔法Lv", "信仰Lv", "軍事Lv", "経済Lv"]) {
    const required = Math.max(0, Math.floor(number(row?.[key])));
    const current = researchLevel(player, key);
    if (required > current) failed.push(`${key} ${current}/${required}`);
  }
  return failed;
}

function enchantCost(row) {
  const level = Math.max(1, Math.floor(number(row?.Lv, 1)));
  const source = consumptionRows.find(entry => text(entry?.種別) === "付与" && Math.floor(number(entry?.Lv)) === level);
  const material = Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key => [key, Math.max(0, number(source?.[key]))]));
  const foodKeys = ["穀物", "野菜", "肉", "魚", "死体", "魂"];
  const food = Object.fromEntries(foodKeys.map(key => [key, Math.max(0, number(source?.[key]))]));
  return { level, material, food };
}

function enchantCapacity(item, row) {
  const weapon = getV39EquipmentSlotCandidates(item?.source || item?.name).some(slot => slot.startsWith("武器"));
  const currentNames = Array.isArray(item?.enchantments) ? item.enchantments : [];
  if (currentNames.includes(text(row?.付与能力))) return "同じ付与は重複できません";
  if (!weapon) return "";
  if (currentNames.length >= 3) return "武器付与は最大3つです";
  const usedLevel = currentNames.reduce((sum, name) => sum + Math.max(0, number(enchantmentByName.get(text(name))?.Lv)), 0);
  const limit = getV39EquipmentRarity(item?.quality).level;
  return usedLevel + Math.max(0, number(row?.Lv)) > limit ? `付与Lv合計は品質Lv${limit}までです` : "";
}

function enchantUsageSpec(row, item) {
  const level = Math.max(1, Math.floor(number(row?.Lv, 1)));
  const rarityLevel = getV39EquipmentRarity(item?.quality).level;
  return {
    key:number(row?.信仰Lv) > 0 ? "enchantFaithUsed" : "enchantMagicUsed",
    label:number(row?.信仰Lv) > 0 ? "信仰" : "魔術",
    cost:Math.max(1, level + Math.max(0, rarityLevel - 1))
  };
}

function enchantUsageState(player, row, item, turnNumber = 1) {
  const village = selectedVillage(player);
  const turn = Math.max(1, Math.floor(number(turnNumber, 1)));
  const spec = enchantUsageSpec(row, item);
  const source = village?.equipmentActionUsage && number(village.equipmentActionUsage.turn, -1) === turn
    ? village.equipmentActionUsage
    : {};
  const populationMultiplier = Math.max(1, 1 + Math.floor(number(village?.population) / EQUIPMENT_ACTION_POPULATION_STEP));
  const abilityField = spec.key === "enchantFaithUsed" ? "信仰Lv" : "魔法Lv";
  const max = Math.max(1, researchLevel(player, abilityField)) * populationMultiplier;
  const used = Math.max(0, Math.floor(number(source?.[spec.key])));
  return { ...spec, turn, max, used, remaining:Math.max(0, max - used) };
}

export function getV39EnchantmentOptions(player, inventoryKeyValue, turnNumber = 1) {
  const inventory = normalizeV39EquipmentInventory(getSelectedSettlement(player?.factionState)?.equipmentInventory);
  const target = inventory.find(entry => entry.key === text(inventoryKeyValue));
  if (!target) return [];
  return enchantmentRows.map(row => {
    const failed = enchantRequirements(player, row);
    const capacityReason = enchantCapacity(target.item, row);
    const targetOk = enchantTargetMatches(row, target.item);
    const usage = enchantUsageState(player, row, target.item, turnNumber);
    const usageReason = usage.remaining < usage.cost
      ? `付与回数不足(${usage.label}): 残り ${usage.remaining}/${usage.max} (必要${usage.cost})`
      : "";
    return {
      name:text(row.付与能力),
      row,
      cost:enchantCost(row),
      usage,
      available:targetOk && !failed.length && !capacityReason && !usageReason,
      reason:!targetOk ? "対象外" : capacityReason || failed.join(" / ") || usageReason
    };
  }).filter(option => enchantTargetMatches(option.row, target.item));
}

function applyEnchantment(item, row) {
  const next = normalizeV39EquipmentItem(item);
  const enchantBonus = { ...(next.enchantBonus || {}) };
  const enchantResistanceBonus = { ...(next.enchantResistanceBonus || {}) };
  for (const key of STATUS_FIELDS) enchantBonus[key] = number(enchantBonus[key]) + number(row?.[key]);
  for (const key of RESISTANCE_FIELDS) enchantResistanceBonus[key] = number(enchantResistanceBonus[key]) + number(row?.[key]);
  next.power = Math.round(number(next.power) + number(row?.物理) + number(row?.全威力));
  next.guard = Math.round(number(next.guard) + number(row?.ガード) + number(row?.防御));
  next.criticalRate = Math.round(number(next.criticalRate) + number(row?.Cr率));
  next.criticalPower = Math.round(number(next.criticalPower) + number(row?.Cr威力));
  if (number(row?.射程)) next.range = Math.max(1, Math.round(number(next.range) + number(row.射程)));
  next.enchantments = [...(next.enchantments || []), text(row.付与能力)];
  next.enchantBonus = enchantBonus;
  next.enchantResistanceBonus = enchantResistanceBonus;
  next.enchantAttackFields = Object.fromEntries(["物理", "魔法", "射撃", "炎", "氷", "雷", "毒", "光", "闇"].map(key => [key, number(next?.enchantAttackFields?.[key]) + number(row?.[key])]));
  next.resistanceBonus = Object.fromEntries(RESISTANCE_FIELDS.map(key => [key, number(next.resistanceBonus?.[key]) + number(enchantResistanceBonus[key])]));
  return next;
}

export function applyV39EquipmentEnchantment(state, playerId, request = {}) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  if (!player) return { ok:false, reason:"プレイヤーが見つかりません", state };
  const village = selectedVillage(player);
  if (!village?.placed) return { ok:false, reason:"付与には拠点配置が必要です", state };
  const inventory = normalizeV39EquipmentInventory(village.equipmentInventory);
  const target = inventory.find(entry => entry.key === text(request.inventoryKey));
  const row = enchantmentByName.get(text(request.enchantmentName));
  if (!target) return { ok:false, reason:"付与対象の在庫がありません", state };
  if (!row) return { ok:false, reason:"付与データが見つかりません", state };
  if (!enchantTargetMatches(row, target.item)) return { ok:false, reason:"この装備には付与できません", state };
  const failed = enchantRequirements(player, row);
  if (failed.length) return { ok:false, reason:`条件不足: ${failed.join(" / ")}`, state };
  const capacityReason = enchantCapacity(target.item, row);
  if (capacityReason) return { ok:false, reason:capacityReason, state };
  const usage = enchantUsageState(player, row, target.item, state?.timeline?.turnNumber);
  if (usage.remaining < usage.cost) {
    return { ok:false, reason:`付与回数不足(${usage.label}): 残り ${usage.remaining}/${usage.max} (必要${usage.cost})`, state, usage };
  }
  const cost = enchantCost(row);
  const material = { ...village.materialStockByType };
  const food = { ...village.foodStockByType };
  const missing = [...Object.entries(cost.material).filter(([key, value]) => number(material[key]) < value), ...Object.entries(cost.food).filter(([key, value]) => number(food[key]) < value)].map(([key]) => key);
  if (missing.length) return { ok:false, reason:`付与素材不足: ${missing.join("・")}`, state, cost };
  const taken = takeInventoryItem(inventory, target.name, target.quality, target.key);
  if (!taken.ok) return { ok:false, reason:"付与対象を取り出せません", state };
  for (const [key, value] of Object.entries(cost.material)) material[key] = round1(Math.max(0, number(material[key]) - value));
  for (const [key, value] of Object.entries(cost.food)) food[key] = round1(Math.max(0, number(food[key]) - value));
  const item = applyEnchantment(taken.item, row);
  const previousUsage = village?.equipmentActionUsage && number(village.equipmentActionUsage.turn, -1) === usage.turn
    ? village.equipmentActionUsage
    : {};
  const equipmentActionUsage = {
    turn:usage.turn,
    craftUsed:Math.max(0, Math.floor(number(previousUsage?.craftUsed))),
    enchantMagicUsed:Math.max(0, Math.floor(number(previousUsage?.enchantMagicUsed))),
    enchantFaithUsed:Math.max(0, Math.floor(number(previousUsage?.enchantFaithUsed))),
    [usage.key]:usage.used + usage.cost
  };
  const nextVillage = normalizeV39Village({
    ...village,
    materialStockByType:material,
    foodStockByType:food,
    equipmentInventory:storeInventoryItem(taken.inventory, item, 1),
    equipmentActionUsage
  }, player.race);
  const nextState = updatePlayer(state, playerId, current => updateSelectedVillage(current, nextVillage));
  return { ok:true, state:nextState, item, cost, enchantment:row };
}
