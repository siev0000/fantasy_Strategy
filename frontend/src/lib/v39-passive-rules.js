import { COMBAT_STATUS_FIELDS, SKILL_LEVEL_FIELDS, SKILL_FIELD_DEFS, RESISTANCE_FIELDS, DAMAGE_TYPE_FIELDS, SKILL_STATE_KEYS } from "../constants/unitCommon.js";
import { getGameDataRows } from "./game-data-registry.js";
import { resolveSkillBasePower } from "./skill-power.js";
import { resolveV39TerrainNameAt } from "./v39-terrain-location.js";

const text=value=>String(value??"").trim();
const numeric=value=>value!==null&&value!==""&&value!==undefined&&Number.isFinite(Number(value));
const aliases={魔防:"精神",移動速度:"移動",
  ...Object.fromEntries(SKILL_FIELD_DEFS.flatMap(field=>(field.aliases||[]).map(alias=>[alias,field.key])))};
const statusFields=new Set([...COMBAT_STATUS_FIELDS,"回避","移動"]);
const skillFields=new Set(SKILL_LEVEL_FIELDS),resistanceFields=new Set(RESISTANCE_FIELDS);
const bodyFields=new Set(getGameDataRows("装備").filter(row=>["肉体","肉体防具"].includes(row.装備箇所)).map(row=>row.装備名));
const skillNames=new Set(getGameDataRows("スキル一覧").map(row=>row.名前));
const terrainNames=new Set(getGameDataRows("地形").map(row=>text(row.地形)));
const actionFields=new Set([...DAMAGE_TYPE_FIELDS,...SKILL_STATE_KEYS.filter(key=>key!=="精神"),
  "ガード","回復","射程","射程補正","攻撃回数","AP消費","HP消費","炸裂","耐性貫通"]);

export function getV39PassiveRows(unit) {
  const rows=new Map();
  for (const technique of unit?.techniques || []) {
    const row=technique.source||technique;
    if (text(row.行動).toUpperCase()==="P") rows.set(text(row.名前||technique.name),row);
  }
  return [...rows.values()];
}

export function isV39ConditionalPassive(row) {
  return !!(text(row.条件)||text(row.条件系統)||text(row.攻撃手段));
}

export function matchV39PassiveCondition(row,unit,action,{isCounter=false,mapData,terrainName}={}) {
  const method=text(row.攻撃手段),actual=text(action?.攻撃手段);
  if (method&&method!==actual) {
    const name=text(action?.装備元?.name||action?.装備元?.source?.装備名);
    if (!(method==="武器"&&["弓","銃"].includes(actual))
      && !(actual==="武器"&&((method==="弓"&&/弓|ボウ/.test(name))||(method==="銃"&&/銃|砲|ライフル|ピストル/.test(name))))) return {matches:false};
  }
  const system=text(row.条件系統);
  if (system&&text(action?.系統)!==system&&!(Number(action?.[system])>0)) return {matches:false};
  const condition=text(row.条件);
  if (!condition) return {matches:true};
  if (terrainNames.has(condition)) {
    const currentTerrain=terrainName ?? resolveV39TerrainNameAt(mapData ?? globalThis.window?.__v39FieldRuntime?.mapData,unit?.x,unit?.y);
    return {matches:condition===currentTerrain};
  }
  if (condition==="ガード時") return {matches:isCounter};
  if (condition===text(action?.名前)||condition===actual) return {matches:true};
  const hp=condition.match(/^HP(\d+(?:\.\d+)?)%以下$/);
  if (hp) return {matches:Number(unit.hp??unit.currentHp)<=Number(unit.maxHp??unit.status?.HP)*Number(hp[1])/100};
  if (skillNames.has(condition)||bodyFields.has(condition)) return {matches:false};
  // 未知の条件は無条件化しない。隣接・不意打ちは専用の状況判定が必要。
  return {matches:false,unsupportedCondition:condition};
}

export function collectV39PassiveBonuses(rows) {
  const result={status:{},skillLevels:{},resistances:{},bodyWeaponValues:{},action:{},power:0,unsupported:[]};
  for (const row of rows) for (const [raw,value] of Object.entries(row)) {
    if (!numeric(value)||["Lv"].includes(raw)) continue;
    const key=aliases[raw]||raw,n=Number(value);
    let bucket;
    if (raw==="全威力"||raw==="威力") { result.power+=n; continue; }
    if (statusFields.has(key)) bucket=result.status;
    else if (skillFields.has(key)) bucket=result.skillLevels;
    else if (resistanceFields.has(key)) bucket=result.resistances;
    else if (bodyFields.has(key)) bucket=result.bodyWeaponValues;
    else if (actionFields.has(key)) bucket=result.action;
    if (bucket) bucket[key]=(bucket[key]||0)+n;
    else result.unsupported.push({skillName:row.名前,field:raw,value:n});
  }
  return result;
}

export function addV39PassiveValues(base,bonus) {
  const result={...base};
  for (const [key,value] of Object.entries(bonus)) if (value) result[key]=(Number(result[key])||0)+value;
  return result;
}

export function applyV39TerrainPassiveBonuses(unit, terrainName) {
  const rows=getV39PassiveRows(unit).filter(row=>terrainNames.has(text(row.条件))
    && !text(row.攻撃手段) && !text(row.条件系統)
    && matchV39PassiveCondition(row,unit,null,{terrainName}).matches);
  const bonuses=collectV39PassiveBonuses(rows);
  return {...unit,status:addV39PassiveValues(unit.status,bonuses.status),
    skillLevels:addV39PassiveValues(unit.skillLevels,bonuses.skillLevels),
    resistances:addV39PassiveValues(unit.resistances,bonuses.resistances),
    passiveContextSkillNames:[...(unit.passiveContextSkillNames||[]),...rows.map(row=>row.名前)]};
}

export function applyV39PassiveActionBonuses(action,bonuses) {
  const result=addV39PassiveValues(action,bonuses.action);
  // 全威力は属性合計の代替値なので、補正値だけで既存威力を上書きしない。
  const damageBonus=DAMAGE_TYPE_FIELDS.reduce((sum,key)=>sum+(bonuses.action[key]||0),0);
  if (numeric(action?.全威力)) result.全威力=Number(action.全威力)+damageBonus+bonuses.power;
  else if (bonuses.power) result.全威力=resolveSkillBasePower(result)+bonuses.power;
  return result;
}

export function resolveV39PassiveContext(unit,action,options={}) {
  const rows=[],statRows=[],unsupported=[];
  const baked=new Set([...(unit?.passiveBaseSkillNames||[]),...(unit?.passiveContextSkillNames||[])]);
  for (const row of getV39PassiveRows(unit)) {
    const match=matchV39PassiveCondition(row,unit,action,options);
    if (match.unsupportedCondition) unsupported.push({skillName:row.名前,condition:match.unsupportedCondition});
    if (!match.matches) continue;
    rows.push(row);
    if (!baked.has(row.名前)) statRows.push(row);
  }
  const stats=collectV39PassiveBonuses(statRows),bonuses=collectV39PassiveBonuses(rows);
  return {unit:{...unit,status:addV39PassiveValues(unit?.status,stats.status),
    skillLevels:addV39PassiveValues(unit?.skillLevels,stats.skillLevels),resistances:addV39PassiveValues(unit?.resistances,stats.resistances)},
    action:applyV39PassiveActionBonuses(action,bonuses),rows,unsupported:[...unsupported,...bonuses.unsupported]};
}

export function inspectV39Passive(row) {
  const bonuses=collectV39PassiveBonuses([row]);
  const match=matchV39PassiveCondition(row,{}, {名前:"",攻撃手段:row.攻撃手段,系統:row.条件系統});
  return [...bonuses.unsupported.map(entry=>entry.field),...(match.unsupportedCondition?[`条件:${match.unsupportedCondition}`]:[])];
}
