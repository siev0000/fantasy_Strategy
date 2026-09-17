const RESOURCE_ICON_GLYPHS = Object.freeze({
  食料:"🌾",
  穀物:"🌾",
  野菜:"🥕",
  肉:"🍖",
  魚:"🐟",
  木材:"🪵",
  黒木:"🌑",
  特木:"🌳",
  石材:"🪨",
  鉄:"⛏️",
  銀鉄:"⚙️",
  青金鋼:"🔷",
  赤黒鋼:"🔻",
  金:"🪙",
  銀:"🥈",
  宝石:"💎",
  死体:"🦴",
  魂:"👻"
});

export function resolveV39ResourceIconGlyph(name) {
  const key = String(name ?? "").trim();
  return RESOURCE_ICON_GLYPHS[key] || "●";
}

export { RESOURCE_ICON_GLYPHS as V39_RESOURCE_ICON_GLYPHS };
