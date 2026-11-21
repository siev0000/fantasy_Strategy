import sheetDefinitions from "../../../config/v39-icon-sheets.json";
import weapons from "../../../assets/images/units/1ファイルまとめ/weapons.webp";
import armory from "../../../assets/images/units/1ファイルまとめ/armory.webp";
import extra from "../../../assets/images/units/1ファイルまとめ/武具追加分.webp";
import aerial from "../../../assets/images/units/1ファイルまとめ/aerial_arsenal.webp";
import arcanum from "../../../assets/images/units/1ファイルまとめ/arcanum.webp";
import inventory from "../../../assets/images/units/1ファイルまとめ/inventory.webp";
import firearms from "../../../assets/images/units/1ファイルまとめ/firearm-OCAL.webp";

import swordsOcal from "../../../assets/images/units/1ファイルまとめ/sword-OCAL.webp";
import swords7Soul from "../../../assets/images/units/1ファイルまとめ/sword-7Soul1.webp";
import swordsBabysamurai from "../../../assets/images/units/1ファイルまとめ/sword-babysamurai.webp";
import music from "../../../assets/images/units/1ファイルまとめ/spritesheet_x4.webp";

import armorIcons from "../../../assets/images/units/1ファイルまとめ/防具アイコン集_1.webp";
import futuristicWeapons from "../../../assets/images/units/1ファイルまとめ/近未来武器一覧.webp";
import weaponMaterials from "../../../assets/images/units/1ファイルまとめ/武器素材集.webp";

import terrain from "../../../config/v39-terrain-patterns.json";
import {iconSheetCatalog} from "../../../config/v39-icon-catalog.mjs";
const dedicated = import.meta.glob("../../../assets/images/アイコン/*.{webp,png,jpg,jpeg,svg}", {eager:true, import:"default"});
const terrainImages = import.meta.glob("../../../assets/images/units/1ファイルまとめ/地形レイヤー集.webp", {eager:true, import:"default"});
const sources = new Map([
  ["weapons.webp",weapons], ["armory.webp",armory], ["武具追加分.webp",extra], ["aerial_arsenal.webp",aerial],
  ["firearm-OCAL.webp",firearms], ["arcanum.webp",arcanum], ["inventory.webp",inventory],
  ["sword-OCAL.webp",swordsOcal], ["sword-7Soul1.webp",swords7Soul],
  ["sword-babysamurai.webp",swordsBabysamurai], ["spritesheet_x4.webp",music],
  ["防具アイコン集_1.webp",armorIcons], ["近未来武器一覧.webp",futuristicWeapons], ["武器素材集.webp",weaponMaterials]
]);
const basename = path => path.split("/").pop();
for (const [path, url] of Object.entries({...terrainImages, ...dedicated})) sources.set(basename(path), url);
const catalog = iconSheetCatalog(sheetDefinitions, terrain, Object.keys(dedicated).map(basename));
export const V39_EQUIPMENT_ICON_SHEETS = Object.freeze(catalog.map(sheet => ({...sheet, src:sources.get(sheet.filename)})));

export function resolveV39EquipmentIconSheet(filename) {
  const key = String(filename ?? "").trim().replace(/^(weapons|armory)\.png$/, "$1.webp");
  return V39_EQUIPMENT_ICON_SHEETS.find(sheet => sheet.filename === key);
}

export function normalizeV39EquipmentIconNumber(sheet, value) {
  const number = Number(value);
  const firstNumber = sheet?.firstNumber ?? 1;
  return Number.isInteger(number) && number >= 1 && number < firstNumber
    ? number + firstNumber - 1
    : number;
}
