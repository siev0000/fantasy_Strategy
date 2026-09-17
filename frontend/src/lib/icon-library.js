import { FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS } from "./v39-economy-rules.js";
import { resolveV39ResourceIconGlyph } from "./resource-icon-glyphs.js";

const rawIconModules = import.meta.glob("../../../assets/images/アイコン/*.{png,jpg,jpeg,webp,svg}", {
  eager: true,
  import: "default"
});

function basenameNoExt(path) {
  const normalized = String(path || "").replace(/\\/g, "/");
  const name = normalized.split("/").pop() || "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function toText(value) {
  return String(value ?? "").trim();
}

function escapeXmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const iconOptions = Object.entries(rawIconModules)
  .map(([path, src]) => {
    const name = toText(basenameNoExt(path));
    if (!name || !toText(src)) return null;
    return { name, src: String(src) };
  })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name, "ja"));

const iconMap = new Map(iconOptions.map(row => [row.name, row.src]));
const resourceIconNameSet = new Set([...FOOD_RESOURCE_KEYS, ...MATERIAL_RESOURCE_KEYS]);
const resourceTextIconSrcMap = new Map();
const FALLBACK_ICON_NAME = iconMap.has("肉体")
  ? "肉体"
  : (iconOptions[0]?.name || "");

function buildResourceTextIconSrc(name) {
  const resourceName = toText(name);
  if (!resourceName) return "";
  const cached = resourceTextIconSrcMap.get(resourceName);
  if (cached) return cached;
  const glyph = resolveV39ResourceIconGlyph(resourceName);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${escapeXmlText(resourceName)}"><text x="32" y="34" text-anchor="middle" dominant-baseline="middle" font-size="42" font-family="Segoe UI Emoji,Apple Color Emoji,Noto Color Emoji,sans-serif">${escapeXmlText(glyph)}</text></svg>`;
  const src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  resourceTextIconSrcMap.set(resourceName, src);
  return src;
}

export const DEFAULT_ICON_NAME = FALLBACK_ICON_NAME;
export const DEFAULT_ICON_SRC = iconMap.get(DEFAULT_ICON_NAME) || "";

export function listIconOptions() {
  return iconOptions.slice();
}

export function resolveIconName(name, fallbackName = DEFAULT_ICON_NAME) {
  const target = toText(name);
  if (target && iconMap.has(target)) return target;
  const fallback = toText(fallbackName);
  if (fallback && iconMap.has(fallback)) return fallback;
  return DEFAULT_ICON_NAME;
}

export function hasIconName(name) {
  const target = toText(name);
  return !!target && iconMap.has(target);
}

export function getIconSrcByName(name, fallbackName = DEFAULT_ICON_NAME) {
  const target = toText(name);
  if (target && iconMap.has(target)) return iconMap.get(target) || "";
  if (target && resourceIconNameSet.has(target)) return buildResourceTextIconSrc(target);
  const normalized = resolveIconName(target, fallbackName);
  return iconMap.get(normalized) || DEFAULT_ICON_SRC;
}

export function getResourceIconSrc(name) {
  const target = toText(name);
  return target ? buildResourceTextIconSrc(target) : "";
}
