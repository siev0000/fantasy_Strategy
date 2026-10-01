const text = value => String(value ?? "").trim();

// 初期作成・通常ユニット作成で選択できる基礎クラス。
// クラス.jsonの条件欄とは分離し、上位クラスの条件未入力で候補が増えないようにする。
export const V39_BASE_CLASS_NAMES = Object.freeze([
  "ファイター",
  "ナイト",
  "フェンサー",
  "モンク",
  "シーフ",
  "レンジャー",
  "アーチャー",
  "ウィザード",
  "アルケミスト",
  "クレリック",
  "パラディン",
  "ドルイド"
]);

const BASE_CLASS_NAME_SET = new Set(V39_BASE_CLASS_NAMES);

export function isV39InvalidDataToken(value) {
  const token = text(value).toLowerCase();
  return !token || token === "0" || token === "-" || token === "－" || token === "なし" || token === "null" || token.startsWith("#");
}

export function isV39ProfessionClassRow(row) {
  const name = text(row?.名前);
  const kind = text(row?.種類);
  return !!name && (kind === "職業" || kind.endsWith("系"));
}

export function hasV39ClassUnlockCondition(row) {
  if (!row || typeof row !== "object") return false;
  if (Number.isFinite(Number(row?.合計Lv)) && Number(row.合計Lv) > 0) return true;
  return [row?.条件クラス, row?.条件スキル, row?.条件施設].some(value => !isV39InvalidDataToken(value));
}

export function isV39BaseClassRow(row) {
  if (!isV39ProfessionClassRow(row)) return false;
  return BASE_CLASS_NAME_SET.has(text(row?.名前));
}

export function resolveV39ClassCategory(row, fallback = "その他") {
  const kind = text(row?.種類);
  return isV39ProfessionClassRow(row) && kind !== "職業" ? kind : fallback;
}

export function splitV39ClassCondition(value) {
  return text(value).split("/").map(text).filter(token => !isV39InvalidDataToken(token));
}

export function parseV39ClassCondition(value, fallbackLevel = 1) {
  const source = text(value);
  if (!source) return null;
  const match = source.match(/^(.+?)(?:_(\d+)|(?:Lv|LV|lv|レベル)\s*(\d+))$/);
  if (!match) return { token:source, required:Math.max(1, Math.floor(Number(fallbackLevel) || 1)) };
  return {
    token:text(match[1]),
    required:Math.max(1, Math.floor(Number(match[2] || match[3]) || 1))
  };
}
