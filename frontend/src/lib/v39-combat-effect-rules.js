import weaponTypes from "../../../config/v39-weapon-effect-types.json";
import { resolveV39DefenseKind } from "./v39-defense-rules.js";

const DAMAGE_CATEGORIES = { 切断:"slash", 貫通:"thrust", 打撃:"strike" };
const text = value => String(value ?? "").trim();

// 設定を変更せず、今回の攻撃だけに使う形状と色を決定する。
export function resolveV39CombatEffect(skillRow = {}, attacker = {}, categories = [], attributes = []) {
  const explicit = text(skillRow.アニメ);
  if (explicit) return { effectName:explicit, reason:"スキル指定" };
  if (resolveV39DefenseKind(skillRow)) return { effectName:"シールド", reason:"防御効果" };
  const method = text(skillRow.攻撃手段);
  let category;
  if (method === "武器") {
    const weapon = skillRow.装備元 || attacker.equipment?.find(item => item.slot === "武器1")
      || attacker.equipment?.find(item => item.slot === "武器2");
    const source = weapon?.source || {};
    const type = text(weapon?.攻撃属性 || source.攻撃属性)
      || weaponTypes[text(source.装備名 || weapon?.name || weapon?.equipmentName)];
    category = categories.find(item => item.id === DAMAGE_CATEGORIES[type]);
  } else {
    category = categories.find(item => item.name === method);
  }
  category ||= categories.find(item => item.id === (method === "武器" ? "weapon" : "slash"));
  let attribute = null;
  let strongest = 0;
  if (method !== "武器") {
    // 同値はスキル内の記載順。属性外のステータスや系統名から色を推測しない。
    for (const [name, raw] of Object.entries(skillRow)) {
      const value = Number(raw);
      const candidate = attributes.find(item => item.name === name);
      if (candidate && Number.isFinite(value) && value > strongest) {
        strongest = value;
        attribute = candidate;
      }
    }
  }
  return {
    effectName:category?.baseEffect || "斬撃",
    reason:"自動選択", categoryId:category?.id || "", attributeName:attribute?.name || "",
    settings:{
      sequenceName:category?.baseEffect || "斬撃",
      rotationDeg:category?.rotationDeg || 0, offsetX:category?.offsetX || 0, offsetY:category?.offsetY || 0,
      orientToAttack:category?.orientToAttack === true,
      placementMode:category?.placementMode || 'target',
      scaleMultiplierPercent:category?.scaleMultiplierPercent ?? 100,
      tint:attribute?.tint || "", gradientEnabled:attribute?.gradientEnabled === true,
      gradientColorA:attribute?.gradientColorA, gradientColorB:attribute?.gradientColorB,
      gradientDirection:attribute?.gradientDirection, gradientMotionMode:attribute?.gradientMotionMode,
      gradientStartPercent:attribute?.gradientStartPercent, gradientEndPercent:attribute?.gradientEndPercent,
      gradientSpeedPercentPerSecond:attribute?.gradientSpeedPercentPerSecond,
      colorStrengthPercent:attribute?.colorStrengthPercent ?? 100
    }
  };
}
