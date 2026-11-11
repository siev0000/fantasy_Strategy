import {DAMAGE_TYPE_FIELDS,SKILL_STATE_KEYS,TIMED_EFFECT_FIELDS} from '../constants/unitCommon.js';
import triggerFixture from '../../../config/v39-skill-trigger-test.json';
import { getGameDataRows } from "./game-data-registry.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const TEST_MODE_STORAGE_KEY = "v39-display-settings-v1";

function storedTestModeEnabled() {
  if (typeof localStorage === "undefined") return false;
  try {
    return JSON.parse(localStorage.getItem(TEST_MODE_STORAGE_KEY) || "null")?.testMode === true;
  } catch {
    return false;
  }
}

export function isV39TestSkillModeEnabled() {
  if (typeof window === "undefined") return false;
  if (typeof window.isV39TestMode === "function") return window.isV39TestMode() === true;
  if (typeof window.getV39DisplaySettings === "function") return window.getV39DisplaySettings()?.testMode === true;
  return storedTestModeEnabled();
}

const powerFields=new Set([...DAMAGE_TYPE_FIELDS,...SKILL_STATE_KEYS,...TIMED_EFFECT_FIELDS,
  '力場','精神攻撃','呪い','燃焼','回復','ガード','全威力','体幹','ノックバック']);
export function describeV39TestSkillData(row){
  return Object.entries(row||{}).filter(([key,value])=>!['名前','詳細','説明','ルビ','テスト専用'].includes(key)&&value!==null&&value!==undefined&&value!==''&&['string','number','boolean'].includes(typeof value)).map(([key,value])=>{
    const numeric=typeof value==='number'||typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value));
    return powerFields.has(key)&&numeric?key+(Number(value)>=0?'+':'')+value:key+':'+value;
  }).join(' ');
}

export function getV39TestSkillRows() {
  return [...getGameDataRows("テストスキル"), ...triggerFixture.actions.map(row=>({...row,テスト専用:true})), ...triggerFixture.passives.map(row=>({...row,テスト専用:true}))].filter(row => row?.テスト専用 === true && text(row?.名前)).map(row=>{
    if(!row.参照スキル)return row;
    const source=getGameDataRows('スキル一覧').find(skill=>skill.名前===row.参照スキル);
    return source?{...source,...row}:null;
  }).filter(Boolean).map(row=>({...row,...(!row.対象&&triggerFixture.additionalTargets?.[row.名前]?{対象:triggerFixture.additionalTargets[row.名前]}:{})})).map(row=>({...row,詳細:[text(row.詳細),describeV39TestSkillData(row)].filter(Boolean).join("\n") }));
}

export function getV39UnitTestSkillRows(unit) {
  if (!isV39TestSkillModeEnabled()) return [];
  const names = new Set((Array.isArray(unit?.testSkillNames) ? unit.testSkillNames : []).map(text).filter(Boolean));
  // The skill-test field stores names when it starts. Include newly added fixture
  // actions for an already running or loaded skill-test unit as well.
  if (unit?.testOnly === true && /^trigger-test-(?:a|b)(?:\d+)?$/.test(text(unit.id))) {
    for (const row of triggerFixture.actions) names.add(text(row?.名前));
    if(text(unit.id)==='trigger-test-a')for(const name of triggerFixture.units[0]?.passiveSkillNames||[])names.add(text(name));
  }
  if (!names.size) return [];
  return getV39TestSkillRows().filter(row => names.has(text(row?.名前)));
}

export function getV39UnitTestTechniques(unit) {
  return getV39UnitTestSkillRows(unit).map(row => ({
    name:text(row?.名前),
    apCost:Number.isFinite(Number(row?.AP消費)) ? Number(row.AP消費) : null,
    hpCost:Number.isFinite(Number(row?.HP消費)) ? Number(row.HP消費) : null,
    range:row?.射程 ?? null,
    area:row?.範囲 ?? row?.炸裂 ?? null,
    target:row?.対象 ?? null,
    detail:text(row?.詳細),
    action:text(row?.行動),
    testOnly:true,
    source:row
  }));
}

export function isV39TestInstantDeathSkill(skillRow) {
  return skillRow?.テスト専用 === true && text(skillRow?.効果) === "即死" && !(Number(skillRow?.呪い)>0||Number(skillRow?.力場)>0);
}
