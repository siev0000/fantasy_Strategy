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

const iconOptions = Object.entries(rawIconModules)
  .map(([path, src]) => {
    const name = toText(basenameNoExt(path));
    if (!name || !toText(src)) return null;
    return { name, src: String(src) };
  })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name, "ja"));

const iconMap = new Map(iconOptions.map(row => [row.name, row.src]));
const FALLBACK_ICON_NAME = iconMap.has("肉体")
  ? "肉体"
  : (iconOptions[0]?.name || "");

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

export function getIconSrcByName(name, fallbackName = DEFAULT_ICON_NAME) {
  const normalized = resolveIconName(name, fallbackName);
  return iconMap.get(normalized) || DEFAULT_ICON_SRC;
}
