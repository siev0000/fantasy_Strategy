import {getV39EquipmentCatalog, getV39EquipmentCategory, getV39EquipmentRarity} from "../../lib/v39-equipment-rules.js";
import {getV39EquipmentDisplayStats} from "./v39-equipment-display.js";

export const V39_EQUIPMENT_CATEGORIES = ["武器", "防具", "装飾"];
const equipmentSortStats = {
  威力: ["威", ""],
  ガード: ["守", ""],
  攻撃AP: ["AP", ""],
  Cr率: ["Cr率", "%"],
  Cr威力: ["Cr威", "%"]
};
export const V39_EQUIPMENT_SORT_OPTIONS = [
  ["type", "武器種順"],
  ...["レア度", ...Object.keys(equipmentSortStats)].flatMap(label => [
    [`${label}:desc`, `${label}の高い順`],
    [`${label}:asc`, `${label}の低い順`]
  ])
];

const typeOrder = new Map(getV39EquipmentCatalog().map(({name}, index) => [name, index]));
const categoryOf = item => getV39EquipmentCategory(item.source ?? item.name);
const rarityOf = item => getV39EquipmentRarity(item.quality).level;

function compareTypes(a, b) {
  return V39_EQUIPMENT_CATEGORIES.indexOf(categoryOf(a)) - V39_EQUIPMENT_CATEGORIES.indexOf(categoryOf(b))
    || (typeOrder.get(a.name) ?? Infinity) - (typeOrder.get(b.name) ?? Infinity)
    || a.name.localeCompare(b.name, "ja");
}

export function filterV39EquipmentList(rows, {category = "", type = ""} = {}) {
  return rows.filter(({item}) => (!category || categoryOf(item) === category) && (!type || item.name === type));
}

export function getV39EquipmentListTypes(rows, category = "") {
  const items = filterV39EquipmentList(rows, {category}).map(({item}) => [item.name, item]);
  return [...new Map(items).values()].sort(compareTypes).map(item => item.name);
}

function equipmentStatValue(item, metric) {
  return Number(getV39EquipmentDisplayStats(item).find(([label]) => label === metric)?.[1]) || 0;
}

export function getV39EquipmentSortStat(item, sort) {
  const [metric] = sort.split(":");
  if (!Object.hasOwn(equipmentSortStats, metric)) return null;
  const [label, suffix] = equipmentSortStats[metric];
  const value = `${equipmentStatValue(item, metric)}${suffix}`;
  return {text: `${label} ${value}`, label: `${metric} ${value}`};
}

export function sortV39EquipmentList(rows, sort) {
  const [metric, direction] = sort.split(":");
  const compareDirection = direction === "desc" ? -1 : 1;
  const entries = rows.map(row => {
    const rarity = rarityOf(row.item);
    const value = metric === "type" ? 0 : metric === "レア度" ? rarity : equipmentStatValue(row.item, metric);
    return {row, rarity, value};
  });
  entries.sort((a, b) => compareDirection * (a.value - b.value)
    || compareTypes(a.row.item, b.row.item) || a.rarity - b.rarity);
  return entries.map(({row}) => row);
}
