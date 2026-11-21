import {groupV39EnchantmentColors,pickV39EnchantmentColors,readV39EnchantmentColors} from "../../../config/v39-enchantment-color-rules.mjs";
import enchantments from "../../../data/source/export/json/付与.json";

const {groups, keysByAbility} = groupV39EnchantmentColors(enchantments);
let colors = new Map();
let initialRead;

export const v39EnchantmentColorKeys = [...groups.keys()];
export const getV39EnchantmentColors = () => colors;

export function getV39EnchantmentMarkColor(name) {
  const style = colors.get(keysByAbility.get(name) ?? name);
  return style?.bodyColor || style?.outlineColor || "";
}

export function setV39EnchantmentColors(stored) {
  colors = readV39EnchantmentColors(stored, groups);
}

export function getV39WeaponEnchantmentColors(item) {
  const names = item?.enchantments;
  return Array.isArray(names) && names.length ? pickV39EnchantmentColors(names, colors, keysByAbility) : null;
}

export function loadV39EnchantmentColors() {
  initialRead ??= fetch("/config/v39-enchantment-colors.json", {cache:"no-store"})
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (data && typeof data === "object" && !Array.isArray(data)) setV39EnchantmentColors(data);
    }).catch(() => {});
  return initialRead;
}
