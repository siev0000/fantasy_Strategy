import {getGameDataRows} from './game-data-registry.js';

const resourceRows=()=>getGameDataRows('都市基本データ').filter(row=>['食料','木材','石材','金属','貴金属','宝石','特殊資源'].includes(row.分類)||row.データ分類==='金');
const stockKey=name=>['食料','特殊資源'].includes(resourceRows().find(row=>row.データ分類===name)?.分類)?'foodStockByType':'materialStockByType';
export const getV39SummonMaterialStock=(base,name)=>Math.max(0,Number(base?.[stockKey(name)]?.[name])||0);

export function parseV39SummonMaterials(value){
  const costs={},errors=[],known=new Set(resourceRows().map(row=>row.データ分類));
  for(const token of String(value??'').split(/[/／,、\n]+/).map(part=>part.trim()).filter(Boolean)){
    const match=token.match(/^(.+?)\s*[_:：]?\s*(\d+(?:\.\d+)?)$/),name=match?.[1].trim(),amount=Number(match?.[2]);
    if(!match||!known.has(name)||!Number.isFinite(amount)||amount<=0){errors.push(`召喚素材の設定が不正: ${token}`);continue;}
    costs[name]=(costs[name]||0)+amount;
  }
  return {costs,errors};
}

export function resolveV39SummonMaterials(catalog,base){
  // Only explicitly started test bases carry overrides; the shared catalog stays untouched.
  const row={...catalog,...base?.summonMaterialTestCosts?.[catalog?.名称]};
  const initial=parseV39SummonMaterials(row.必要資材),upkeep=parseV39SummonMaterials(row.維持素材);
  return {initialMaterials:initial.costs,upkeepMaterials:upkeep.costs,materialErrors:[...initial.errors,...upkeep.errors]};
}
export function scaleV39SummonMaterials(costs,count=1){
  return Object.fromEntries(Object.entries(costs||{}).map(([name,amount])=>[name,amount*count]));
}
export function formatV39SummonMaterials(costs){
  return Object.entries(costs||{}).filter(([,amount])=>amount>0).map(([name,amount])=>`${name}${amount}`).join(' / ');
}
export function inspectV39SummonMaterialPayment(base,costs){
  const reasons=[];
  for(const [name,amount] of Object.entries(costs||{})){
    const held=getV39SummonMaterialStock(base,name);
    if(held<amount)reasons.push(`召喚素材不足: ${name} ${held}/${amount}`);
  }
  return {available:!reasons.length,reasons};
}
export function payV39SummonMaterials(base,costs){
  if(!base||!inspectV39SummonMaterialPayment(base,costs).available)return null;
  const next={...base,foodStockByType:{...base.foodStockByType},materialStockByType:{...base.materialStockByType}};
  for(const [name,amount] of Object.entries(costs||{}))next[stockKey(name)][name]=(Number(next[stockKey(name)][name])||0)-amount;
  return next;
}
