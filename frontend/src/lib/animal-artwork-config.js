// 画像だけの対応表。能力・スキルはスプレッドシートから生成したクラス.jsonを参照する。
// 4列×3行、左上から横順に1～12。実ファイルの拡張子は.webp。
const 画像集 = {
  "魔獣_ユニット集1.webp": [
    "ホーク", "スネーク", "ウルフ", "クロコダイル", "タイガー", "ベア",
    "炎ウルフ", "氷ウルフ", "影ウルフ", "月ウルフ", "毒スネーク", "雷ホーク"
  ],
  "ホーク・スネーク_ユニット集.webp": [
    "通常ホーク", "雷ホーク", "風ホーク", "光ホーク", "スケルトンホーク", "ゾンビホーク",
    "通常スネーク", "毒スネーク", "影スネーク", "水スネーク", "スケルトンスネーク", "ゾンビスネーク"
  ],
  "クロコダイル・タイガー_ユニット集.webp": [
    "通常クロコダイル", "水クロコダイル", "地クロコダイル", "毒クロコダイル", "スケルトンクロコダイル", "ゾンビクロコダイル",
    "通常タイガー", "雷タイガー", "地タイガー", "太陽タイガー", "スケルトンタイガー", "ゾンビタイガー"
  ],
  "ベア・ボア_ユニット集.webp": [
    "通常ベア", "地ベア", "氷ベア", "影ベア", "スケルトンベア", "ゾンビベア",
    "通常ボア", "地ボア", "毒ボア", "炎ボア", "スケルトンボア", "ゾンビボア"
  ],
  "狼・馬_ユニット集.webp": [
    "通常ウルフ", "月ウルフ", "氷ウルフ", "影ウルフ", "スケルトンウルフ", "ゾンビウルフ",
    "通常ホース", "ユニコーン", "バイコーン", "月ホース", "スケルトンホース", "ゾンビホース"
  ]
};

export const 動物画像一覧 = Object.freeze(Object.entries(画像集).flatMap(([ファイル, 対象一覧]) =>
  対象一覧.map((対象, index) => Object.freeze({ 対象, ファイル, 番号:index + 1 }))));

// 同じ対象が複数の画像集にある場合、後の専用画像集を優先する。
const 対象別画像 = new Map(動物画像一覧.map(row => [row.対象, row]));
対象別画像.set("通常ドレイク", Object.freeze({ ファイル:"ワイバーン・ドレイク_ユニット集.webp", 番号:7 }));

export const 動物属性クラス対応 = Object.freeze({
  フレイムアニマル:"炎",
  フロストアニマル:"氷",
  ウィンドアニマル:"風",
  スパークアニマル:"雷",
  ポイズンアニマル:"毒",
  シーアニマル:"水",
  ストーンアニマル:"地"
});

// 強敵の追加クラス候補。ホースのみ天使・悪魔を候補に加える。
export const 強敵動物追加クラス候補 = Object.freeze(Object.keys(動物属性クラス対応));
export const 強敵ホース追加クラス候補 = Object.freeze([...強敵動物追加クラス候補, "エンジェル", "デヴィル"]);
export const 属性ホース名称 = Object.freeze({ エンジェル:"ユニコーン", デヴィル:"バイコーン" });

export function getStrongAnimalClassCandidates(race) {
  if (!対象別画像.has(`通常${race}`)) return [];
  return race === "ホース" ? 強敵ホース追加クラス候補 : 強敵動物追加クラス候補;
}

export function resolveAnimalArtworkReference(enemy = {}) {
  const names = [enemy.race, enemy.種族, enemy.raceName, enemy.speciesName, enemy.種族名, enemy.name]
    .map(value => String(value || "").trim());
  const species = names.find(name => 対象別画像.has(`通常${name}`));
  if (!species) return null;
  const classes = [enemy.strongAnimalClassName, enemy.className, enemy.subClass, enemy.subclass, enemy.サブクラス]
    .map(value => String(value || "").trim());
  if (species === "ホース") {
    const target = classes.map(name => 属性ホース名称[name]).find(Boolean);
    const horse = 対象別画像.get(target);
    if (horse) return { fileName:horse.ファイル, slotNumber:horse.番号, sizeByLevel:false };
  }
  const attribute = classes.map(name => 動物属性クラス対応[name]
    || (name === "スケルトン" || name === "ゾンビ" ? name : "")).find(Boolean);
  // 属性画像がない組み合わせを、別の動物や別属性の画像で代用しない。
  const row = 対象別画像.get(`${attribute || "通常"}${species}`) || 対象別画像.get(`通常${species}`);
  return { fileName:row.ファイル, slotNumber:row.番号, sizeByLevel:false };
}
