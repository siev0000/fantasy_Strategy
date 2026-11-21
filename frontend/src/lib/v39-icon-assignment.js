import {normalizeV39EquipmentIconNumber, resolveV39EquipmentIconSheet} from "./v39-equipment-icon-sheets.js";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));

export function normalizeV39IconColor(value) {
  const color = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "";
}

export function resolveV39IconColorFilter(assignment) {
  const color = normalizeV39IconColor(assignment?.color);
  if (!color) return "";
  const channels = [1, 3, 5].map(start => (parseInt(color.slice(start, start + 2), 16) / 255).toFixed(5));
  const alpha = "0 0 0 1 0";
  // Keep alpha untouched. Images map luminance to a black → selected color → white ramp.
  const filter = assignment.glyph
    ? `<feColorMatrix type="matrix" values="${channels.map(channel => `0 0 0 0 ${channel}`).join(" ")} ${alpha}"/>`
    : `<feColorMatrix type="saturate" values="0"/><feComponentTransfer>${channels.map(
      (channel,index) => `<feFunc${"RGB"[index]} type="table" tableValues="0 ${channel} 1"/>`
    ).join("")}</feComponentTransfer>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><filter id="tint" color-interpolation-filters="sRGB">${filter}</filter></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}#tint")`;
}

export function resolveV39IconAssignment(row) {
  const glyph = typeof row?.文字アイコン === "string" ? row.文字アイコン.trim() : "";
  const color = normalizeV39IconColor(row?.アイコン色);
  const tint = color ? {color} : {};
  if (glyph) return {glyph, ...tint};
  const sheet = resolveV39EquipmentIconSheet(row?.画像ファイル);
  const number = normalizeV39EquipmentIconNumber(sheet, row?.画像番号);
  if (!sheet || !Number.isInteger(number) || number < sheet.firstNumber || number > (sheet.lastNumber ?? sheet.columns * sheet.rows) || sheet.excludedNumbers?.includes(number)) return null;
  return {filename:sheet.filename, number, ...tint};
}

export function resolveV39IconSpriteStyle({src,columns,rows}, number) {
  const x = (number - 1) % columns;
  const y = Math.floor((number - 1) / columns);
  return {
    backgroundImage:`url("${src}")`,
    backgroundSize:`${columns * 100}% ${rows * 100}%`,
    backgroundPosition:`${columns > 1 ? x / (columns - 1) * 100 : 0}% ${rows > 1 ? y / (rows - 1) * 100 : 0}%`
  };
}

export function renderV39IconAssignment(assignment, spriteClass) {
  if (!assignment) return "";
  const filter = resolveV39IconColorFilter(assignment);
  if (assignment.glyph) {
    return `<span aria-hidden="true"${filter ? ` style="display:inline-block;filter:${escapeHtml(filter)}"` : ""}>${escapeHtml(assignment.glyph)}</span>`;
  }
  const sheet = resolveV39EquipmentIconSheet(assignment.filename);
  const {backgroundImage,backgroundSize,backgroundPosition} = resolveV39IconSpriteStyle(sheet, assignment.number);
  return `<span class="${spriteClass}" aria-hidden="true" style="background-image:${escapeHtml(backgroundImage)};background-size:${backgroundSize};background-position:${backgroundPosition}${filter ? `;filter:${escapeHtml(filter)}` : ""}"></span>`;
}
