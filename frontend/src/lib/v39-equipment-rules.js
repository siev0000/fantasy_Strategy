import {resolveV39WeaponPhysicalPower,sumV39WeaponPhysicalPower,V39_WEAPON_PHYSICAL_TYPES} from "./v39-weapon-physical-power.js";
import {readV39ReductionField,normalizeV39ReductionFields} from './v39-reduction-keys.js';
import { getGameDataRows } from "./game-data-registry.js";
import { MATERIAL_RESOURCE_KEYS, normalizeV39Village } from "./v39-economy-rules.js";
import { resolveCompletedResearchLevel } from "./research-progress.js";
import { getFactionSettlements, getSelectedSettlement, replaceFactionSettlement } from "./settlement-state.js";
import { EQUIPMENT_SLOT_KEYS, RESISTANCE_FIELDS, SKILL_LEVEL_FIELDS, STATUS_FIELDS } from "../constants/unitCommon.js";
import { isMobUnit } from "../composables/unitCoreUtils.js";
import { RESEARCH_CATEGORY_ORDER } from "./research-tree-config.js";
import {newV39ProductionOrder,v39EnchantmentPoints} from "./v39-production-work.js";
import {V39_PRODUCTION_POINT_UNIT} from "./v39-production-point-scale.js";
import namedWeaponRecipes from "../../../config/v39-named-weapons.json";
import {hasV39FacilityPrerequisites} from "./v39-facility-development-rules.js";
import {getV39WeaponCraftSpecialists} from "./v39-weapon-craft-specialists.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round1 = value => Math.round(number(value) * 10) / 10;

function missingResources(stock, cost) {
  return Object.entries(cost).filter(([key, amount]) => number(stock?.[key]) < number(amount)).map(([key]) => key);
}

function spendResources(stock, cost) {
  const remaining = {...stock};
  for (const [key, amount] of Object.entries(cost)) remaining[key] = round1(Math.max(0, number(stock?.[key]) - number(amount)));
  return remaining;
}
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
const enchantmentRows = getGameDataRows("付与").filter(row => text(row?.付与能力)&&row.効果未設定!==true);
const enchantmentByName = new Map(enchantmentRows.map(row => [text(row.付与能力), row]));
const SLOT_LABELS = Object.freeze({ 武器1:"武器1", 武器2:"武器2", 頭:"頭", 体:"体", 足:"足", 装飾1:"装飾1", 装飾2:"装飾2" });

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
  if (part === "武器" && text(row?.武器分類) === "盾") return ["武器2"];
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

export function createV39EquipmentEntry(rowOrName, rarityValue = DEFAULT_V39_EQUIPMENT_RARITY_KEY, slotValue = "", {qualityMultiplierBonus = 0} = {}) {
  const row = typeof rowOrName === "string" ? equipmentByName.get(text(rowOrName)) : rowOrName;
  if (!row) return null;
  const rarity = getV39EquipmentRarity(rarityValue);
  const multiplier = rarity.multiplier + qualityMultiplierBonus;
  const slotCandidates = getV39EquipmentSlotCandidates(row);
  const requestedSlot = normalizeV39EquipmentSlot(slotValue);
  const slot = slotCandidates.includes(requestedSlot) ? requestedSlot : slotCandidates[0];
  if (!slot) return null;
  const craft = getV39EquipmentCraftCost(row, rarity.key);
  const resistanceBonus = Object.fromEntries(RESISTANCE_FIELDS.map(key => [key, Math.round(number(row?.[key]) * multiplier)]));
  const statusBonus = Object.fromEntries(STATUS_FIELDS.map(key => [key, Math.round(number(row?.[key]) * multiplier)]));
  const armorBase = Math.max(0, number(row?.耐性)) * multiplier;
  const consumption = equipmentConsumptionRow(rarity.level);
  if (!["武器1", "武器2", "装飾1", "装飾2"].includes(slot) && armorBase > 0) {
    const physical = Math.round(armorBase * Math.max(0, number(consumption?.防具_物理, 1)));
    const magic = Math.round(armorBase * Math.max(0, number(consumption?.防具_魔法)));
    resistanceBonus.物理軽減 += physical;
    resistanceBonus.魔法軽減 += magic;
  }
  return {
    slot,
    slotLabel:SLOT_LABELS[slot],
    name:text(row.装備名),
    quality:rarity.key,
    qualityLabel:rarity.label,
    rarityMultiplier:multiplier,
    power:Math.round(number(row?.威力) * multiplier),
    guard:Math.round(number(row?.ガード) * multiplier),
    attackAp:Math.round(number(row?.攻撃AP)),
    magicAp:Math.round(number(row?.魔法AP)),
    shot:Math.round(number(row?.射撃) * multiplier),
    criticalRate:Math.round(number(row?.Cr率) * multiplier),
    criticalPower:scaleCriticalPower(row?.Cr威力, multiplier),
    range:optionalNumber(row?.射程) === null ? null : Math.round(optionalNumber(row?.射程)),
    penalty:Math.round(number(row?.ペナルティ)),
    statusBonus,
    resistanceBonus,
    traits:[row?.特性1, row?.特性2, row?.特性3, row?.特性4].map(text).filter(Boolean),
    craftLevel:craft.level,
    craftCostMaterial:{ ...(craft.material || {}) },
    source:row
  };
}

export function normalizeV39EquipmentItem(item, index = 0, options = {}) {
  const name = text(item?.name ?? item?.equipmentName ?? item?.装備名);
  if (!name) return null;
  const namedWeapon = text(item?.namedWeapon?.name) && text(item?.instanceId) ? item.namedWeapon : null;
  const normalized = createV39EquipmentEntry(name, item?.quality ?? item?.qualityLabel, item?.slot ?? EQUIPMENT_SLOT_KEYS[index],
    namedWeapon ? {qualityMultiplierBonus:number(namedWeapon.qualityMultiplierBonus)} : options);
  if (!normalized) return null;
  const resistanceBonus = { ...normalized.resistanceBonus };
  const enchantments=Array.isArray(item?.enchantments)?item.enchantments.map(text).filter(Boolean):[];
  const enchanted=enchantments.map(name=>enchantmentByName.get(name)).filter(Boolean);
  const sum=key=>enchanted.reduce((total,row)=>total+number(row[key]),0);
  const hasSavedAttack=Array.isArray(item?.enchantments)&&item.enchantments.length&&item.enchantAttackFields;
  const rangeBonus=sum("射程")+sum("射程補正");
  for (const key of RESISTANCE_FIELDS) resistanceBonus[key] += number(readV39ReductionField(item?.enchantResistanceBonus,key));
  return {
    ...normalized,
    slot:normalized.slot,
    name,
    quality:normalized.quality,
    qualityLabel:normalized.qualityLabel,
    ...(text(item?.id) ? { id:text(item.id) } : {}),
    ...(text(item?.instanceId) ? { instanceId:text(item.instanceId) } : {}),
    ...(namedWeapon ? {namedWeapon:{...namedWeapon}} : {}),
    resistanceBonus,
    power:hasSavedAttack?number(item.power,normalized.power):normalized.power+sum("全威力"),
    guard:hasSavedAttack?number(item.guard,normalized.guard):normalized.guard+sum("ガード")+sum("防御"),
    criticalRate:hasSavedAttack?number(item.criticalRate,normalized.criticalRate):normalized.criticalRate+sum("Cr率"),
    criticalPower:hasSavedAttack?number(item.criticalPower,normalized.criticalPower):normalized.criticalPower+sum("Cr威力"),
    range:hasSavedAttack?item.range??normalized.range:rangeBonus?Math.max(1,number(normalized.range)+rangeBonus):normalized.range,
    enchantments,
    enchantAttackFields:item?.enchantAttackFields??Object.fromEntries(enchantAttackFields.map(key=>[key,sum(key)])),
    enchantEffects:item?.enchantEffects??[...new Set(enchanted.flatMap(row=>text(row.効果).split("/").filter(Boolean)))],
    enchantAttackCount:item?.enchantAttackCount??sum("攻撃回数"),
    enchantBonus:item?.enchantBonus && typeof item.enchantBonus === "object" ? { ...item.enchantBonus } : {},
    enchantResistanceBonus:item?.enchantResistanceBonus && typeof item.enchantResistanceBonus === "object" ? normalizeV39ReductionFields(item.enchantResistanceBonus) : {}
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

function equipmentItemKey(item) {
  return item.namedWeapon && item.instanceId ? item.instanceId : inventoryKey(item.name,item.quality,item.enchantments);
}

export function normalizeV39EquipmentInventory(inventory) {
  const merged = new Map();
  for (const row of Array.isArray(inventory) ? inventory : []) {
    const item = normalizeV39EquipmentItem(row?.item || row);
    const count = Math.max(0, Math.floor(number(row?.count ?? row?.quantity, 1)));
    if (!item || count <= 0) continue;
    const key = equipmentItemKey(item);
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

function researchLevel(player, field, settlement = getSelectedSettlement(player?.factionState)) {
  return Math.max(number(settlement?.cityLevels?.[field]), resolveCompletedResearchLevel(player?.factionState?.research, field.replace(/Lv$/, "")));
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

export function inspectV39EquipmentCraft(player, request = {}) {
  if (!player) return { ok:false, reason:"プレイヤーが見つかりません" };
  const village = selectedVillage(player);
  if (!village?.placed) return { ok:false, reason:"装備作成には拠点配置が必要です" };
  const count = Math.max(1, Math.min(99, Math.floor(number(request.count, 1))));
  const item = createV39EquipmentEntry(request.name, request.rarity);
  if (!item) return { ok:false, reason:"装備データが見つかりません" };
  const cost = getV39EquipmentCraftCost(item.name, item.quality, count);
  if (!cost.ok) return cost;
  if (researchLevel(player, "鍛冶Lv") < cost.level) return { ok:false, reason:`鍛冶Lv${cost.level}が必要です`, cost };
  const missing = missingResources(village.materialStockByType, cost.material);
  if (missing.length) return { ok:false, reason:`素材不足: ${missing.join("・")}`, cost };
  return { ok:true, village, item, count, cost };
}

export function craftV39Equipment(state, playerId, request = {}) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const enchanted = Boolean(request.enchantmentNames?.length);
  const check = enchanted ? inspectV39EquipmentCraftPlan(player, request, state?.timeline?.turnNumber) : inspectV39EquipmentCraft(player, request);
  if (!check.ok) return { ...check, state };
  const {village, item, count, cost} = check;
  const stock = enchanted ? village.materialStockByType : spendResources(village.materialStockByType, cost.material);
  const nextVillage = normalizeV39Village({ ...village, materialStockByType:stock, equipmentInventory:storeInventoryItem(village.equipmentInventory, item, count) }, player.race);
  const nextState = updatePlayer(state, playerId, row => updateSelectedVillage(row, nextVillage));
  return { ok:true, state:nextState, item, count, cost, inventoryKey:inventoryKey(item.name, item.quality, item.enchantments) };
}

export function getV39EquipmentProductionPointCost(item, count) {
  const rarity = getV39EquipmentRarity(item?.quality);
  const base = rarity.level * count * V39_PRODUCTION_POINT_UNIT;
  const weapon = getV39EquipmentSlotCandidates(item?.source || item?.name).includes("武器1");
  return weapon ? Math.ceil(base * rarity.multiplier) : base;
}

export function reserveV39EquipmentCraft(state, playerId, request = {}) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const turn = Math.max(1,Math.floor(number(state?.timeline?.turnNumber,1)));
  const check = inspectV39EquipmentCraftPlan(player,request,turn,{reserve:true});
  if(!check.ok)return {...check,state};
  const {village,item,count,cost}=check;
  const workOrder=newV39ProductionOrder(village);
  const order={id:`equipment-${workOrder}`,workOrder,item,count,startedTurn:turn,workProgress:0,
    workRequired:getV39EquipmentProductionPointCost(item,count),...check.enchantmentWork,
    inventoryKey:inventoryKey(item.name,item.quality,item.enchantments)};
  const nextVillage=normalizeV39Village({...village,productionOrder:workOrder,
    materialStockByType:spendResources(village.materialStockByType,cost.material),
    foodStockByType:spendResources(village.foodStockByType,cost.food??{}),
    equipmentProductionQueue:[...(village.equipmentProductionQueue||[]),order]},player.race);
  return {ok:true,state:updatePlayer(state,playerId,row=>updateSelectedVillage(row,nextVillage)),item,count,cost,order};
}

export function canV39ChangeUnitEquipmentSlot(unit,slot) {
  if(!unit||unit.summon)return false;
  if(unit.golemBuild){
    if(slot!=='武器1'&&slot!=='武器2')return false;
    return (unit.techniques||[]).some(technique=>{
      const row=technique.source||technique;
      return row.行動==='P'&&row.効果==='武器装備解禁'&&unit.golemBuild.additionalSkillNames?.includes(row.名前);
    });
  }
  return !isMobUnit(unit);
}

export function changeV39UnitEquipment(state, playerId, request = {}) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const unit = player?.factionState?.units?.find(row => text(row?.id) === text(request.unitId));
  if (!unit) return { ok:false, reason:"キャラクターが見つかりません", state };
  if (unit.summon) return {ok:false,state,reason:"召喚ユニットの装備は交換できません"};
  const slot = normalizeV39EquipmentSlot(request.slot);
  if (!slot) return { ok:false, reason:"装備部位が不正です", state };
  if (!canV39ChangeUnitEquipmentSlot(unit,slot)) return {ok:false,state,reason:unit.golemBuild?"この装備枠は変更できません":"モブは固定装備です。レア度一新を使用してください"};
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
  const missing = missingResources(village.materialStockByType, totalCost);
  if (missing.length) return { ok:false, reason:`素材不足: ${missing.join("・")}`, state };
  const stock = spendResources(village.materialStockByType, totalCost);
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
      const key = equipmentItemKey(normalized);
      equipped.set(key, {count:number(equipped.get(key)?.count)+1,item:normalized});
    }
  }
  const combined = new Map(stock.map(row => [row.key, { ...row, remainingCount:row.count, equippedCount:number(equipped.get(row.key)?.count) }]));
  for (const [key, {count:equippedCount,item}] of equipped) {
    if (combined.has(key)) continue;
    combined.set(key, {key,name:item.name,quality:item.quality,qualityLabel:item.qualityLabel,count:0,remainingCount:0,equippedCount,item});
  }
  return [...combined.values()].sort((a, b) => a.name.localeCompare(b.name, "ja")).map(row => ({
    ...row,
    namedWeaponOptions:getV39NamedWeaponOptions(row.item,village,player?.factionState)
  }));
}

export function getV39NamedWeaponOptions(item, village, faction) {
  if(item?.namedWeapon)return [];
  const recipes=namedWeaponRecipes.filter(recipe=>recipe.baseWeapon===item?.name);
  if(!recipes.length)return [];
  const quality=getV39EquipmentRarity(item.quality).level;
  const stages=new Map();
  for(const name of item.enchantments||[]){
    const affix=enchantmentByName.get(text(name));
    if(!affix)continue;
    const family=text(affix.付与系統)||text(affix.付与能力);
    stages.set(family,Math.max(number(stages.get(family)),number(affix.段階,1)));
  }
  return recipes.map(recipe=>{
    const minimum=getV39EquipmentRarity(recipe.minimumQuality);
    const missing=quality<minimum.level?[`${minimum.label}以上`]:[];
    if(recipe.requiredFacility&&!hasV39FacilityPrerequisites(village??{},{前提施設:recipe.requiredFacility})){
      missing.push(`必要施設: ${recipe.requiredFacility}`);
    }
    if(recipe.requiredClass||recipe.minimumCraftSkill){
      const available=getV39WeaponCraftSpecialists(faction,village).filter(worker=>!recipe.requiredClass||worker.classNames.has(recipe.requiredClass));
      if(!available.length)missing.push(recipe.requiredClass?`鍛冶場の担当者に${recipe.requiredClass}が必要です`:"鍛冶場に担当者が必要です");
      else if(!available.some(worker=>worker.craftSkill>=number(recipe.minimumCraftSkill)))missing.push(`担当者の制作 ${recipe.minimumCraftSkill}以上`);
    }
    const stock=village?.materialStockByType;
    for(const {family, minimumStage} of recipe.requiredAffixes){
      if(number(stages.get(family))<minimumStage)missing.push(`${family} 第${minimumStage}段階以上`);
    }
    for(const [name,amount] of Object.entries(recipe.materials)){
      if(!Number.isInteger(amount)||amount<1)missing.push(`${name}の消費数が未設定`);
      else if(number(stock?.[name])<amount)missing.push(`${name} ${number(stock?.[name])}/${amount}`);
    }
    return {recipe,available:missing.length===0,missing,preview:previewV39NamedWeapon(item,recipe)};
  });
}

function previewV39NamedWeapon(item, recipe) {
  const base=normalizeV39EquipmentItem({name:item.name,quality:item.quality,slot:item.slot},0,
    {qualityMultiplierBonus:number(recipe.qualityMultiplierBonus)});
  if(!base)return null;
  const affixes=(item.enchantments||[]).map(name=>enchantmentByName.get(text(name))).filter(Boolean);
  return affixes.reduce(applyNormalizedEnchantment,base);
}

export function resolveV39NamedWeaponCreation(player, turn) {
  const faction=player.factionState;
  let nextFaction=faction;
  const receipts=[];
  for(const village of getFactionSettlements(faction)){
    if(!village.placed||!village.equipmentInventory?.some(row=>{
      const item=row?.item??row;
      return item?.enchantments?.length&&!item.namedWeapon&&namedWeaponRecipes.some(recipe=>recipe.baseWeapon===item.name);
    }))continue;
    const materialStockByType={...village.materialStockByType};
    const equipmentInventory=[];
    let serial=number(village.namedWeaponSerial);
    let changed=false;
    for(const row of normalizeV39EquipmentInventory(village.equipmentInventory)){
      let count=row.count;
      while(count>0){
        const match=getV39NamedWeaponOptions(row.item,{...village,materialStockByType},faction)
          .find(option=>option.available&&option.preview);
        if(!match)break;
        const {recipe,preview}=match;
        Object.assign(materialStockByType,spendResources(materialStockByType,recipe.materials));
        const instanceId=`named-weapon:${player.id}:${village.settlementId}:${++serial}`;
        const item={...preview,instanceId,namedWeapon:{name:recipe.name,qualityMultiplierBonus:recipe.qualityMultiplierBonus,
          ...(recipe.uniqueEffect?{uniqueEffect:recipe.uniqueEffect}:{})}};
        equipmentInventory.push({key:instanceId,item,count:1,name:item.name,quality:item.quality,qualityLabel:item.qualityLabel});
        receipts.push({id:instanceId,sourceKey:row.key,settlementId:village.settlementId,settlementName:village.name,
          turn,item:{name:item.name,quality:item.quality,slot:item.slot,enchantments:item.enchantments,namedWeapon:item.namedWeapon,instanceId}});
        changed=true;
        count--;
      }
      if(count>0)equipmentInventory.push({...row,count});
    }
    if(changed){
      const updated=normalizeV39Village({...village,materialStockByType,equipmentInventory,namedWeaponSerial:serial},player.race);
      nextFaction=replaceFactionSettlement(nextFaction,updated,{ownerPlayerId:player.id,select:false});
    }
  }
  if(!receipts.length)return player;
  return {...player,factionState:{...nextFaction,namedWeaponReceipts:[...(faction.namedWeaponReceipts||[]),...receipts].slice(-100)}};
}

function enchantTargetMatches(row, item, part) {
  const targets = text(row?.対象装備).split(/[,、\/／|]/).map(text).filter(Boolean);
  if (!targets.length) return true;
  const slots = part ? [part] : getV39EquipmentSlotCandidates(item?.source || item?.name);
  return targets.some(target => {
    if (target === "武器") return slots.some(slot => slot.startsWith("武器"));
    if (target === "防具") return slots.some(slot => ["頭", "体", "足"].includes(slot));
    if (target === "装飾") return slots.some(slot => slot.startsWith("装飾"));
    return target === item.name || item.name.includes(target) || target.includes(item.name);
  });
}

function enchantRequirements(player, row, settlement) {
  const failed = [];
  let maxShortfall = 0;
  for (const key of RESEARCH_CATEGORY_ORDER) {
    const required = Math.max(0, Math.floor(number(row?.[key])));
    if (!required) continue;
    const current = researchLevel(player, key, settlement);
    if (required > current) {
      failed.push(`${key} ${current}/${required}`);
      maxShortfall = Math.max(maxShortfall, required - current);
    }
  }
  return {failed, maxShortfall};
}

function enchantCost(row) {
  const level = Math.max(1, Math.floor(number(row?.Lv, 1)));
  const source = consumptionRows.find(entry => text(entry?.種別) === "付与" && Math.floor(number(entry?.Lv)) === level);
  const material = Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key => [key, Math.max(0, number(source?.[key]))]));
  const foodKeys = ["穀物", "野菜", "肉", "魚", "死体", "魂"];
  const food = Object.fromEntries(foodKeys.map(key => [key, Math.max(0, number(source?.[key]))]));
  return { level, material, food };
}

export function getV39MissingEquipmentResources(village, {material, food}) {
  return [...missingResources(village?.materialStockByType, material), ...missingResources(village?.foodStockByType, food)];
}

const armorEnchantLimits = {
  common:{total:2,single:2},
  uncommon:{total:6,single:3},
  rare:{total:9,single:5}
};

export const golemEnchantParts = Object.freeze({頭:'兜',体:'鎧',足:'靴'});

export function getV39GolemEnchantLimits(quality) {
  return quality==='epic'?{total:12,single:5}:armorEnchantLimits[quality];
}

export function getV39GolemEnchantmentLimitReason(level, limit, used = 0) {
  if (level > limit.single) return "個別Lv上限を超えています";
  if (used + level > limit.total) return "合計Lv上限を超えています";
  return "";
}

export function getV39GolemEnchantOptions(player, settlement, part) {
  const name = golemEnchantParts[part];
  if (!name) return [];
  return enchantmentRows.filter(row => enchantTargetMatches(row,{name},part)).map(row => ({
    name:text(row.付与能力), row, cost:enchantCost(row), failed:enchantRequirements(player,row,settlement).failed
  }));
}

export function getV39EquipmentEnhancementDisplay(item){
  const names=Array.isArray(item?.enchantments)?item.enchantments:[];
  const applied=names.map(name=>({name,row:enchantmentByName.get(text(name))}));
  return {
    name:item?.namedWeapon?.name || applied.map(({row})=>text(row?.装備名接頭辞)).join("")+(item?.name||"名称未設定"),
    used:applied.reduce((sum,{row})=>sum+Math.max(0,number(row?.Lv)),0),
    applied:applied.map(({name,row})=>({name,level:row?.Lv}))
  };
}

export function getV39EquipmentEnchantCapacity(item, enchantCapBonus = 0) {
  const slots=getV39EquipmentSlotCandidates(item?.source||item?.name);
  const weapon=slots.some(slot=>slot.startsWith("武器"));
  const armor=slots.some(slot=>["頭","体","足"].includes(slot));
  const quality=getV39EquipmentRarity(item?.quality);
  const {used,applied}=getV39EquipmentEnhancementDisplay(item);
  const limit=weapon?{total:quality.level+enchantCapBonus}:armor?armorEnchantLimits[quality.key]:null;
  return {used,total:limit?.total,single:limit?.single,count:applied.length,weapon,applied};
}

function weaponCraftEnchantBonus(player,village,item){
  if(!getV39EquipmentSlotCandidates(item?.source||item?.name).some(slot=>slot.startsWith("武器")))return 0;
  return Math.max(0,...getV39WeaponCraftSpecialists(player?.factionState,village).map(worker=>worker.enchantCapBonus));
}

export function getV39EquipmentEnchantCapacityForPlayer(player,item){
  return getV39EquipmentEnchantCapacity(item,weaponCraftEnchantBonus(player,selectedVillage(player),item));
}

function enchantCapacity(item, row, enchantCapBonus) {
  const names=Array.isArray(item?.enchantments)?item.enchantments:[];
  if (names.some(name=>name===text(row?.付与能力)||row?.付与系統&&enchantmentByName.get(name)?.付与系統===row.付与系統))
    return "同じ付与は重複できません";
  const {used,total,single,count,weapon}=getV39EquipmentEnchantCapacity(item,enchantCapBonus);
  const level=Math.max(0,number(row?.Lv));
  if (weapon&&count>=3) return "武器付与は最大3つです";
  if (single!=null&&level>single) return `1つあたりの付与Lvは${single}までです`;
  if (total!=null&&used+level>total)
    return `付与Lv合計は${total}までです`;
  return "";
}

function equipmentActionUsageForTurn(village, turn) {
  const usage = village?.equipmentActionUsage;
  return usage && number(usage.turn, -1) === turn ? usage : {};
}

function enchantUsageState(player, village, row, item, level, turnNumber) {
  const turn = Math.max(1, Math.floor(number(turnNumber, 1)));
  const faith = number(row?.信仰Lv) > 0;
  const key = faith ? "enchantFaithUsed" : "enchantMagicUsed";
  const label = faith ? "信仰" : "魔術";
  const rarityLevel = getV39EquipmentRarity(item?.quality).level;
  const cost = Math.max(1, level + Math.max(0, rarityLevel - 1))*V39_PRODUCTION_POINT_UNIT;
  return {key,label,cost,turn,...v39EnchantmentPoints(player,village,key,turn)};
}

function enchantUsageReason(usage) {
  return usage.remaining < usage.cost
    ? `付与回数不足(${usage.label}): 残り ${usage.remaining}/${usage.max} (必要${usage.cost})`
    : "";
}

function inspectEquipmentEnchantment(player, village, item, row, turnNumber, count, enchantCapBonus) {
  if (!enchantTargetMatches(row, item)) return {matchesTarget:false};
  const {failed, maxShortfall} = enchantRequirements(player, row, village);
  const capacityReason = enchantCapacity(item, row, enchantCapBonus);
  if (capacityReason) return {matchesTarget:true, failed, maxShortfall, capacityReason};
  const cost = scaleEnchantmentCost(enchantCost(row), count);
  const perItemUsage = enchantUsageState(player, village, row, item, cost.level, turnNumber);
  const usage = {...perItemUsage, cost:perItemUsage.cost * count};
  const missing = getV39MissingEquipmentResources(village, cost);
  return {matchesTarget:true, failed, maxShortfall, capacityReason, cost, usage, missing, usageReason:enchantUsageReason(usage)};
}

function scaleEnchantmentCost(cost, count) {
  if (count === 1) return cost;
  const scale = amounts => Object.fromEntries(Object.entries(amounts).map(([name, value]) => [name, round1(value * count)]));
  return {...cost, material:scale(cost.material), food:scale(cost.food)};
}

export function getV39EnchantmentOptions(player, inventoryKeyValue, turnNumber = 1) {
  const village = selectedVillage(player);
  const inventory = normalizeV39EquipmentInventory(village?.equipmentInventory);
  const target = inventory.find(entry => entry.key === text(inventoryKeyValue));
  return target ? equipmentEnchantmentOptions(player, village, target.item, turnNumber) : [];
}

export function getV39CraftEnchantmentOptions(player, request, turnNumber = 1) {
  const item = createV39EquipmentEntry(request.name, request.rarity);
  const village = selectedVillage(player);
  if (!item || !village?.placed) return [];
  const count = Math.max(1, Math.min(99, Math.floor(number(request.count, 1))));
  const cost = getV39EquipmentCraftCost(item.name, item.quality, count);
  const materialStockByType = spendResources(village.materialStockByType, cost.material);
  return equipmentEnchantmentOptions(player, {...village, materialStockByType}, item, turnNumber, count, true);
}

function equipmentEnchantmentOptions(player, village, item, turnNumber, count = 1, reserve = false) {
  const enchantCapBonus=weaponCraftEnchantBonus(player,village,item);
  return enchantmentRows.flatMap(row => {
    const {matchesTarget, failed, maxShortfall, capacityReason, cost, usage, missing, usageReason} =
      inspectEquipmentEnchantment(player, village, item, row, turnNumber, count, enchantCapBonus);
    if (!matchesTarget || capacityReason) return [];
    const reason = [
      !village.placed ? "拠点配置が必要です" : "",
      failed.length ? `研究不足 ${failed.join(" / ")}` : "",
      missing.length ? `素材不足 ${missing.join("・")}` : "",
      reserve ? "" : usageReason
    ].filter(Boolean).join(" / ");
    return [{name:text(row.付与能力), row, cost, usage, maxShortfall, available:!reason, reason}];
  });
}

const enchantAttackFields = ["物理", "切断", "貫通", "打撃", "魔法", "射撃", "炎", "氷", "雷", "毒", "光", "闇", "出血", "怯み", "呪い", "盲目", "幻覚", "拘束"];

export function describeV39EnchantmentEffects(row) {
  return [...new Set([...enchantAttackFields, "全威力", "ガード", "Cr率", "Cr威力", "射程", "射程補正", "攻撃回数", ...STATUS_FIELDS, ...SKILL_LEVEL_FIELDS, ...RESISTANCE_FIELDS])]
    .flatMap(name => {
      const value = number(row?.[name]);
      return value ? [`${name === "射程補正" ? "射程" : name} ${value > 0 ? "+" : ""}${value}`] : [];
    }).concat(row?.効果?["効果 "+row.効果]:[]);
}

function applyEnchantment(item, row) {
  return applyNormalizedEnchantment(normalizeV39EquipmentItem(item),row);
}

function applyNormalizedEnchantment(next, row) {
  const enchantBonus = { ...(next.enchantBonus || {}) };
  const enchantResistanceBonus = { ...(next.enchantResistanceBonus || {}) };
  for (const key of [...STATUS_FIELDS,...SKILL_LEVEL_FIELDS]) enchantBonus[key] = number(enchantBonus[key]) + number(row?.[key]);
  for (const key of RESISTANCE_FIELDS) enchantResistanceBonus[key] = number(enchantResistanceBonus[key]) + number(row?.[key]);
  next.power = Math.round(number(next.power) + number(row?.全威力));
  next.guard = Math.round(number(next.guard) + number(row?.ガード) + number(row?.防御));
  next.criticalRate = Math.round(number(next.criticalRate) + number(row?.Cr率));
  next.criticalPower = Math.round(number(next.criticalPower) + number(row?.Cr威力));
  const rangeBonus=number(row?.射程補正??row?.射程);
  if (rangeBonus) next.range = Math.max(1, Math.round(number(next.range) + rangeBonus));
  next.enchantEffects=[...new Set([...next.enchantEffects,...text(row?.効果).split("/").filter(Boolean)])];
  next.enchantAttackCount+=number(row?.攻撃回数);
  next.enchantments = [...(next.enchantments || []), text(row.付与能力)];
  next.enchantBonus = enchantBonus;
  next.enchantResistanceBonus = enchantResistanceBonus;
  next.enchantAttackFields = Object.fromEntries(enchantAttackFields.map(key => [key, number(next?.enchantAttackFields?.[key]) + number(row?.[key])]));
  next.resistanceBonus = Object.fromEntries(RESISTANCE_FIELDS.map(key => [key, number(next.resistanceBonus?.[key]) + number(row?.[key])]));
  return next;
}

export function previewV39EquipmentEnchantment(item,rows){
  const before=normalizeV39EquipmentItem(item);
  const after=rows.reduce(applyEnchantment,before);
  const changes=[];
  function compare(label,oldValue,newValue,suffix=""){
    const current=number(oldValue),result=number(newValue);
    if(current!==result)changes.push({label,current,result,suffix});
  }
  const weapon=String(before.slot).startsWith("武器");
  compare("威力",weapon?sumV39WeaponPhysicalPower(before):before.power,weapon?sumV39WeaponPhysicalPower(after):after.power);
  compare("ガード",before.guard,after.guard);
  compare("射程",before.range,after.range);
  compare("Cr率",before.criticalRate,after.criticalRate,"%");
  compare("Cr威力",before.criticalPower,after.criticalPower,"%");
  compare("攻撃回数",1+before.enchantAttackCount,1+after.enchantAttackCount);
  const beforePhysical=weapon?resolveV39WeaponPhysicalPower(before):null;
  const afterPhysical=weapon?resolveV39WeaponPhysicalPower(after):null;
  for(const key of enchantAttackFields){
    const physical=weapon&&V39_WEAPON_PHYSICAL_TYPES.includes(key);
    compare(key,physical?beforePhysical[key]:before.enchantAttackFields[key],physical?afterPhysical[key]:after.enchantAttackFields[key]);
  }
  for(const key of [...STATUS_FIELDS,...SKILL_LEVEL_FIELDS]){
    const base=number(before.statusBonus?.[key]);
    compare(key,base+number(before.enchantBonus[key]),base+number(after.enchantBonus[key]));
  }
  for(const key of RESISTANCE_FIELDS)compare(key,before.resistanceBonus[key],after.resistanceBonus[key]);
  return {item:after,changes,effects:after.enchantEffects.filter(effect=>!before.enchantEffects.includes(effect))};
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
  const result = applyEquipmentEnchantmentToItem(player, village, target.item, row, state?.timeline?.turnNumber);
  if (!result.ok) return {...result, state};
  const taken = takeInventoryItem(inventory, target.name, target.quality, target.key);
  if (!taken.ok) return { ok:false, reason:"付与対象を取り出せません", state };
  const {item, cost} = result;
  const nextVillage = normalizeV39Village({
    ...result.village, equipmentInventory:storeInventoryItem(taken.inventory, item, 1)
  }, player.race);
  const nextState = updatePlayer(state, playerId, current => updateSelectedVillage(current, nextVillage));
  return { ok:true, state:nextState, item, cost, enchantment:row, inventoryKey:equipmentItemKey(item) };
}

function applyEquipmentEnchantmentToItem(player, village, item, row, turnNumber, count = 1, reserve = false) {
  const {matchesTarget, failed, capacityReason, usage, usageReason, cost, missing} =
    inspectEquipmentEnchantment(player, village, item, row, turnNumber, count, weaponCraftEnchantBonus(player,village,item));
  if (!matchesTarget) return {ok:false, reason:"この装備には付与できません"};
  if (failed.length) return {ok:false, reason:`条件不足: ${failed.join(" / ")}`};
  if (capacityReason) return {ok:false, reason:capacityReason};
  if (!reserve && usageReason) return {ok:false, reason:usageReason, usage};
  if (missing.length) return {ok:false, reason:`付与素材不足: ${missing.join("・")}`, cost};
  const previousUsage = equipmentActionUsageForTurn(village, usage.turn);
  const equipmentActionUsage = {
    turn:usage.turn,
    craftUsed:Math.max(0, Math.floor(number(previousUsage?.craftUsed))),
    enchantMagicUsed:Math.max(0, Math.floor(number(previousUsage?.enchantMagicUsed))),
    enchantFaithUsed:Math.max(0, Math.floor(number(previousUsage?.enchantFaithUsed))),
    [usage.key]:usage.used + usage.cost
  };
  return {ok:true, item:applyEnchantment(item, row), cost, usage, village:{
    ...village,
    materialStockByType:spendResources(village.materialStockByType, cost.material),
    foodStockByType:spendResources(village.foodStockByType, cost.food),
    equipmentActionUsage
  }};
}

export function inspectV39EquipmentCraftPlan(player, request, turnNumber = 1, {reserve = false} = {}) {
  const craft = inspectV39EquipmentCraft(player, request);
  const baseItem = craft.item ?? createV39EquipmentEntry(request.name, request.rarity);
  const names = request.enchantmentNames ?? [];
  if (!names.length || !baseItem) return {...craft, item:baseItem};
  const count = Math.max(1, Math.min(99, Math.floor(number(request.count, 1))));
  const rows = names.map(name => enchantmentByName.get(text(name)));
  const material = {...(craft.cost?.material ?? getV39EquipmentCraftCost(baseItem.name, baseItem.quality, count).material)};
  const food = {};
  const validRows = rows.filter(Boolean);
  for (const row of validRows) {
    const extra = scaleEnchantmentCost(enchantCost(row), count);
    for (const [totals, amounts] of [[material, extra.material], [food, extra.food]]) {
      for (const [key, amount] of Object.entries(amounts)) totals[key] = round1(number(totals[key]) + amount);
    }
  }
  const cost = {...craft.cost, material, food};
  const preview = {...previewV39EquipmentEnchantment(baseItem, validRows), cost, count};
  if (!craft.ok) return {...craft, ...preview};
  if (rows.some(row => !row)) return {ok:false, ...preview, reason:"付与データが見つかりません"};
  const missing = getV39MissingEquipmentResources(craft.village, cost);
  if (missing.length) return {ok:false, ...preview, reason:`素材不足: ${[...new Set(missing)].join("・")}`};
  let village = {...craft.village, materialStockByType:spendResources(craft.village.materialStockByType, craft.cost.material)};
  let item = craft.item;
  const enchantmentWork={magicRequired:0,faithRequired:0};
  for (const row of rows) {
    const result = applyEquipmentEnchantmentToItem(player, village, item, row, turnNumber, count, reserve);
    if (!result.ok) return {...result, ...preview};
    const field=result.usage.key==="enchantFaithUsed"?"faithRequired":"magicRequired";
    enchantmentWork[field]+=result.usage.cost;
    ({item, village} = result);
  }
  return {ok:true, ...preview, item, village:reserve?craft.village:village,enchantmentWork};
}


export function applyV39EquipmentEnchantments(state,playerId,{inventoryKey,enchantmentNames}){
  if(!enchantmentNames.length)return {ok:false,state,reason:"付与を追加してください"};
  let next=state;
  let result;
  for(const enchantmentName of enchantmentNames){
    result=applyV39EquipmentEnchantment(next,playerId,{inventoryKey,enchantmentName});
    if(!result.ok)return {...result,state};
    next=result.state;
    inventoryKey=result.inventoryKey;
  }
  return result;
}
