import {
  DEFAULT_ICON_NAME,
  DEFAULT_ICON_SRC,
  getIconSrcByName,
  hasIconName
} from "./icon-library.js";
import { MAP_SETTLEMENT_MARKER_CONFIG } from "./phaser-map-panel-config.js";
import { resolveVillageScaleDefinition } from "../composables/villageCoreUtils.js";

const rawEnemyArtworkModules = import.meta.glob("../../../assets/images/illust/*.{png,jpg,jpeg,webp,avif,gif}", {
  eager: true,
  import: "default"
});
const rawUnitArtworkModules = import.meta.glob("../../../assets/images/units/**/*.{png,jpg,jpeg,webp,avif,gif}", {
  eager: true,
  import: "default"
});

function text(value) {
  return String(value ?? "").trim();
}

function normalizedPath(value) {
  return text(value).replace(/\\/g, "/");
}

function pathStem(value) {
  const path = normalizedPath(value);
  const fileName = path.split("/").pop() || "";
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function pathWithoutExtension(value) {
  const path = normalizedPath(value);
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash + 1) : "";
  return `${folder}${pathStem(path)}`;
}

function lookupKey(value) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　_\-・=./\\]+/g, "");
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function artworkRows(modules, rootFolder) {
  return Object.entries(modules).map(([path, src]) => {
    const normalized = normalizedPath(path);
    const rootAt = normalized.lastIndexOf(`/${rootFolder}/`);
    const relativePath = rootAt >= 0
      ? normalized.slice(rootAt + rootFolder.length + 2)
      : normalized.split("/").pop();
    return {
      src: text(src),
      relativePath,
      stem: pathStem(relativePath),
      relativeKey: lookupKey(pathWithoutExtension(relativePath)),
      stemKey: lookupKey(pathStem(relativePath))
    };
  }).filter(row => row.src && row.stem);
}

const enemyArtworkRows = artworkRows(rawEnemyArtworkModules, "illust");
const unitArtworkRows = artworkRows(rawUnitArtworkModules, "units");

function result(row, type) {
  if (!row) return null;
  return {
    type,
    src: row.src,
    textureKey: `v39-${type}:${row.relativeKey}`,
    name: row.stem
  };
}

function findByStem(rows, candidates) {
  for (const candidate of unique(candidates)) {
    const key = lookupKey(pathStem(candidate));
    if (!key) continue;
    const row = rows.find(entry => entry.stemKey === key);
    if (row) return row;
  }
  return null;
}

function findUnitByRaceAndName(raceName, candidates) {
  const raceKey = lookupKey(raceName);
  if (!raceKey) return null;
  for (const candidate of unique(candidates)) {
    const targetKey = lookupKey(`${raceName}/${candidate}`);
    const row = unitArtworkRows.find(entry => entry.relativeKey === targetKey);
    if (row) return row;
  }
  return null;
}

function iconArtwork(candidates) {
  const iconName = unique(candidates).find(hasIconName) || DEFAULT_ICON_NAME;
  const src = iconName ? getIconSrcByName(iconName, DEFAULT_ICON_NAME) : DEFAULT_ICON_SRC;
  if (!src) return null;
  return {
    type: "icon",
    src,
    textureKey: `v39-icon:${lookupKey(iconName || "default")}`,
    name: iconName || "アイコン"
  };
}

export function resolveUnitArtwork(unit) {
  const raceName = text(unit?.race || unit?.raceName || unit?.種族);
  const className = text(unit?.className || unit?.class || unit?.クラス);
  const explicitNames = unique([
    unit?.imageName,
    unit?.image,
    unit?.illustrationName,
    unit?.画像
  ]);
  const generatedNames = unique([
    raceName && className ? `${raceName}_${className}` : "",
    raceName && className ? `${raceName}${className}` : "",
    raceName === "只人" ? className : "",
    raceName
  ]);
  const row = raceName
    ? findUnitByRaceAndName(raceName, [...explicitNames, ...generatedNames])
    : (findByStem(unitArtworkRows, explicitNames) || findByStem(unitArtworkRows, generatedNames));
  return result(row, "unit") || iconArtwork([
    unit?.iconName,
    unit?.subIconName,
    className,
    raceName,
    unit?.name
  ]);
}

export function resolveEnemyArtwork(enemy) {
  const row = findByStem(enemyArtworkRows, [
    enemy?.imageName,
    enemy?.image,
    enemy?.illustrationName,
    enemy?.画像,
    enemy?.name,
    enemy?.displayName,
    enemy?.race,
    enemy?.className
  ]);
  return result(row, "enemy") || iconArtwork([
    enemy?.iconName,
    enemy?.subIconName,
    enemy?.race,
    enemy?.className,
    enemy?.name
  ]);
}

export function resolveSettlementArtwork(settlement) {
  const definition = resolveVillageScaleDefinition(settlement);
  const imageName = text(definition?.imageName) || "村";
  const artwork = iconArtwork([imageName]);
  return artwork ? {
    ...artwork,
    type: "settlement",
    textureKey: `v39-settlement:${lookupKey(imageName)}`,
    sizePx: Number(definition?.displaySize) || MAP_SETTLEMENT_MARKER_CONFIG.iconSize
  } : null;
}

export function resolveNestArtwork(nest) {
  const imageName = text(nest?.imageName || nest?.image || nest?.画像 || nest?.nestType || nest?.type);
  if (!imageName || !hasIconName(imageName)) return null;
  const artwork = iconArtwork([imageName]);
  return artwork ? {
    ...artwork,
    type:"nest",
    textureKey:`v39-nest:${lookupKey(imageName)}`
  } : null;
}
