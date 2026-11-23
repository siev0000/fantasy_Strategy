import { enemySpawnData } from "./game-data-registry.js";
import { resolveAnimalArtworkReference, getArtworkClassNames } from "./animal-artwork-config.js";
import {resolveUndeadArtworkReference} from './undead-artwork-config.js';
import {migrateRetiredMonsterArtwork} from './retired-monster-artwork.js';
import {resolveYokaiArtworkReference} from './yokai-artwork-config.js';
import {resolveBeastArtworkReference} from './beast-artwork-config.js';

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
const monsterSheetReferenceByRace = new Map();
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

  const reference = { fileName, slotNumber, sizeByLevel, race:text(row.種族), className:text(row.サブクラス) };
  // Canonical race can differ from the spawn display name (fire/flame elemental).
  // Variant rows must not replace the race's ordinary appearance.
  if (reference.race && !reference.className && !monsterSheetReferenceByRace.has(reference.race)) {
    monsterSheetReferenceByRace.set(reference.race, reference);
  }

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

const golemArtworkSlots=new Map([
  ['ウッドゴーレム',1],['クレイゴーレム',2],['ストーンゴーレム',3],['アイアンゴーレム',4],
  ['フレッシュゴーレム',5],['ボーンゴーレム',6],['クリスタルゴーレム',7],['アイスゴーレム',8],
  ['マグマゴーレム',9],['サンドゴーレム',10],['ミスリルゴーレム',11],['アダマンティンゴーレム',12],
  ['マッドゴーレム',10]
]);

const devilSummonSlots=new Map([
  ['レムレ',1],['レムレー',1],['インプ',2],['スパインド・デヴィル',3],['ヘルハウンド',4],
  ['ナイトメア',5],['ビアデッド・デヴィル',6],['バーブド・デヴィル',7],['ボーン・デヴィル',8],
  ['エリニュス',9],['アイス・デヴィル',10],['コントラクト・デヴィル',11],['ヘレシー・デヴィル',12]
]);
const angelSummonSlots=new Map([
  ['カッシシアン',1],['クルビ',2],['エンジェルズ',3],['イオファナイト',4],
  ['アークエンジェルズ',5],['エレリム',6],['プリンシパリティ',7],['バリッセ',8],
  ['モナディック・デーヴァ',9],['デュナミス',10],['モヴァニック・デーヴァ',11],['パワード',12]
]);

function resolveReferenceFromEnemy(enemy) {
  const summonName=text(enemy?.summon?.catalogName||(enemy?.id==='summon-preview'?enemy?.name:''));
  const devilSlot=devilSummonSlots.get(summonName);
  if(devilSlot)return {fileName:'デヴィル_召喚集.webp',slotNumber:devilSlot};
  const angelSlot=angelSummonSlots.get(summonName);
  if(angelSlot)return {fileName:'エンジェル_召喚集.webp',slotNumber:angelSlot};
  const undead=resolveUndeadArtworkReference(enemy);
  const yokaiReference=resolveYokaiArtworkReference(enemy);
  // Ghost/skeleton ingredients describe a fusion, not a resurrected corpse.
  const namedYokaiFusion=!enemy?.undeadOrigin&&yokaiReference
    &&(enemy?.fusionGrowth?.recipeName===yokaiReference.name||enemy?.strongFusionResultName===yokaiReference.name);
  const resultNames=[enemy?.strongFusionResultName,enemy?.fusionGrowth?.recipeName,
    enemy?.種族名,enemy?.speciesName,enemy?.enemyName,enemy?.name,enemy?.displayName].map(text).filter(Boolean);
  const baseRace=text(enemy?.race || enemy?.種族 || enemy?.raceName);
  // A sheet-defined wolf + ghost beast is not itself a resurrected ghost.
  const namedGhostBeast=!enemy?.undeadOrigin&&baseRace!=='ゴースト'
    &&undead?.fileName==='アンデッド・霊体系_ユニット集.webp'&&undead.slotNumber===6
    &&getArtworkClassNames(enemy).includes('ゴースト')&&resultNames.some(name=>{
      const ref=monsterSheetReferenceByName.get(name);
      return ref?.race===baseRace&&ref?.className==='ゴースト';
    });
  if(undead&&!namedGhostBeast&&!namedYokaiFusion)return undead;
  const fusionName=text(enemy?.fusionGrowth?.recipeName||enemy?.strongFusionResultName);
  if(fusionName==='ワイバーン')return {fileName:'ワイバーン_ユニット集.webp',slotNumber:1};
  const beastReference=resolveBeastArtworkReference(enemy);
  if(beastReference)return beastReference;
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

  if (yokaiReference) return yokaiReference;
  const golemName=baseRace||text(enemy?.種族名||enemy?.speciesName);
  const golemSlot=golemArtworkSlots.get(golemName);
  if (golemSlot&&(!fusionName||fusionName===golemName)) {
    return { fileName:'ゴーレム_ユニット集.webp', slotNumber:golemSlot };
  }

  // Fusion keeps its base race; resolve the result identity before that race's ordinary sprite.
  // Reuse the sheet-managed named references instead of maintaining a second slot table.
  for(const name of resultNames){
    if(name===baseRace)continue;
    const reference=monsterSheetReferenceByName.get(name);
    if(reference)return reference;
  }

  const animalReference = resolveAnimalArtworkReference(enemy);
  if (animalReference) return animalReference;

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
  return monsterSheetReferenceByRace.get(baseRace) || null;
}

function resolveReferenceArtwork(reference, enemy = null, grid = null) {
  reference = migrateRetiredMonsterArtwork(reference);
  if (!reference) return null;
  const baseSlotNumber = integer(reference.slotNumber);
  const columns = grid?.columns ?? MONSTER_SHEET_COLUMNS;
  const rows = grid?.rows ?? MONSTER_SHEET_ROWS;
  const slotCount = columns * rows;
  if (baseSlotNumber === null || baseSlotNumber < 1 || baseSlotNumber > slotCount) return null;
  const slotNumber = reference.sizeByLevel === true
    ? baseSlotNumber + levelSizeOffset(enemy?.level)
    : baseSlotNumber;
  if (slotNumber < 1 || slotNumber > slotCount) return null;

  const sheet = findSheet(reference.fileName);
  if (!sheet) {
    console.warn(`[monster-sheet-artwork] 画像シートが見つかりません: ${reference.fileName}`);
    return null;
  }

  const zeroBasedIndex = slotNumber - 1;
  const column = zeroBasedIndex % columns;
  const row = Math.floor(zeroBasedIndex / columns);
  const sheetKey = lookupKey(sheet.fileName);
  const kind = grid ? "named-unit" : "enemy-sheet";

  return {
    type:kind,
    src:sheet.src,
    textureKey:`v39-${kind}:${sheetKey}`,
    name:`${sheet.stem}#${slotNumber}`,
    sourcePath:sheet.sourcePath,
    sheetFrame:{
      frameKey:`monster-${sheetKey}-${slotNumber}`,
      fileName:sheet.fileName,
      slotNumber,
      column,
      row,
      columns,
      rows,
      ...(grid ? {integerBounds:true} : {})
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

export function resolveNamedUnitSheetFrame(fileName, slotNumber) {
  return resolveReferenceArtwork({fileName, slotNumber}, null, {columns:3, rows:3});
}

export function resolveNamedUnitSingleImage(fileName) {
  const sheet = findSheet(fileName);
  if (!sheet) return null;
  return {
    type:"named-unit",
    src:sheet.src,
    textureKey:`v39-named-unit:${lookupKey(sheet.fileName)}`,
    name:sheet.stem,
    sourcePath:sheet.sourcePath
  };
}
