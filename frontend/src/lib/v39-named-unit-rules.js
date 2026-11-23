import {resolveV39UnitExpDisplay} from "./v39-unit-experience.js";
import {v39NamedUnitDefinitions} from "./v39-named-unit-definitions.js";

export function resolveV39NamedUnit(unit) {
  if (unit.namedUnit || unit.state === "死亡" || !(Number(unit.hp ?? unit.currentHp) > 0)) return unit;
  const weapons = (unit.equipment || []).filter(item => item.namedWeapon?.name
    && (item.slot === "武器1" || item.slot === "武器2"));

  const derived = unit.derivedCharacter;
  const previous = derived?.prerequisiteClassLevels ?? unit.prerequisiteClassLevels ?? {};
  const secondClass = derived?.secondClassName ?? unit.secondClassName;
  const acquired = new Set([unit.className, secondClass,
    ...Object.keys(previous).filter(name => Number(previous[name]) > 0)]);
  const classLevel = name => Math.max(
    Number(previous[name]) || 0,
    name === unit.className ? Number(derived?.classLevels ?? unit.classLevels) || 0 : 0,
    name === secondClass ? 1 : 0
  );
  const level = resolveV39UnitExpDisplay(unit).level;
  for (const definition of v39NamedUnitDefinitions) {
    if (definition.requiredRace && definition.requiredRace !== (unit.race ?? unit.raceName)) continue;
    if (definition.minimumLevel && level < definition.minimumLevel) continue;
    if (definition.requiredClasses?.some(name => !acquired.has(name))) continue;
    if (Object.entries(definition.requiredClassLevels ?? {}).some(([name, minimum]) => classLevel(name) < minimum)) continue;
    const weapon = definition.requiredWeapon
      ? weapons.find(item => item.namedWeapon.name === definition.requiredWeapon) : null;
    if (definition.requiredWeapon && !weapon) continue;
    return {...unit, name:definition.name, isNamed:true,
      namedUnit:{name:definition.name, ...(weapon ? {weaponSlot:weapon.slot} : {})}};
  }
  return unit;
}
