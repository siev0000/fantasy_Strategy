import {getV39UnitTestSkillRows,isV39TestSkillModeEnabled} from "./v39-test-skill-rules.js";

const numeric = value => Number(value) || 0;

export function getV39WeaponCraftSpecialists(faction, village) {
  if (!village?.placed) return [];
  const forgeTiles = new Set(Object.entries(village.tileFacilityMap || {})
    .filter(([, names]) => Array.isArray(names) && names.includes("鍛冶場")).map(([tile]) => tile));
  if (!forgeTiles.size) return [];
  const worldId = village.worldId || "surface";
  return (faction?.units || []).flatMap(unit => {
    if (!(numeric(unit.hp ?? unit.currentHp) > 0) || unit.state === "死亡" || unit.characterStorage || unit.boardingPilot
      || (unit.worldId || "surface") !== worldId || !forgeTiles.has(`${unit.x},${unit.y}`)) return [];
    const testing = unit.testOnly && isV39TestSkillModeEnabled();
    const test = testing ? unit.testWeaponCraft : null;
    const classNames = new Set([unit.className, unit.derivedCharacter?.secondClassName ?? unit.secondClassName, test?.className,
      ...Object.entries(unit.derivedCharacter?.prerequisiteClassLevels ?? unit.prerequisiteClassLevels ?? {})
        .filter(([, level]) => numeric(level) > 0).map(([name]) => name)
    ].filter(Boolean));
    const equipped = (unit.techniques || []).map(entry => entry.source || entry);
    const testRows = testing ? getV39UnitTestSkillRows(unit) : [];
    const skills = new Map([...equipped, ...testRows]
      .filter(row => row.行動 === "P" && row.条件 === "武器作成").map(row => [row.名前, row]));
    let craftSkill = numeric(test?.craftSkill ?? unit.skillLevels?.制作 ?? unit.status?.制作);
    let enchantCapBonus = 0;
    for (const row of skills.values()) {
      craftSkill += numeric(row.制作);
      enchantCapBonus += numeric(row.強化Lv上限);
    }
    return [{classNames, craftSkill:Math.max(0, craftSkill), enchantCapBonus:Math.max(0, Math.floor(enchantCapBonus))}];
  });
}
