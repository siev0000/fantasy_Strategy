import {
  FACTION_UNIT_ARTWORK_SHEET_COLUMNS,
  FACTION_UNIT_ARTWORK_SHEET_ROWS,
  resolveFactionUnitArtworkSlot
} from "../constants/factionUnitArtwork.js";

const UNIT_SHEET_BASE_PATH = "/assets/images/units/1ファイルまとめ";
const UNIT_SHEET_EXTENSIONS = Object.freeze(["png", "webp", "jpg", "jpeg", "avif", "gif"]);

function text(value) {
  return String(value ?? "").trim();
}

function positionPercent(index, count) {
  if (count <= 1) return 0;
  return (index / (count - 1)) * 100;
}

function raceSheetSourceCandidates(raceName) {
  const race = text(raceName);
  if (!race) return [];
  const encodedRace = encodeURIComponent(race);
  return UNIT_SHEET_EXTENSIONS.map(extension =>
    `${UNIT_SHEET_BASE_PATH}/${encodedRace}.${extension}`
  );
}

export function resolveFactionUnitSheetFrame(unit = {}) {
  const raceName = text(unit?.race || unit?.raceName || unit?.種族);
  const className = text(unit?.className || unit?.class || unit?.クラス);
  const slot = resolveFactionUnitArtworkSlot(className);

  if (!slot || !raceName) return null;

  const sheetIndex = Number(slot.sheetIndex);
  const maxFrames = FACTION_UNIT_ARTWORK_SHEET_COLUMNS * FACTION_UNIT_ARTWORK_SHEET_ROWS;
  if (!Number.isInteger(sheetIndex) || sheetIndex < 0 || sheetIndex >= maxFrames) return null;

  const column = sheetIndex % FACTION_UNIT_ARTWORK_SHEET_COLUMNS;
  const row = Math.floor(sheetIndex / FACTION_UNIT_ARTWORK_SHEET_COLUMNS);

  return {
    raceName,
    className,
    artworkName:slot.artworkName,
    sheetIndex,
    column,
    row,
    columns:FACTION_UNIT_ARTWORK_SHEET_COLUMNS,
    rows:FACTION_UNIT_ARTWORK_SHEET_ROWS,
    srcCandidates:raceSheetSourceCandidates(raceName),
    imageStyle:{
      width:`${FACTION_UNIT_ARTWORK_SHEET_COLUMNS * 100}%`,
      height:`${FACTION_UNIT_ARTWORK_SHEET_ROWS * 100}%`,
      left:`-${column * 100}%`,
      top:`-${row * 100}%`
    },
    backgroundSize:`${FACTION_UNIT_ARTWORK_SHEET_COLUMNS * 100}% ${FACTION_UNIT_ARTWORK_SHEET_ROWS * 100}%`,
    backgroundPosition:`${positionPercent(column, FACTION_UNIT_ARTWORK_SHEET_COLUMNS)}% ${positionPercent(row, FACTION_UNIT_ARTWORK_SHEET_ROWS)}%`
  };
}
