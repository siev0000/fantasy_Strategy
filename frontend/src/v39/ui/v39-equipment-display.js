import "./v39-equipment-display.css";
import {getV39EquipmentRarity} from "../../lib/v39-equipment-rules.js";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));

export function renderV39EquipmentRarityBadge(quality) {
  const rarity = getV39EquipmentRarity(quality);
  const name = escapeHtml(rarity.label);
  const attributes = `class="v39-equipment-rarity-badge" data-quality="${escapeHtml(rarity.key)}" title="${name}" aria-label="${name}"`;
  const short = escapeHtml(rarity.short);
  return `<span ${attributes}>${short}</span>`;
}

export function resolveV39EquipmentIcon(item, name = item?.name ?? "") {
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

export function renderV39EquipmentDisplayRow(item, {slot = item.slotLabel ?? item.slot, expandKey, detail = "", expanded = false} = {}) {
  const rarity = getV39EquipmentRarity(item.quality ?? item.qualityLabel);
  const interactive = expandKey !== undefined;
  const tag = interactive ? "button" : "div";
  const action = interactive ? ` type="button" data-v39-equipment-key="${escapeHtml(expandKey)}" aria-expanded="${expanded}"` : "";
  return `<${tag} class="v39-equipment-display-row${interactive ? ` equipment-card${expanded ? " is-expanded" : ""}` : ""}" data-quality="${escapeHtml(rarity.key)}"${action}>
    <span class="v39-equipment-display-summary">
      <span class="v39-equipment-display-icon" aria-hidden="true">${resolveV39EquipmentIcon(item)}</span>
      <b class="v39-equipment-display-name">${escapeHtml(item.name || "名称未設定")}</b>
      <span class="v39-equipment-display-slot">${escapeHtml(slot || "—")}</span>
      <span class="v39-equipment-display-rarity" title="${escapeHtml(rarity.label)}" aria-label="${escapeHtml(rarity.label)}">${escapeHtml(rarity.short)}</span>
    </span>${interactive ? `<span class="equipment-detail">${detail}</span>` : ""}
  </${tag}>`;
}
