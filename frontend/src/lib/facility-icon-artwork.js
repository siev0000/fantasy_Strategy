const rawFacilityIconModules = import.meta.glob("../../../assets/images/アイコン/建築_アイコン一覧*.webp", {
  eager:true,
  import:"default"
});

const sheetSources = Object.fromEntries(Object.entries(rawFacilityIconModules).map(([path, src]) => {
  const match = String(path).match(/建築_アイコン一覧(\d+)\.webp$/);
  return match ? [Number(match[1]), String(src || "")] : null;
}).filter(Boolean));

// 画像は左上から右へ4列、上から下へ3行で配置されている。
const FACILITY_ICON_POSITIONS = Object.freeze({
  修道院:[1, 0, 0],
  教会:[1, 1, 0],
  神殿:[1, 2, 0],
  大聖堂:[1, 3, 0],
  農場:[1, 0, 1],
  伐採場:[1, 1, 1],
  採石場:[1, 2, 1],
  鉱山:[1, 3, 1],
  港:[1, 0, 2],
  市場:[1, 1, 2],
  倉庫:[1, 2, 2],
  公衆浴場:[1, 3, 2],
  兵舎:[2, 0, 0],
  ギルド:[2, 1, 0],
  射撃場:[2, 2, 0],
  鍛冶場:[2, 3, 0],
  防壁:[2, 0, 1],
  城壁:[2, 1, 1],
  見張り塔:[2, 2, 1],
  司令部:[2, 3, 1],
  学校:[2, 0, 2],
  魔導塔:[2, 1, 2],
  魔術工房:[2, 2, 2],
  結界装置:[2, 3, 2]
});

export function resolveFacilityIconArtwork(facilityName) {
  const name = String(facilityName || "").trim();
  const position = FACILITY_ICON_POSITIONS[name];
  if (!position) return null;
  const [sheetNumber, column, row] = position;
  const src = sheetSources[sheetNumber];
  if (!src) return null;
  return {
    type:"facility-icon",
    name,
    src,
    textureKey:`v39-facility-icon-sheet:${sheetNumber}`,
    sheetFrame:{
      sheetNumber,
      slotNumber:(row * 4) + column,
      frameKey:`facility:${name}`,
      columns:4,
      rows:3,
      column,
      row
    }
  };
}

export function hasFacilityIconArtwork(facilityName) {
  return Boolean(resolveFacilityIconArtwork(facilityName));
}
