import { enemySpawnData } from "./game-data-registry.js";

const MONSTER_SHEET_COLUMNS = 4;
const MONSTER_SHEET_ROWS = 3;
const MONSTER_SHEET_SLOT_COUNT = MONSTER_SHEET_COLUMNS * MONSTER_SHEET_ROWS;
const MONSTER_ARTWORK_LEVEL_SIZE_THRESHOLDS = Object.freeze({
  medium:15,
  large:30,
  extraLarge:45
});

const rawMonsterSheetModules = import.meta.glob(
  "../../../assets/images/units/1ファイルまとめ/*.{png,jpg,jpeg,webp,avif,gif}",
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

function levelSizeOffset(levelValue) {
  const level = Math.max(1, integer(levelValue) ?? 1);
  if (level >= MONSTER_ARTWORK_LEVEL_SIZE_THRESHOLDS.extraLarge) return 3;
  if (level >= MONSTER_ARTWORK_LEVEL_SIZE_THRESHOLDS.large) return 2;
  if (level >= MONSTER_ARTWORK_LEVEL_SIZE_THRESHOLDS.medium) return 1;
  return 0;
}

function normalizedPath(value) {
  return text(value).replace(/\\/g, "/");
}

function pathFileName(value) {
  const path = normalizedPath(value);
  return path.split("/").pop() || "";
}

function pathStem(value) {
  const fileName = pathFileName(value);
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function lookupKey(value) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　_\-・=./\\]+/g, "");
}

function legacySheetFileName(sheetNumber) {
  return `魔獣_ユニット集${sheetNumber}.webp`;
}

const monsterSheets = Object.entries(rawMonsterSheetModules)
  .map(([path, src]) => ({
    src:text(src),
    sourcePath:path,
    fileName:pathFileName(path),
    stem:pathStem(path)
  }))
  .filter(row => row.src && row.fileName);

const monsterSheetByFileName = new Map(
  monsterSheets.map(row => [lookupKey(row.fileName), row])
);
const monsterSheetByStem = new Map(
  monsterSheets.map(row => [lookupKey(row.stem), row])
);

function findSheet(fileNameValue) {
  const value = text(fileNameValue);
  if (!value) return null;
  return monsterSheetByFileName.get(lookupKey(value))
    || monsterSheetByStem.get(lookupKey(pathStem(value)))
    || null;
}

const monsterSheetReferenceByName = new Map();
const monsterSheetReferenceByDefinitionId = new Map();

for (const row of Array.isArray(enemySpawnData) ? enemySpawnData : []) {
  const name = text(row?.種族名);
  const definitionId = text(row?.ID);
  const directFileName = text(row?.画像ファイル);
  const legacySheetNumber = integer(row?.画像シート);
  const slotNumber = integer(row?.画像番号);
  const fileName = directFileName || (legacySheetNumber !== null ? legacySheetFileName(legacySheetNumber) : "");
  const sizeByLevel = row?.画像サイズ連動 === true;

  if (!fileName || slotNumber === null) continue;
  if (slotNumber < 1 || slotNumber > MONSTER_SHEET_SLOT_COUNT) continue;

  const reference = { fileName, slotNumber, sizeByLevel };

  if (definitionId) {
    monsterSheetReferenceByDefinitionId.set(definitionId, reference);
  }

  if (!name) continue;
  const existing = monsterSheetReferenceByName.get(name);
  if (!existing) {
    monsterSheetReferenceByName.set(name, reference);
    continue;
  }

  if (lookupKey(existing.fileName) !== lookupKey(fileName) || existing.slotNumber !== slotNumber) {
    console.warn(
      `[monster-sheet-artwork] 出現敵.json の画像指定が競合しています: ${name}`,
      existing,
      reference
    );
  }
}

function resolveReferenceFromEnemy(enemy) {
  const directFileName = text(
    enemy?.画像ファイル
    ?? enemy?.imageFile
    ?? enemy?.sheetFile
  );
  const legacySheetNumber = integer(
    enemy?.画像シート
    ?? enemy?.imageSheet
    ?? enemy?.sheetNumber
  );
  const directSlotNumber = integer(
    enemy?.画像番号
    ?? enemy?.imageIndex
    ?? enemy?.slotNumber
  );

  if (directSlotNumber !== null) {
    const sizeByLevel = enemy?.画像サイズ連動 === true || enemy?.sizeArtworkByLevel === true;
    if (directFileName) return { fileName:directFileName, slotNumber:directSlotNumber, sizeByLevel };
    if (legacySheetNumber !== null) {
      return { fileName:legacySheetFileName(legacySheetNumber), slotNumber:directSlotNumber, sizeByLevel };
    }
  }

  const definitionIds = [
    enemy?.sourceDefinitionId,
    enemy?.definitionId,
    enemy?.spawnDefinitionId,
    enemy?.ID
  ].map(text).filter(Boolean);

  for (const definitionId of definitionIds) {
    const reference = monsterSheetReferenceByDefinitionId.get(definitionId);
    if (reference) return reference;
  }

  const names = [
    enemy?.種族名,
    enemy?.speciesName,
    enemy?.enemyName,
    enemy?.name,
    enemy?.displayName,
    enemy?.raceName,
    enemy?.race,
    enemy?.imageName,
    enemy?.image,
    enemy?.画像
  ].map(text).filter(Boolean);

  for (const name of names) {
    const reference = monsterSheetReferenceByName.get(name);
    if (reference) return reference;
  }

  for (const definitionId of definitionIds) {
    const parts = definitionId.split(":");
    const name = parts[0] === "出現敵" ? text(parts[2]) : "";
    const reference = name ? monsterSheetReferenceByName.get(name) : null;
    if (reference) return reference;
  }
  return null;
}

function resolveReferenceArtwork(reference, enemy = null) {
  if (!reference) return null;
  const baseSlotNumber = integer(reference.slotNumber);
  if (baseSlotNumber === null || baseSlotNumber < 1 || baseSlotNumber > MONSTER_SHEET_SLOT_COUNT) return null;
  const slotNumber = reference.sizeByLevel === true
    ? baseSlotNumber + levelSizeOffset(enemy?.level)
    : baseSlotNumber;
  if (slotNumber < 1 || slotNumber > MONSTER_SHEET_SLOT_COUNT) return null;

  const sheet = findSheet(reference.fileName);
  if (!sheet) {
    console.warn(`[monster-sheet-artwork] 画像シートが見つかりません: ${reference.fileName}`);
    return null;
  }

  const zeroBasedIndex = slotNumber - 1;
  const column = zeroBasedIndex % MONSTER_SHEET_COLUMNS;
  const row = Math.floor(zeroBasedIndex / MONSTER_SHEET_COLUMNS);
  const sheetKey = lookupKey(sheet.fileName);

  return {
    type:"enemy-sheet",
    src:sheet.src,
    textureKey:`v39-enemy-sheet:${sheetKey}`,
    name:`${sheet.stem}#${slotNumber}`,
    sourcePath:sheet.sourcePath,
    sheetFrame:{
      frameKey:`monster-${sheetKey}-${slotNumber}`,
      fileName:sheet.fileName,
      slotNumber,
      column,
      row,
      columns:MONSTER_SHEET_COLUMNS,
      rows:MONSTER_SHEET_ROWS
    }
  };
}

export function resolveMonsterSheetArtwork(enemy = {}) {
  return resolveReferenceArtwork(resolveReferenceFromEnemy(enemy), enemy);
}

export function resolveMonsterSheetFrame(fileNameOrSheetNumber, slotNumberValue) {
  const legacySheetNumber = integer(fileNameOrSheetNumber);
  const fileName = legacySheetNumber !== null
    ? legacySheetFileName(legacySheetNumber)
    : text(fileNameOrSheetNumber);
  return resolveReferenceArtwork({
    fileName,
    slotNumber:slotNumberValue
  });
}
