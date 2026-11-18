import {getV39GolemEnchantLimits,getV39GolemEnchantOptions,golemEnchantParts} from './v39-equipment-rules.js';
import {STATUS_FIELDS,RESISTANCE_FIELDS} from '../constants/unitCommon.js';
import {getGameDataRows} from './game-data-registry.js';
import {collectV39PassiveBonuses} from './v39-passive-rules.js';
import {FOOD_RESOURCE_KEYS} from './v39-economy-rules.js';
import {getFactionSettlements,replaceFactionSettlement} from './settlement-state.js';
import {getHexOffsetNeighbors,getHexNeighborCoords} from './hex-grid.js';
import {canUnitEnterV39Tile,resolveV39TileTerrainName} from './v39-terrain-traversal.js';
import {applyV39DerivedCharacterData} from '../v39/unit/v39-character-derived-rules.js';

export const golemWorkshopSizes=['ゴーレム工房（小）','ゴーレム工房（中）','ゴーレム工房（大）'];
export const golemSizes=[
  {label:'小',level:15,siz:200,turns:15,costMultiplier:1},
  {label:'中',level:20,siz:350,turns:20,costMultiplier:1.75},
  {label:'大',level:25,siz:500,turns:25,costMultiplier:2.5}
];
export const golemRecipes=new Map(getGameDataRows('ゴーレム作成レシピ').map(row=>[row.ゴーレム名,row]));
export const golemRecipeNames=[...golemRecipes.keys()];

export function getV39GolemRecipeCost(name,size){
  const base=golemRecipes.get(name)?.基礎素材費;
  const multiplier=golemSizes[size]?.costMultiplier;
  return base&&multiplier?Object.fromEntries(Object.entries(base).map(([key,value])=>[key,Math.floor(value*multiplier)])):null;
}
const key=point=>`${point.x},${point.y}`;
const alive=unit=>Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
const surface=unit=>(unit.worldId||'surface')==='surface';
const idOf=base=>base.settlementId||base.id;

const splitTargets=value=>String(value??'').split(/[/／]/).map(name=>name.trim()).filter(Boolean);

export function getV39GolemAdditionalSkillCandidates(rows,unlockedSources,golemName){
  return rows.filter(row=>{
    const source=String(row.追加元??'').trim();
    const targets=splitTargets(row.対象ゴーレム);
    return row.名前&&source&&unlockedSources.includes(source)&&(!targets.length||targets.includes(golemName));
  });
}

function usableWorkshop(state,player,base,tileKey,name){
  const health=base?.facilityStateByTile?.[tileKey]?.[name];
  return base?.placed&&surface(base)&&state.territoryOwnerByTile?.[tileKey]===player.id
    &&base.tileFacilityMap?.[tileKey]?.includes(name)&&health?.status!=='損壊'&&(health?.hp??1)>0;
}

export function matchesV39GolemTerrain(map,tileKey,facilityName,requiredTerrains=[]){
  if(!requiredTerrains.length)return true;
  const radius=golemWorkshopSizes.indexOf(facilityName);
  const [x,y]=String(tileKey).split(',').map(Number);
  if(radius<0||!Number.isInteger(x)||!Number.isInteger(y)||!map?.grid?.[y]?.[x])return false;
  const seen=new Set([tileKey]),queue=[{x,y,distance:0}];
  for(const point of queue){
    if(requiredTerrains.includes(resolveV39TileTerrainName(map,point.x,point.y)))return true;
    if(point.distance>=radius)continue;
    for(const neighbor of getHexNeighborCoords(map.w,map.h,point.x,point.y,map.worldWrapEnabled===true)){
      if(seen.has(neighbor.key))continue;
      seen.add(neighbor.key);
      queue.push({...neighbor,distance:point.distance+1});
    }
  }
  return false;
}

export function getV39GolemWorkshopCreators(faction,tileKey){
  return (faction?.units||[]).filter(unit=>alive(unit)&&surface(unit)&&key(unit)===tileKey);
}

export function inspectV39GolemOrder(state,request,map){
  const {settlementId,tileKey,facilityName,size}=request;
  const player=state.players.find(row=>row.id===state.activePlayerId);
  const faction=player?.factionState;
  const base=getFactionSettlements(faction).find(row=>idOf(row)===settlementId);
  const name=request.golemName??'ストーンゴーレム';
  const definition=golemRecipes.get(name);
  const sizeRule=Number.isInteger(size)?golemSizes[size]:null;
  const cost=sizeRule?getV39GolemRecipeCost(name,size):null;
  const recipe=sizeRule&&cost?{...sizeRule,cost}:null;
  const terrains=definition?.必要地形||[];
  const creators=getV39GolemWorkshopCreators(faction,tileKey);
  const creator=creators.length===1?creators[0]:null;
  const reasons=[];
  if(state.timeline?.phase!=='player'||(state.activeWorldId||'surface')!=='surface')reasons.push('地上の操作ターンに作成できます');
  if(!player||!usableWorkshop(state,player,base,tileKey,facilityName))reasons.push('使用できる自軍工房が必要です');
  if(!recipe||golemWorkshopSizes.indexOf(facilityName)<size)reasons.push('工房の規模が足りません');
  if(!matchesV39GolemTerrain(map,tileKey,facilityName,terrains))
    reasons.push(`工房の対象範囲に ${terrains.join('／')} が必要です`);
  if(!creator)reasons.push(creators.length?'工房のマスにいる作成者を1体にしてください':'工房のマスに作成者が必要です');
  if(faction?.golemOrders?.some(order=>order.tileKey===tileKey))reasons.push('この工房では作成中です');
  const crafter=creator?.derivedCharacter;
  const classLevel=crafter?.className==='ゴーレムクラフター'?crafter.classLevels:crafter?.prerequisiteClassLevels?.ゴーレムクラフター;
  const qualityTier=recipe?.level>=25?2:recipe?.level>=20?1:0;
  const quality=['common','uncommon','rare','epic'][qualityTier+Number(classLevel>=7)];
  const limit=getV39GolemEnchantLimits(quality);
  const material={},food={},statusBonus={},resistanceBonus={},enchantmentsByPart={};
  for(const [key,value] of Object.entries(recipe?.cost||{})){
    const stock=FOOD_RESOURCE_KEYS.includes(key)?food:material;
    stock[key]=value;
  }
  let used=0;
  for(const part of Object.keys(golemEnchantParts)){
    const names=request.enchantmentsByPart?.[part]??[];
    const options=getV39GolemEnchantOptions(player,base,part);
    if(!Array.isArray(names)||new Set(names).size!==names.length){
      reasons.push(`${part}の付与指定が正しくありません`);continue;
    }
    enchantmentsByPart[part]=[...names];
    for(const name of names){
      const option=options.find(option=>option.name===name);
      if(!option||option.failed.length||option.cost.level>limit.single){
        reasons.push(`${part}に「${name}」を付与できません`);continue;
      }
      used+=option.cost.level;
      for(const [stock,cost] of [[material,option.cost.material],[food,option.cost.food]]){
        for(const [key,amount] of Object.entries(cost))if(amount)stock[key]=(stock[key]||0)+amount;
      }
      for(const [bonus,fields] of [[statusBonus,STATUS_FIELDS],[resistanceBonus,RESISTANCE_FIELDS]]){
        for(const field of fields){
          const value=Number(option.row[field])||0;
          if(value)bonus[field]=(bonus[field]||0)+value;
        }
      }
    }
  }
  if(used>limit.total)reasons.push(`頭・体・足の付与Lv合計が${limit.total}を超えています`);
  for(const [stock,cost] of [[base?.materialStockByType,material],[base?.foodStockByType,food]]){
    for(const [name,amount] of Object.entries(cost)){
      if((Number(stock?.[name])||0)<amount)reasons.push(`${name}が不足しています`);
    }
  }
  const creationRows=(creator?.techniques||[]).map(technique=>technique.source||technique)
    .filter(row=>row.条件==='ゴーレム作成時');
  const creationTargetRows=creationRows.filter(row=>row.対象==='ゴーレム');
  const selections=new Map(creationTargetRows.filter(row=>Number(row.作成時選択)===1)
    .map(row=>[row.名前,{emptyLabel:String(row.未選択表示??'').trim()}]));
  const ordinarySkills=recipe&&selections.size
    ? applyV39DerivedCharacterData({race:name,className:name,level:recipe.level,golemBuild:{siz:recipe.siz}}).acquiredSkillNames||[]
    : [];
  const additionalCandidates=selections.size
    ? getV39GolemAdditionalSkillCandidates(getGameDataRows('ゴーレム追加スキル'),[...selections.keys()],name)
      .map(row=>({name:row.名前,source:String(row.追加元).trim(),known:ordinarySkills.includes(row.名前),
        detail:String(row.詳細??'').replace(/(?:^|\s)(?:追加元|対象ゴーレム):\S+/g,'').trim()}))
    : [];
  const additionalSkillNames=[];
  const usedSources=new Set();
  for(const skillName of request.additionalSkillNames??[]){
    const candidate=additionalCandidates.find(row=>row.name===skillName);
    if(!candidate||candidate.known||usedSources.has(candidate.source)){
      reasons.push(`「${skillName}」を追加スキルに選べません`);continue;
    }
    additionalSkillNames.push(skillName);
    usedSources.add(candidate.source);
  }
  for(const source of new Set(additionalCandidates.map(candidate=>candidate.source))){
    if(usedSources.has(source))continue;
    const choices=additionalCandidates.filter(candidate=>candidate.source===source);
    if(choices.length===1&&!choices[0].known)additionalSkillNames.push(choices[0].name);
  }
  const creatorBonuses=collectV39PassiveBonuses(creationRows.filter(row=>row.対象==='自身'));
  const baseProduction=Number(creator?.skillLevels?.制作??creator?.status?.制作)||0;
  const production=Math.max(0,baseProduction+(creatorBonuses.skillLevels.制作||0));
  const {status,skillLevels,resistances,bodyWeaponValues}=collectV39PassiveBonuses(creationTargetRows);
  const buildBonuses={status,skillLevels,resistances,bodyWeaponValues};
  const turns=recipe?Math.max(1,recipe.turns-Math.floor(production/50)):0;
  return {player,faction,base,creator,craftedByGolemCrafter:classLevel>0,recipe,turns,reasons,name,terrains,limit,used,material,food,selections,additionalCandidates,additionalSkillNames,buildBonuses,
    enchantment:{quality,enchantmentsByPart,statusBonus,resistanceBonus}};
}

export function orderV39Golem(state,request,map){
  const check=inspectV39GolemOrder(state,request,map);
  if(check.reasons.length)return {state,reason:check.reasons.join(' / ')};
  const {base,faction,player,turns,material,food,enchantment}=check;
  const materialStockByType={...base.materialStockByType};
  const foodStockByType={...base.foodStockByType};
  for(const [name,amount] of Object.entries(material))materialStockByType[name]-=amount;
  for(const [name,amount] of Object.entries(food))foodStockByType[name]-=amount;
  const serial=(Number(faction.golemOrderSerial)||0)+1;
  const turn=Number(state.timeline.turnNumber)||1;
  const order={...request,golemName:check.name,creatorId:check.creator.id,craftedByGolemCrafter:check.craftedByGolemCrafter,enchantment,additionalSkillNames:check.additionalSkillNames,buildBonuses:check.buildBonuses,id:`golem-${player.id}-${serial}`,remainingTurns:turns,lastTurn:turn};
  const next=replaceFactionSettlement(faction,{...base,materialStockByType,foodStockByType},{ownerPlayerId:player.id,select:false});
  return {state:{...state,players:state.players.map(row=>row.id===player.id?{...row,factionState:{
    ...next,golemOrderSerial:serial,golemOrders:[...(faction.golemOrders||[]),order]
  }}:row)},order};
}

export function advanceV39GolemOrders(state,map,turn,{completeForPlayerId}={}){
  if(!map?.grid||map.isUnderground)return state;
  const occupied=new Set([...state.players.flatMap(p=>p.factionState.units||[]),...(state.enemies||[]),
    ...(state.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])].filter(unit=>alive(unit)&&surface(unit)).map(key));
  let changed=false;
  const players=state.players.map(player=>{
    const faction=player.factionState;
    if(!faction.golemOrders?.length||(completeForPlayerId&&player.id!==completeForPlayerId))return player;
    const units=[...faction.units],golemOrders=[];
    for(const order of faction.golemOrders){
      const base=getFactionSettlements(faction).find(row=>idOf(row)===order.settlementId);
      const recipe=golemSizes[order.size];
      const workshopAvailable=golemWorkshopSizes.slice(order.size).some(name=>
        usableWorkshop(state,player,base,order.tileKey,name));
      if((!completeForPlayerId&&order.lastTurn>=turn)||!recipe||!workshopAvailable){
        golemOrders.push(order);continue;
      }
      changed=true;
      const next={...order,lastTurn:turn,remainingTurns:completeForPlayerId?0:Math.max(0,order.remainingTurns-1)};
      if(next.remainingTurns){golemOrders.push(next);continue;}
      const name=order.golemName??'ストーンゴーレム';
      const unit=applyV39DerivedCharacterData({id:order.id,name,race:name,
        className:name,level:recipe.level,worldId:'surface',settlementId:order.settlementId,
        squadId:'solo',unitType:'通常ユニット',equipment:[],golemBuild:{size:order.size,siz:recipe.siz,craftedByGolemCrafter:order.craftedByGolemCrafter===true,enchantment:order.enchantment,additionalSkillNames:order.additionalSkillNames,bonuses:order.buildBonuses}});
      const [x,y]=order.tileKey.split(',').map(Number);
      const tile=unit.derivedCharacter?.ok&&getHexOffsetNeighbors(x,y).find(point=>
        !occupied.has(key(point))&&map.grid[point.y]?.[point.x]&&canUnitEnterV39Tile(map,point.x,point.y,unit));
      if(!tile){golemOrders.push(next);continue;}
      occupied.add(key(tile));
      units.push({...unit,...tile,position:[tile.x,tile.y],hp:unit.maxHp,currentHp:unit.maxHp,ap:100,currentAp:100,maxAp:100,state:'生存'});
    }
    return {...player,factionState:{...faction,units,golemOrders}};
  });
  return changed?{...state,players}:state;
}
