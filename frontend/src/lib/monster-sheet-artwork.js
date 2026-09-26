import { enemySpawnData } from "./game-data-registry.js";

const MONSTER_SHEET_COLUMNS = 4;
const MONSTER_SHEET_ROWS = 3;
const MONSTER_SHEET_SLOT_COUNT = MONSTER_SHEET_COLUMNS * MONSTER_SHEET_ROWS;

const rawMonsterSheetModules = import.meta.glob(
  "../../../assets/images/units/1ファイルまとめ/魔獣_ユニット集*.{png,jpg,jpeg,webp,avif,gif}",
  {
    eager:true,
    import:"default"
  }
);

function text(value) {
  return String(value ?? "").trim();
}

function integer(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
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

function sheetNumberFromPath(path) {
  const match = pathStem(path).match(/^魔獣_ユニット集(\d+)$/);
  return match ? integer(match[1]) : null;
}

const monsterSheetByNumber = new Map(
  Object.entries(rawMonsterSheetModules)
    .map(([path, src]) => ({
      sheetNumber:sheetNumberFromPath(path),
      src:text(src),
      sourcePath:path
    }))
    .filter(row => row.sheetNumber !== null && row.src)
    .map(row => [row.sheetNumber, row])
);

const monsterSheetReferenceByName = new Map();

for (const row of Array.isArray(enemySpawnData) ? enemySpawnData : []) {
  const name = text(row?.種族名);
  const sheetNumber = integer(row?.画像シート);
  const slotNumber = integer(row?.画像番号);
  if (!name || sheetNumber === null || slotNumber === null) continue;
  if (slotNumber < 1 || slotNumber > MONSTER_SHEET_SLOT_COUNT) continue;

  const existing = monsterSheetReferenceByName.get(name);
  if (!existing) {
    monsterSheetReferenceByName.set(name, { sheetNumber, slotNumber });
    continue;
  }

  if (existing.sheetNumber !== sheetNumber || existing.slotNumber !== slotNumber) {
    console.warn(
      `[monster-sheet-artwork] 出現敵.json の画像指定が競合しています: ${name}`,
      existing,
      { sheetNumber, slotNumber }
    );
  }
}

function resolveReferenceFromEnemy(enemy) {
  const directSheetNumber = integer(
    enemy?.画像シート
    ?? enemy?.imageSheet
    ?? enemy?.sheetNumber
  );
  const directSlotNumber = integer(
    enemy?.画像番号
    ?? enemy?.imageIndex
    ?? enemy?.slotNumber
  );

  if (directSheetNumber !== null && directSlotNumber !== null) {
    return { sheetNumber:directSheetNumber, slotNumber:directSlotNumber };
  }

  const names = [
    enemy?.種族名,
    enemy?.name,
    enemy?.displayName,
    enemy?.raceName,
    enemy?.race
  ].map(text).filter(Boolean);

  for (const name of names) {
    const reference = monsterSheetReferenceByName.get(name);
    if (reference) return reference;
  }
  return null;
}

export function resolveMonsterSheetArtwork(enemy = {}) {
  const reference = resolveReferenceFromEnemy(enemy);
  if (!reference) return null;

  const { sheetNumber, slotNumber } = reference;
  if (slotNumber < 1 || slotNumber > MONSTER_SHEET_SLOT_COUNT) return null;

  const sheet = monsterSheetByNumber.get(sheetNumber);
  if (!sheet) return null;

  const zeroBasedIndex = slotNumber - 1;
  const column = zeroBasedIndex % MONSTER_SHEET_COLUMNS;
  const row = Math.floor(zeroBasedIndex / MONSTER_SHEET_COLUMNS);

  return {
    type:"enemy-sheet",
    src:sheet.src,
    textureKey:`v39-enemy-sheet:${sheetNumber}`,
    name:`魔獣_ユニット集${sheetNumber}#${slotNumber}`,
    sourcePath:sheet.sourcePath,
    sheetFrame:{
      sheetNumber,
      slotNumber,
      column,
      row,
      columns:MONSTER_SHEET_COLUMNS,
      rows:MONSTER_SHEET_ROWS
    }
  };
}

export function resolveMonsterSheetFrame(sheetNumberValue, slotNumberValue) {
  return resolveMonsterSheetArtwork({
    画像シート:sheetNumberValue,
    画像番号:slotNumberValue
  });
}
