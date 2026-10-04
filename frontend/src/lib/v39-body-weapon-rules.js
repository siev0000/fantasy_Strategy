import { getGameDataRows, findGameDataRow } from "./game-data-registry.js";
import { V39_BODY_WEAPON_BALANCE } from "./v39-gameplay-balance.js";

const bodyEquipment = getGameDataRows("装備").filter(row => ["肉体", "肉体防具"].includes(row.装備箇所));
const qualities = getGameDataRows("消費量").filter(row => row.種別 === "装備" && row.品質名)
  .sort((a, b) => Number(a.品質倍率) - Number(b.品質倍率));

export function deriveV39BodyWeaponLevels(classRows) {
  return Object.fromEntries(bodyEquipment.map(row => [row.装備名,
    Math.max(0, ...classRows.filter(Boolean).map(source => Number(source[row.装備名]) || 0))
      / V39_BODY_WEAPON_BALANCE.levelDivisor
  ]));
}

export function resolveV39BodyWeaponMultiplier(level) {
  const points = V39_BODY_WEAPON_BALANCE.powerPoints;
  if (level <= points[0].level) return points[0].multiplier;
  for (let i = 1; i < points.length; i += 1) {
    const left = points[i - 1], right = points[i];
    if (level <= right.level) return left.multiplier
      + (right.multiplier - left.multiplier) * (level - left.level) / (right.level - left.level);
  }
  return points.at(-1).multiplier;
}

export function resolveV39BodyWeaponAttackRows(unit) {
  const levels = unit?.bodyWeaponLevels || unit?.derivedCharacter?.bodyWeaponLevels || {};
  return bodyEquipment.filter(row => row.装備箇所 === "肉体" && levels[row.装備名] > 0).map(row => {
    const level = levels[row.装備名];
    const multiplier = resolveV39BodyWeaponMultiplier(level);
    const quality = qualities.filter(value => Number(value.品質倍率) <= multiplier).at(-1) || qualities[0];
    const skill = findGameDataRow("スキル一覧", "名前", row.装備名);
    return {
      名前:row.装備名, 行動:"A", 攻撃手段:row.装備名, 判定:"攻撃",
      物理:(Number(row.威力) || 0) * multiplier,
      ガード:(Number(row.ガード) || 0) * multiplier,
      AP消費:Number(row.攻撃AP) || 0, 攻撃回数:Number(row.攻撃回数) || 1,
      射程:row.射程 ?? null, 範囲:null, 炸裂:null, アニメ:skill?.アニメ || "",
      装備攻撃:true, 身体武器:true, 身体武器Lv:level, 品質倍率:multiplier,
      詳細:`身体武器Lv${level} / ${quality?.品質名 || ""} / 性能${multiplier.toFixed(3)}倍`
    };
  });
}
