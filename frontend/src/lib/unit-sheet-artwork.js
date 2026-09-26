import {
  FACTION_UNIT_ARTWORK_SHEET_COLUMNS,
  FACTION_UNIT_ARTWORK_SHEET_ROWS,
  resolveFactionUnitArtworkSlot
} from "../constants/factionUnitArtwork.js";

const rawUnitSheetModules = import.meta.glob(
  "../../../assets/images/units/1ファイルまとめ/*.{png,jpg,jpeg,webp,avif,gif}",
  {
    eager:true,
    import:"default"
  }
);

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

function lookupKey(value) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　_\-・=./\\]+/g, "");
}

const unitSheetRows = Object.entries(rawUnitSheetModules).map(([path, src]) => ({
  path,
  src,
  stem:pathStem(path),
  key:lookupKey(pathStem(path))
}));

function resolveRaceSheet(raceName) {
  const raceKey = lookupKey(raceName);
  if (!raceKey) return null;

  const exact = unitSheetRows.find(row => row.key === raceKey);
  if (exact) return exact;

  return unitSheetRows.find(row =>
    row.key.startsWith(raceKey)
    || row.key.endsWith(raceKey)
    || row.key.includes(raceKey)
  ) || null;
}

function positionPercent(index, count) {
  if (count <= 1) return 0;
  return (index / (count - 1)) * 100;
}

export function resolveFactionUnitSheetFrame(unit = {}) {
  const raceName = text(unit?.race || unit?.raceName || unit?.種族);
  const className = text(unit?.className || unit?.class || unit?.クラス);
  const slot = resolveFactionUnitArtworkSlot(className);
  const sheet = resolveRaceSheet(raceName);

  if (!slot || !sheet) return null;

  const sheetIndex = Number(slot.sheetIndex);
  const maxFrames = FACTION_UNIT_ARTWORK_SHEET_COLUMNS * FACTION_UNIT_ARTWORK_SHEET_ROWS;
  if (!Number.isInteger(sheetIndex) || sheetIndex < 0 || sheetIndex >= maxFrames) return null;

  const column = sheetIndex % FACTION_UNIT_ARTWORK_SHEET_COLUMNS;
  const row = Math.floor(sheetIndex / FACTION_UNIT_ARTWORK_SHEET_COLUMNS);

  return {
    src:sheet.src,
    sourcePath:sheet.path,
    raceName,
    className,
    artworkName:slot.artworkName,
    sheetIndex,
    column,
    row,
    columns:FACTION_UNIT_ARTWORK_SHEET_COLUMNS,
    rows:FACTION_UNIT_ARTWORK_SHEET_ROWS,
    backgroundSize:`${FACTION_UNIT_ARTWORK_SHEET_COLUMNS * 100}% ${FACTION_UNIT_ARTWORK_SHEET_ROWS * 100}%`,
    backgroundPosition:`${positionPercent(column, FACTION_UNIT_ARTWORK_SHEET_COLUMNS)}% ${positionPercent(row, FACTION_UNIT_ARTWORK_SHEET_ROWS)}%`
  };
}

export function hasFactionUnitSheets() {
  return unitSheetRows.length > 0;
}
