import {resolveInsectSpecies,resolveInsectArtwork} from './insect-artwork-config.js';

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
  ],
  "ディア・タートル_ユニット集.webp": [
    "通常ディア", "風ディア", "太陽ディア", "氷ディア", "スケルトンディア", "ゾンビディア",
    "通常タートル", "水タートル", "地タートル", "氷タートル", "スケルトンタートル", "ゾンビタートル"
  ],
  "ライオン・ライノセラス_ユニット集.webp": [
    "通常ライオン", "炎ライオン", "太陽ライオン", "地ライオン", "スケルトンライオン", "ゾンビライオン",
    "通常ライノセラス", "地ライノセラス", "炎ライノセラス", "氷ライノセラス", "スケルトンライノセラス", "ゾンビライノセラス"
  ]
};

export const 動物画像一覧 = Object.freeze(Object.entries(画像集).flatMap(([ファイル, 対象一覧]) =>
  対象一覧.map((対象, index) => Object.freeze({ 対象, ファイル, 番号:index + 1 }))));

// 同じ対象が複数の画像集にある場合、後の専用画像集を優先する。
const 対象別画像 = new Map(動物画像一覧.map(row => [row.対象, row]));
対象別画像.set("通常ドレイク", Object.freeze({ ファイル:"ワイバーン・ドレイク_ユニット集.webp", 番号:7 }));
対象別画像.set("通常フォックス", Object.freeze({ ファイル:"鼠・狐_ユニット集.webp", 番号:7 }));
対象別画像.set("スケルトンフォックス", Object.freeze({ ファイル:"鼠・狐_ユニット集.webp", 番号:11 }));
対象別画像.set("ゾンビフォックス", Object.freeze({ ファイル:"鼠・狐_ユニット集.webp", 番号:12 }));
対象別画像.set("通常リザード", Object.freeze({ ファイル:"蜥蜴・蛙_ユニット集.webp", 番号:1 }));
対象別画像.set("スケルトンリザード", Object.freeze({ ファイル:"蜥蜴・蛙_ユニット集.webp", 番号:5 }));
対象別画像.set("ゾンビリザード", Object.freeze({ ファイル:"蜥蜴・蛙_ユニット集.webp", 番号:6 }));

export const 動物属性クラス対応 = Object.freeze({
  フレイムアニマル:"炎",
  フロストアニマル:"氷",
  ウィンドアニマル:"風",
  スパークアニマル:"雷",
  ポイズンアニマル:"毒",
  シーアニマル:"水",
  ストーンアニマル:"地",
  ソルアニマル:"太陽",
  ムーンアニマル:"月"
});

export const 属性ホース名称 = Object.freeze({ エンジェル:"ユニコーン", デヴィル:"バイコーン" });

export function getArtworkClassNames(unit={}) {
  const levels=[unit.prerequisiteClassLevels,unit.fusionGrowth?.levelsByClass,
    unit.derivedCharacter?.prerequisiteClassLevels];
  return [unit.className,unit.クラス,unit.fusionAppearanceClass,unit.strongAnimalClassName,
    unit.subClass,unit.subclass,unit.サブクラス,
    ...levels.flatMap(map=>Object.entries(map||{}).filter(([,lv])=>Number(lv)>0).map(([name])=>name))]
    .map(value=>String(value||'').trim()).filter(Boolean);
}

export function getArtworkUndeadClass(unit={}) {
  const aliases={動死体:'ゾンビ',骸骨:'スケルトン',吸血鬼:'ヴァンパイア'};
  return getArtworkClassNames(unit).map(name=>aliases[name]||name)
    .find(name=>['ゾンビ','スケルトン','ヴァンパイア'].includes(name)) || '';
}

export function resolveAnimalArtworkReference(enemy = {}) {
  const undeadClass=getArtworkUndeadClass(enemy);
  if(resolveInsectSpecies(enemy))return resolveInsectArtwork(enemy,undeadClass);
  const names = [enemy.race, enemy.種族, enemy.raceName, enemy.speciesName, enemy.種族名, enemy.name]
    .map(value => String(value || "").trim());
  const species = names.find(name => 対象別画像.has(`通常${name}`));
  if (!species) return null;
  const classes = getArtworkClassNames(enemy);
  if (species === "ホース" && !undeadClass) {
    const target = classes.map(name => 属性ホース名称[name]).find(Boolean);
    const horse = 対象別画像.get(target);
    if (horse) return { fileName:horse.ファイル, slotNumber:horse.番号, sizeByLevel:false };
  }
  const attribute = undeadClass || classes.map(name => 動物属性クラス対応[name]
    || (name === "スケルトン" || name === "ゾンビ" ? name : "")).find(Boolean);
  // 属性画像がない組み合わせを、別の動物や別属性の画像で代用しない。
  const row = 対象別画像.get(`${attribute || "通常"}${species}`) || 対象別画像.get(`通常${species}`);
  return { fileName:row.ファイル, slotNumber:row.番号, sizeByLevel:false };
}
