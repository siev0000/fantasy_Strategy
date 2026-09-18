const DEFAULT_RESOURCE_ICON = Object.freeze({ glyph:"●", color:"#cbd5e1" });

const RESOURCE_ICON_DEFS = Object.freeze({
  食料:Object.freeze({ glyph:"🌾", color:"" }),
  穀物:Object.freeze({ glyph:"🌾", color:"" }),
  野菜:Object.freeze({ glyph:"🥕", color:"" }),
  肉:Object.freeze({ glyph:"🍖", color:"" }),
  魚:Object.freeze({ glyph:"🐟", color:"" }),
  木材:Object.freeze({ glyph:"🪵", color:"" }),
  黒木:Object.freeze({ glyph:"♣", color:"#5f6872" }),
  特木:Object.freeze({ glyph:"✥", color:"#58c98b" }),
  石材:Object.freeze({ glyph:"🪨", color:"" }),
  鉄:Object.freeze({ glyph:"⬢", color:"#8f969e" }),
  銀鉄:Object.freeze({ glyph:"⬢", color:"#dfe4e8" }),
  青金鋼:Object.freeze({ glyph:"⬢", color:"#4d95ff" }),
  赤黒鋼:Object.freeze({ glyph:"⬢", color:"#9e3030" }),
  金:Object.freeze({ glyph:"●", color:"#d8ad32" }),
  銀:Object.freeze({ glyph:"●", color:"#cbd2d9" }),
  宝石:Object.freeze({ glyph:"💎", color:"" }),
  死体:Object.freeze({ glyph:"🦴", color:"" }),
  魂:Object.freeze({ glyph:"✦", color:"#73d8ff" })
});

export function resolveV39ResourceIcon(name) {
  const key = String(name ?? "").trim();
  const found = RESOURCE_ICON_DEFS[key] || DEFAULT_RESOURCE_ICON;
  return { glyph:found.glyph, color:found.color };
}

export function resolveV39ResourceIconGlyph(name) {
  return resolveV39ResourceIcon(name).glyph;
}

export function resolveV39ResourceIconColor(name) {
  return resolveV39ResourceIcon(name).color;
}

export { RESOURCE_ICON_DEFS as V39_RESOURCE_ICON_DEFS };
