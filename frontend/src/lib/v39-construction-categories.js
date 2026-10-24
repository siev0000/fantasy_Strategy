export const V39_CONSTRUCTION_CATEGORIES=Object.freeze(['すべて','住居','鍛冶','魔法','信仰','軍事','経済']);

export function getV39ConstructionCategories(definition){
  const row=definition?.row||definition||{};
  return V39_CONSTRUCTION_CATEGORIES.filter(category=>category==='すべて'
    ||(category==='住居'?Number(row['1マス収容人数'])>0:Number(row[`${category}Lv`])>0));
}
