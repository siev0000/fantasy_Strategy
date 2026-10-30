import config from '../../../config/v39-carried-food.json';
import {getGameDataRows} from './game-data-registry.js';
import {isResearchCompleted} from './research-progress.js';

export const getV39PreservedFoodResearch=()=>getGameDataRows('研究').find(row=>row.ID===config.preservedFood.requiredResearchId)||null;
export function isV39PreservedFoodUnlocked(faction){
  const row=getV39PreservedFoodResearch();
  return !!row&&isResearchCompleted(faction?.research,row.技術対象,row.Lv,row.ID);
}

export const V39_PRESERVED_FOOD_RULE=Object.freeze({
  name:config.preservedFood.resourceName,
  nutrition:Math.max(1,Number(config.preservedFood.nutritionValue)||1),
  inputPerItem:Math.max(1,Number(config.preservedFood.inputPerItem)||1),
  apCost:Math.max(0,Number(config.preservedFood.craftApCost)||0)
});
export const isV39PreservedFood=key=>key===V39_PRESERVED_FOOD_RULE.name;
export const roundV39FoodStock=(value,key)=>{
  const precision=isV39PreservedFood(key)?1e6:10;
  return Math.round((Number(value)||0)*precision)/precision;
};
