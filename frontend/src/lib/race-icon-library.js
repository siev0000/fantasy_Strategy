import { factionData, raceData } from "./game-data-registry.js";
import { getIconSrcByName, hasIconName } from "./icon-library.js";

function text(value) {
  return String(value ?? "").trim();
}

const raceRows = Array.isArray(raceData) ? raceData : [];
const factionRows = Array.isArray(factionData) ? factionData : [];

function findRaceRow(value) {
  const target = text(value);
  if (!target) return null;
  return raceRows.find(row => [
    row?.key,
    row?.name,
    row?.className
  ].map(text).includes(target)) || null;
}

function findFactionRow(value, raceRow = null) {
  const target = text(value);
  const className = text(raceRow?.className);
  return factionRows.find(row => {
    const factionName = text(row?.種族);
    const kana = text(row?.カナ);
    return (!!target && (factionName === target || kana === target))
      || (!!className && kana === className);
  }) || null;
}

function resolveConfiguredRaceIconSrc(value) {
  const raw = text(value).replace(/\\/g, "/");
  if (!raw) return "";
  if (/^(?:data:|blob:|https?:\/\/)/i.test(raw)) return raw;

  const relativePath = raw.replace(/^\/+/, "");
  const basePath = text(import.meta.env.BASE_URL) || "/";
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${normalizedBase}${relativePath}`;
}

function configuredIconName(value) {
  const normalized = text(value).replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() || "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

export function resolveRaceIconName(value) {
  const target = text(value);
  if (!target) return "";

  const raceRow = findRaceRow(target);
  const factionRow = findFactionRow(target, raceRow);
  const candidates = [
    configuredIconName(raceRow?.icon),
    target,
    raceRow?.key,
    raceRow?.name,
    factionRow?.種族
  ].map(text).filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    if (hasIconName(candidate)) return candidate;
  }
  return "";
}

export function getRaceIconSrc(value) {
  const raceRow = findRaceRow(value);
  const iconName = resolveRaceIconName(value);
  if (iconName) return getIconSrcByName(iconName, iconName);

  // 設定パスに対応する同名アイコンが無い場合だけ、設定されたパスを最後の候補として使う。
  // これにより旧 /assets/images/role/... 設定でも、現在の assets/images/アイコン/... を優先できる。
  return resolveConfiguredRaceIconSrc(raceRow?.icon);
}
