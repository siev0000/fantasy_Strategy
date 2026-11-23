import {getGameDataRows} from "./game-data-registry.js";

export const namedWeaponRecipes = getGameDataRows("ネームド武器");

export function getV39NamedWeaponEffect(item) {
  const namedWeapon = item?.namedWeapon;
  if (!namedWeapon) return "";
  return namedWeaponRecipes.find(recipe => recipe.name === namedWeapon.name)?.uniqueEffect
    ?? namedWeapon.uniqueEffect ?? "";
}
