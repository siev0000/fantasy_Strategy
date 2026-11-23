import "./v39-equipment-display.css";
import "./v39-resource-item-icon.css";
import {getV39EquipmentEnhancementDisplay,getV39EquipmentRarity, getV39EquipmentSlotCandidates} from "../../lib/v39-equipment-rules.js";
import {normalizeV39IconColor,renderV39IconAssignment,resolveV39IconAssignment} from "../../lib/v39-icon-assignment.js";
import {getV39EnchantmentMarkColor,getV39WeaponEnchantmentColors} from "../../lib/v39-enchantment-color-state.js";
import {resolveV39WeaponPhysicalPower,V39_WEAPON_PHYSICAL_TYPES} from "../../lib/v39-weapon-physical-power.js";
import {getV39SharedIconRow} from "../../lib/v39-shared-icon-settings.js";
import {resolveV39EquipmentIconSheet} from "../../lib/v39-equipment-icon-sheets.js";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));

export function renderV39EnchantmentMark(name, color) {
  return `<i title="${escapeHtml(name)}"${color ? ` style="--affix-color:${color}"` : ""}></i>`;
}

export function renderV39EquipmentTile(row, {selected, keyAttribute, showName = false, sortStat}) {
  const {item,key,equippedCount} = row;
  const remaining = row.remainingCount ?? row.count;
  const rarity = getV39EquipmentRarity(item.quality);
  const {name,used,applied} = getV39EquipmentEnhancementDisplay(item);
  const label = `${name}${used ? ` +${used}` : ""} ${rarity.label} 在庫${remaining}${equippedCount ? ` 装備中${equippedCount}` : ""}${sortStat ? ` ${sortStat.label}` : ""}`;
  const count = `<span class="v39-equip-count" aria-hidden="true">${equippedCount ? "残" : ""}${remaining}</span>`;
  return `<button type="button" class="v39-equip-tile" data-quality="${escapeHtml(rarity.key)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" aria-pressed="${selected}" ${keyAttribute}="${escapeHtml(key)}">
    <span class="v39-equip-tile-badges" aria-hidden="true">
      <span class="v39-equip-rank">${renderV39EquipmentRarityBadge(rarity.key)}</span>
      ${applied.length ? `<span class="v39-equip-enchantment-badges">
        ${used ? `<span class="v39-equipment-enhancement-level">+${escapeHtml(used)}</span>` : ""}
        <span class="v39-equip-enchantment-colors">${applied.map(({name})=>renderV39EnchantmentMark(name,getV39EnchantmentMarkColor(name))).join("")}</span>
      </span>` : ""}
    </span>
    <span class="v39-equip-icon" aria-hidden="true">${renderV39EquipmentIcon(item)}</span>
    ${sortStat ? `<span class="v39-equip-tile-footer" aria-hidden="true"><span class="v39-equip-tile-stat">${escapeHtml(sortStat.text)}</span>${count}</span>` : count}
    ${showName ? `<span class="v39-equip-tile-name" aria-hidden="true">${escapeHtml(name)}</span>` : ""}
  </button>`;
}

export function getV39EquipmentDisplayStats(item) {
  const weapon=String(item.slot).startsWith("武器");
  const physical=weapon?resolveV39WeaponPhysicalPower(item):null;
  return [
    ["威力", physical?Object.values(physical).reduce((total,value)=>total+value,0):item.power],
    ...(physical&&V39_WEAPON_PHYSICAL_TYPES.slice(1).some(type=>physical[type])
      ?V39_WEAPON_PHYSICAL_TYPES:V39_WEAPON_PHYSICAL_TYPES.slice(1))
      .map(type=>[type,physical?.[type]??item.source?.[type]]),
    ["魔力", item.statusBonus?.魔力], ["ガード", item.guard],
    ["攻撃AP", item.attackAp], ["魔法AP", item.magicAp], ["射撃", item.shot], ["射程", item.range],
    ["Cr率", item.criticalRate, "%"], ["Cr威力", item.criticalPower, "%"], ["ペナルティ", item.penalty]
  ].filter(([, value]) => Number.isFinite(Number(value)) && Number(value) !== 0);
}

export function renderV39EquipmentRarityBadge(quality) {
  const rarity = getV39EquipmentRarity(quality);
  const name = escapeHtml(rarity.label);
  const attributes = `class="v39-equipment-rarity-badge" data-quality="${escapeHtml(rarity.key)}" title="${name}" aria-label="${name}"`;
  const short = escapeHtml(rarity.short);
  return `<span ${attributes}>${short}</span>`;
}

function equipmentGlyph(item, name) {
  const source = item?.source;
  if (source?.武器分類 === "盾") return "🛡";
  const part = source?.装備箇所 || String(item?.slot ?? "").replace(/[12]$/, "");
  switch (part) {
    case "武器":
      if (/弓|ボウ/.test(name)) return "🏹";
      if (/斧/.test(name)) return "🪓";
      if (/槌|鎚|ハンマー/.test(name)) return "🔨";
      if (/篭手|籠手|ガントレット/.test(name)) return "🥊";
      return "🗡";
    case "頭": return "⛑";
    case "体":
    case "胴": return "🥋";
    case "足": return "👢";
    case "装飾": return "💍";
    default: return "⚒";
  }
}

function renderWeaponGlow(icon, item) {
  const rarity = getV39EquipmentRarity(item?.quality ?? item?.qualityLabel);
  return `<span class="v39-equipment-weapon-glow" data-quality="${escapeHtml(rarity.key)}" aria-hidden="true">${icon}</span>`;
}

export function renderV39EquipmentIcon(item, name = item?.name ?? "", appearance) {
  const namedArtwork = item?.namedWeapon?.name && ["webp", "png", "jpg", "jpeg", "svg"]
    .map(extension => resolveV39EquipmentIconSheet(`${item.namedWeapon.name}.${extension}`)?.src)
    .find(Boolean);
  if (namedArtwork) {
    return renderWeaponGlow(`<img class="v39-named-weapon-icon" src="${escapeHtml(namedArtwork)}" alt="">`, item);
  }
  const shared = getV39SharedIconRow("装備", item?.source?.装備名 ?? name);
  let assignment = resolveV39IconAssignment(shared ?? item?.source);
  const weapon = getV39EquipmentSlotCandidates(item?.source ?? name).includes("武器1");
  const glyph = equipmentGlyph(item, name);
  const colors = weapon ? (appearance ?? getV39WeaponEnchantmentColors(item)) : null;
  const tint = normalizeV39IconColor(colors?.bodyColor);
  const outline = normalizeV39IconColor(colors?.outlineColor);
  if (tint) assignment = {...(assignment ?? {glyph}), color:tint};
  let icon = renderV39IconAssignment(assignment, "v39-equipment-icon-sprite") || glyph;
  if (!weapon) return icon;
  if (outline) icon = `<span class="v39-equipment-weapon-outline" style="--v39-weapon-outline:${outline}">${icon}</span>`;
  return renderWeaponGlow(icon, item);
}

export function renderV39EquipmentDisplayRow(item, {slot = item.slotLabel ?? item.slot, expandKey, detail = "", expanded = false, changeUnitId, inline = false} = {}) {
  const rarity = getV39EquipmentRarity(item.quality ?? item.qualityLabel);
  const {name,used}=getV39EquipmentEnhancementDisplay(item);
  const interactive = expandKey !== undefined;
  const tag = interactive ? "button" : inline ? "span" : "div";
  const action = interactive ? ` type="button" data-v39-equipment-key="${escapeHtml(expandKey)}" aria-expanded="${expanded}"${changeUnitId ? ` data-v39-equip-hold-unit="${escapeHtml(changeUnitId)}" data-v39-equip-hold-slot="${escapeHtml(item.slot)}"` : ""}` : "";
  return `<${tag} class="v39-equipment-display-row${interactive ? ` equipment-card${expanded ? " is-expanded" : ""}` : ""}" data-quality="${escapeHtml(rarity.key)}"${action}>
    <span class="v39-equipment-display-summary">
      <span class="v39-equipment-display-icon" aria-hidden="true">${renderV39EquipmentIcon(item)}</span>
      <b class="v39-equipment-display-name">${escapeHtml(name)}${used?` <span class="v39-equipment-enhancement-level">+${escapeHtml(used)}</span>`:""}</b>
      <span class="v39-equipment-display-slot">${escapeHtml(slot || "—")}</span>
      <span class="v39-equipment-display-rarity" title="${escapeHtml(rarity.label)}" aria-label="${escapeHtml(rarity.label)}">${escapeHtml(rarity.short)}</span>
    </span>${interactive ? `<span class="equipment-detail">${detail}</span>` : ""}
  </${tag}>`;
}
