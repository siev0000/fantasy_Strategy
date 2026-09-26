export const FACTION_UNIT_ARTWORK_SHEET_COLUMNS = 4;
export const FACTION_UNIT_ARTWORK_SHEET_ROWS = 3;

export const FACTION_UNIT_ARTWORK_SLOTS = Object.freeze([
  Object.freeze({ sheetIndex:0, artworkName:"戦士", aliases:Object.freeze(["戦士", "ファイター"]) }),
  Object.freeze({ sheetIndex:1, artworkName:"騎士", aliases:Object.freeze(["騎士", "ナイト"]) }),
  Object.freeze({ sheetIndex:2, artworkName:"軽戦士", aliases:Object.freeze(["軽戦士", "フェンサー"]) }),
  Object.freeze({ sheetIndex:3, artworkName:"格闘家", aliases:Object.freeze(["格闘家"]) }),
  Object.freeze({ sheetIndex:4, artworkName:"狩人&アーチャー", aliases:Object.freeze(["狩人&アーチャー", "狩人", "レンジャー", "アーチャー"]) }),
  Object.freeze({ sheetIndex:5, artworkName:"クロスボウ兵", aliases:Object.freeze(["クロスボウ兵"]) }),
  Object.freeze({ sheetIndex:6, artworkName:"スカウト&シーフ", aliases:Object.freeze(["スカウト&シーフ", "スカウト", "シーフ", "密偵", "盗賊"]) }),
  Object.freeze({ sheetIndex:7, artworkName:"魔導士", aliases:Object.freeze(["魔導士", "ウィザード", "エレメンタラー", "精霊師"]) }),
  Object.freeze({ sheetIndex:8, artworkName:"錬金術師", aliases:Object.freeze(["錬金術師", "アルケミスト"]) }),
  Object.freeze({ sheetIndex:9, artworkName:"クレリック", aliases:Object.freeze(["クレリック", "神官"]) }),
  Object.freeze({ sheetIndex:10, artworkName:"パラディン", aliases:Object.freeze(["パラディン", "聖騎士"]) }),
  Object.freeze({ sheetIndex:11, artworkName:"ドルイド", aliases:Object.freeze(["ドルイド", "森司祭"]) })
]);

function normalizeFactionUnitArtworkName(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　_\-・=./\\]+/g, "");
}

const artworkSlotByAlias = new Map(
  FACTION_UNIT_ARTWORK_SLOTS.flatMap(slot =>
    slot.aliases.map(alias => [normalizeFactionUnitArtworkName(alias), slot])
  )
);

export function resolveFactionUnitArtworkSlot(value) {
  const key = normalizeFactionUnitArtworkName(value);
  return key ? artworkSlotByAlias.get(key) || null : null;
}

export function resolveFactionUnitArtworkName(value) {
  return resolveFactionUnitArtworkSlot(value)?.artworkName || "";
}
