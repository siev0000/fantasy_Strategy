import { getIconSrcByName, hasIconName } from "./icon-library.js";

export const RESISTANCE_ICON_NAME_MAP = Object.freeze({
  "物理耐性":"防御",
  "魔法耐性":"魔法",
  "射撃耐性":"弓",
  "切断耐性":"剣使い",
  "貫通耐性":"槍使い",
  "打撃耐性":"棍使い",
  "炎耐性":"炎",
  "氷耐性":"氷",
  "雷耐性":"雷",
  "毒耐性":"毒",
  "光耐性":"光",
  "闇耐性":"闇",
  "精神耐性":"精神",
  "盲目耐性":"眼",
  "怯み耐性":"防御2",
  "出血耐性":"肉",
  "拘束耐性":"脚",
  "幻覚耐性":"幻覚",
  "Cr率耐性":"攻撃",
  "Cr威力耐性":"攻撃"
});

function text(value) {
  return String(value ?? "").trim();
}

export function resolveResistanceIconName(resistanceKey) {
  return text(RESISTANCE_ICON_NAME_MAP[text(resistanceKey)]);
}

export function getResistanceIconSrc(resistanceKey) {
  const iconName = resolveResistanceIconName(resistanceKey);
  if (!iconName || !hasIconName(iconName)) return "";
  return getIconSrcByName(iconName, iconName);
}

export function resistanceValueTone(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "neutral";
  return number > 0 ? "positive" : "negative";
}

export function formatResistanceValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  const rounded = Math.round(number);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}
