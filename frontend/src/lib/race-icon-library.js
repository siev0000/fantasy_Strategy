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

export function resolveRaceIconName(value) {
  const target = text(value);
  if (!target) return "";

  const raceRow = findRaceRow(target);
  const factionRow = findFactionRow(target, raceRow);
  const candidates = [
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
  const iconName = resolveRaceIconName(value);
  return iconName ? getIconSrcByName(iconName, iconName) : "";
}
