import disasterRows from '../../../data/source/export/json/災害.json';
import terrainRows from '../../../data/source/export/json/地形.json';
import terrainConfig from '../../../config/v39-terrain-destruction.json';

const text=value=>String(value??'').trim();
const list=value=>text(value).split(/[、,，|/]/u).map(text).filter(Boolean);
const enabled=value=>value!==false&&text(value).toLowerCase()!=='false';
const numeric=(row,key,min=0)=>row[key]!==null&&text(row[key])!==''&&Number.isFinite(Number(row[key]))&&Number(row[key])>=min?Number(row[key]):null;

// Combine disaster behavior with terrain durability and reduction. Missing/invalid definitions never revive old config defaults.
export function resolveV39TerrainDisasterRules(rows, terrains=terrainRows){
  const terrainByName=new Map(terrains.map(row=>[text(row.地形),row]));
  const terrainRulesByName={},special={};
  for(const row of rows){
    const kind=text(row.地形災害処理);
    if(!kind||!enabled(row.有効)||!list(row.発生方法).includes('攻撃'))continue;
    const rule={id:row.表示名,eligibleDamageTypes:list(row.攻撃発生属性),damageMultiplier:numeric(row,'地形被害倍率'),maximumHeightLoss:numeric(row,'高度低下'),replacementTerrain:text(row.変化後地形)};
    if(kind==='地形破壊'&&rule.damageMultiplier!==null&&rule.maximumHeightLoss!==null&&rule.eligibleDamageTypes.length){
      for(const name of list(row.対象地形)){
        const terrain=terrainByName.get(name);
        if(!terrain)continue;
        const maxHp=numeric(terrain,'地形耐久',1),powerThreshold=numeric(terrain,'威力軽減');
        if(maxHp!==null&&powerThreshold!==null)terrainRulesByName[name]={...rule,maxHp,powerThreshold};
      }
    }else if(kind==='瓦礫'&&rule.damageMultiplier!==null&&rule.eligibleDamageTypes.length&&numeric(row,'撤去AP')!==null){
      const details=row.災害詳細設定||{};
      const maxHp=numeric(details,'rubbleDurability',1),powerThreshold=numeric(details,'rubblePowerReduction');
      if(maxHp!==null&&powerThreshold!==null)special.rubble={...rule,maxHp,powerThreshold,clearApCost:numeric(row,'撤去AP')};
    }else if(kind==='落石'&&numeric(row,'発生猶予ターン',1)!==null&&numeric(row,'ダメージ威力')!==null&&text(row.ダメージ属性)){
      special.collapse={id:row.表示名,delayTurns:Math.floor(numeric(row,'発生猶予ターン',1)),power:numeric(row,'ダメージ威力'),element:text(row.ダメージ属性)};
    }
  }
  const landslide=rows.find(row=>row.表示名==='土砂崩れ'&&enabled(row.有効));
  return {
    enabled:Object.keys(terrainRulesByName).length>0||!!special.rubble,
    terrainRulesByName,...special,
    durabilityByTerrain:Object.fromEntries(Object.entries(terrainRulesByName).map(([name,rule])=>[name,rule.maxHp])),
    eligibleDamageTypes:[...new Set([...Object.values(terrainRulesByName),special.rubble].filter(Boolean).flatMap(rule=>rule.eligibleDamageTypes))],
    rubbleDurability:special.rubble?.maxHp??0,clearApCost:special.rubble?.clearApCost??0,
    collapseDelayTurns:special.collapse?.delayTurns??0,collapsePower:special.collapse?.power??0,
    landslide:landslide?{
      basePower:numeric(landslide,'ダメージ威力')??0,
      element:text(landslide.ダメージ属性)||'打撃',
      ...terrainConfig.landslide
    }:null,
    caveEntrance:terrainConfig.caveEntrance
  };
}

export const V39_TERRAIN_DESTRUCTION_RULES=resolveV39TerrainDisasterRules(disasterRows);
