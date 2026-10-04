const DEFAULT_RESOURCE_ICON = Object.freeze({ glyph:"●︎", color:"#cbd5e1", kind:"symbol" });

const SPECIAL_RESOURCE_ICON_CANDIDATES = Object.freeze({
  キノコ:Object.freeze({ glyph:"🍄", kind:"emoji" }),
  魔力キノコ:Object.freeze({ glyph:"🍄", kind:"emoji" }),
  リンゴ:Object.freeze({ glyph:"🍎", kind:"emoji" }),
  ブドウ:Object.freeze({ glyph:"🍇", kind:"emoji" }),
  バナナ:Object.freeze({ glyph:"🍌", kind:"emoji" }),
  キウイ:Object.freeze({ glyph:"🥝", kind:"emoji" }),
  ベリー:Object.freeze({ glyph:"🫐", kind:"emoji" }),
  ココナッツ:Object.freeze({ glyph:"🥥", kind:"emoji" }),
  蜂の巣:Object.freeze({ glyph:"🐝", kind:"emoji" }),
  蜂蜜:Object.freeze({ glyph:"🍯", kind:"emoji" }),
  香辛料:Object.freeze({ glyph:"🌶️", kind:"emoji" }),
  塩:Object.freeze({ glyph:"🧂", kind:"emoji" }),
  薬草:Object.freeze({ glyph:"🌿", kind:"emoji" }),
  魔力結晶:Object.freeze({ glyph:"🔮", kind:"emoji" }),
  真珠:Object.freeze({ glyph:"🦪", kind:"emoji" }),
  火薬原料:Object.freeze({ glyph:"🧨", kind:"emoji" })
});

// Notion「UI文字アイコン候補」の保管用。候補追加は資源の正式追加を意味しない。
export const V39_UI_ICON_CANDIDATES = Object.freeze({
  洋梨:"🍐", オレンジ:"🍊", レモン:"🍋", イチゴ:"🍓", サクランボ:"🍒", モモ:"🍑",
  マンゴー:"🥭", パイナップル:"🍍", スイカ:"🍉", メロン:"🍈", クリ:"🌰", ナッツ:"🥜", オリーブ:"🫒",
  ニンジン:"🥕", 葉野菜:"🥬", ブロッコリー:"🥦", タマネギ:"🧅", ニンニク:"🧄", トマト:"🍅",
  ナス:"🍆", キュウリ:"🥒", ピーマン:"🫑", トウモロコシ:"🌽", ジャガイモ:"🥔", 豆:"🫘",
  エンドウ豆:"🫛", ショウガ:"🫚", 希少魚:"🐠", 毒魚:"🐡", エビ:"🦐", カニ:"🦀",
  ロブスター:"🦞", イカ:"🦑", タコ:"🐙", カキ:"🦪", "カキ・貝":"🦪", 卵:"🥚", 乳:"🥛", チーズ:"🧀",
  蜂蜜酒:"🍺", 果実酒:"🍷", 高級酒:"🥂", 保存食:"🥫", 薬品:"🧪", 火薬材料:"🧨",
  希少酒原料:"🍇", 果物:"🍎", 果実:"🍎", 特産品:"🍄", 鉱石:"⬢", インゴット:"▰",
  魔力加工品:"🔮", 羽毛:"🪶", 皮革:"🐾", 霊水:"💧", 遺物:"🏺", 魔力核:"⦿",
  索敵:"👁", 攻撃:"⚔︎", 防御:"🛡︎", 建設:"⚒︎", 住宅:"⌂", 設定:"⚙︎", 一覧:"☷"
});

const RESOURCE_ICON_DEFS = Object.freeze({
  食料:Object.freeze({ glyph:"🌾", color:"", kind:"emoji" }),
  穀物:Object.freeze({ glyph:"🌾", color:"", kind:"emoji" }),
  野菜:Object.freeze({ glyph:"🥕", color:"", kind:"emoji" }),
  肉:Object.freeze({ glyph:"🍖", color:"", kind:"emoji" }),
  魚:Object.freeze({ glyph:"🐟", color:"", kind:"emoji" }),
  木材:Object.freeze({ glyph:"🪵", color:"", kind:"emoji" }),
  黒木:Object.freeze({ glyph:"♣︎", color:"#5f6872", kind:"symbol" }),
  特木:Object.freeze({ glyph:"✥︎", color:"#58c98b", kind:"symbol" }),
  石材:Object.freeze({ glyph:"🪨", color:"", kind:"emoji" }),
  鉄:Object.freeze({ glyph:"⬢︎", color:"#8f969e", kind:"symbol" }),
  銀鉄:Object.freeze({ glyph:"⬢︎", color:"#e6edf3", kind:"symbol" }),
  青金鋼:Object.freeze({ glyph:"❖︎", color:"#4d95ff", kind:"symbol" }),
  赤黒鋼:Object.freeze({ glyph:"❖︎", color:"#c64040", kind:"symbol" }),
  金:Object.freeze({ glyph:"●︎", color:"#d8ad32", kind:"symbol" }),
  銀:Object.freeze({ glyph:"●︎", color:"#cbd2d9", kind:"symbol" }),
  宝石:Object.freeze({ glyph:"💎", color:"#d8ad32", kind:"emoji" }),
  死体:Object.freeze({ glyph:"🦴", color:"", kind:"emoji" }),
  魂:Object.freeze({ glyph:"✦︎", color:"#73d8ff", kind:"symbol" })
});

export function resolveV39ResourceIcon(name) {
  const key = String(name ?? "").trim();
  const found = RESOURCE_ICON_DEFS[key] || SPECIAL_RESOURCE_ICON_CANDIDATES[key]
    || (V39_UI_ICON_CANDIDATES[key] ? { glyph:V39_UI_ICON_CANDIDATES[key], kind:"emoji" } : DEFAULT_RESOURCE_ICON);
  return { glyph:found.glyph, color:found.color, kind:found.kind };
}

export function resolveV39ResourceIconGlyph(name) {
  return resolveV39ResourceIcon(name).glyph;
}

export function resolveV39ResourceIconColor(name) {
  return resolveV39ResourceIcon(name).color;
}

export function resolveV39ResourceIconKind(name) {
  return resolveV39ResourceIcon(name).kind;
}

export {
  RESOURCE_ICON_DEFS as V39_RESOURCE_ICON_DEFS,
  SPECIAL_RESOURCE_ICON_CANDIDATES as V39_SPECIAL_RESOURCE_ICON_CANDIDATES
};
