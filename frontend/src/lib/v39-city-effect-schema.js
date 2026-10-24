import {getGameDataRows} from './game-data-registry.js';
import {RESISTANCE_FIELDS} from '../constants/unitCommon.js';
import {getHexDistance} from './hex-grid.js';
import {inspectV39Passive} from './v39-passive-rules.js';

const text=value=>String(value??'').trim();
export const splitV39CityEffects=value=>text(value).split(/[/／\n]+/).map(text).filter(Boolean);

export function parseV39CityEffectSettings(row={}) {
  const diagnostics=[],resistances={},disasterResistances={},events=[],skills=[];
  const scope=text(row.効果範囲),match=scope.match(/^(?:中心|周囲)(\d+)(?:マス)?$/);
  const radius=!scope||scope==='所属領土'?null:match?Number(match[1]):undefined;
  if(radius===undefined)diagnostics.push(`未対応の効果範囲: ${scope}`);
  for(const entry of splitV39CityEffects(row.耐性)) {
    const parts=entry.match(/^(.+?)(?:[=:：_]\s*)?([+-]?\d+(?:\.\d+)?)$/);
    const key=parts?`${parts[1].replace(/耐性$/,'')}耐性`:'';
    if(!parts||!RESISTANCE_FIELDS.includes(key)){diagnostics.push(`不正な耐性: ${entry}`);continue;}
    resistances[key]=(resistances[key]||0)+Number(parts[2]);
  }
  for(const entry of splitV39CityEffects(row.災害耐性)) {
    const parts=entry.match(/^(.+?)[=＝]([+-]?\d+(?:\.\d+)?)%?$/);
    const disaster=parts&&getGameDataRows('災害').find(item=>[item.ID,item.カテゴリ名].includes(parts[1].trim()));
    if(!disaster){diagnostics.push(`不正な災害耐性: ${entry}`);continue;}
    disasterResistances[disaster.ID]=(disasterResistances[disaster.ID]||0)+Number(parts[2]);
  }
  for(const name of splitV39CityEffects(row.常時発動スキル)) {
    const skill=getGameDataRows('スキル一覧').find(item=>item.名前===name);
    if(!skill||text(skill.行動).toUpperCase()!=='P'){diagnostics.push(`常時枠はパッシブ名を指定: ${name}`);continue;}
    const unsupported=inspectV39Passive(skill);
    if(unsupported.length||skill.対象&&!['自身','部隊全員'].includes(skill.対象)){diagnostics.push(`未対応の常時スキル設定: ${name} ${unsupported.join(',')||skill.対象}`);continue;}
    if(!skills.includes(name))skills.push(name);
  }
  for(const entry of splitV39CityEffects(row.イベント設定)) {
    const [id,chance='100',...extra]=entry.split(/[=＝]/).map(text);
    const definition=getGameDataRows('イベント会話').find(item=>item.ID===id);
    if(!definition||extra.length||!/^\d+(?:\.\d+)?$/.test(chance)||Number(chance)>100){diagnostics.push(`不正なイベント設定: ${entry}`);continue;}
    events.push({id,chance:Number(chance)/100});
  }
  return {radius,skills,events,resistances,disasterResistances,diagnostics};
}

export function isV39CityEffectInRange(row,settlement,tileKey,worldId='surface') {
  if(!settlement?.placed||(settlement.worldId||'surface')!==worldId)return false;
  const scope=text(row?.効果範囲);
  if(!scope||scope==='所属領土')return true;
  const match=scope.match(/^(?:中心|周囲)(\d+)(?:マス)?$/),[x,y]=String(tileKey).split(',').map(Number);
  return !!match&&Number.isFinite(x)&&Number.isFinite(y)&&getHexDistance(settlement,{x,y})<=Number(match[1]);
}
