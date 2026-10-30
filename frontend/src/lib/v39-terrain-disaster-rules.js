import disasterRows from '../../../data/source/export/json/災害.json';

const text=value=>String(value??'').trim();
const list=value=>text(value).split(/[、,，|/]/u).map(text).filter(Boolean);
const enabled=value=>value!==false&&text(value).toLowerCase()!=='false';
const numeric=(row,key,min=0)=>row[key]!==null&&text(row[key])!==''&&Number.isFinite(Number(row[key]))&&Number(row[key])>=min?Number(row[key]):null;

// Pure projection of the disaster sheet. Missing/invalid definitions never revive old config defaults.
export function resolveV39TerrainDisasterRules(rows){
  const terrainRulesByName={},special={};
  for(const row of rows){
    const kind=text(row.地形災害処理);
    if(!kind||!enabled(row.有効)||!list(row.発生方法).includes('攻撃'))continue;
    const rule={id:row.ID,eligibleDamageTypes:list(row.攻撃発生属性),powerThreshold:numeric(row,'威力軽減'),damageMultiplier:numeric(row,'地形被害倍率'),maxHp:numeric(row,'地形耐久',1),maximumHeightLoss:numeric(row,'高度低下'),replacementTerrain:text(row.変化後地形)};
    if(kind==='地形破壊'&&rule.maxHp!==null&&rule.powerThreshold!==null&&rule.damageMultiplier!==null&&rule.maximumHeightLoss!==null&&rule.eligibleDamageTypes.length){
      for(const name of list(row.対象地形))terrainRulesByName[name]=rule;
    }else if(kind==='瓦礫'&&rule.maxHp!==null&&rule.powerThreshold!==null&&rule.damageMultiplier!==null&&rule.eligibleDamageTypes.length&&numeric(row,'撤去AP')!==null){
      special.rubble={...rule,clearApCost:numeric(row,'撤去AP')};
    }else if(kind==='落石'&&numeric(row,'発生猶予ターン',1)!==null&&numeric(row,'ダメージ威力')!==null&&text(row.ダメージ属性)){
      special.collapse={id:row.ID,delayTurns:Math.floor(numeric(row,'発生猶予ターン',1)),power:numeric(row,'ダメージ威力'),element:text(row.ダメージ属性)};
    }
  }
  return {
    enabled:Object.keys(terrainRulesByName).length>0||!!special.rubble,
    terrainRulesByName,...special,
    durabilityByTerrain:Object.fromEntries(Object.entries(terrainRulesByName).map(([name,rule])=>[name,rule.maxHp])),
    eligibleDamageTypes:[...new Set([...Object.values(terrainRulesByName),special.rubble].filter(Boolean).flatMap(rule=>rule.eligibleDamageTypes))],
    rubbleDurability:special.rubble?.maxHp??0,clearApCost:special.rubble?.clearApCost??0,
    collapseDelayTurns:special.collapse?.delayTurns??0,collapsePower:special.collapse?.power??0
  };
}

export const V39_TERRAIN_DESTRUCTION_RULES=resolveV39TerrainDisasterRules(disasterRows);
