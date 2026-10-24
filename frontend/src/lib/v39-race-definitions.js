import {raceData,classData} from './game-data-registry.js';

const text=value=>String(value??'').trim();
export const getV39RaceNames=row=>[row?.key,row?.name,row?.className,...(Array.isArray(row?.旧名称)?row.旧名称:[])].map(text).filter(Boolean);

export function resolveV39RaceDefinition(value) {
  const name=text(value);
  return name?raceData.find(row=>getV39RaceNames(row).includes(name))||null:null;
}

export const normalizeV39RaceName=value=>resolveV39RaceDefinition(value)?.key||text(value);

export function isV39RacePlayable(value) {
  const row=typeof value==='object'&&value?value:resolveV39RaceDefinition(value);
  if(!row||row.使用可!==true||!text(row.key)||!text(row.name)||!text(row.className))return false;
  const ability=classData.find(item=>item.名前===row.className);
  if(!ability||['HP','攻撃','防御','魔力','精神','命中','速度','SIZ'].some(key=>typeof ability[key]!=='number'||!Number.isFinite(ability[key])||ability[key]<0)||ability.HP<=0)return false;
  if(['icon','summary','detail','マーカー文字','マーカー色','土地'].some(key=>!text(row[key])))return false;
  if(!Array.isArray(row.traits)||!row.traits.length||row.traits.some(item=>typeof item!=='string'||!text(item))||!/^#[0-9a-f]{6}$/i.test(text(row.マーカー色)))return false;
  return ['初期人数','高さ','ヒーロー','軍隊'].every(key=>typeof row[key]==='number'&&Number.isFinite(row[key])&&row[key]>=0)
    &&row.初期人数>0&&Number.isInteger(row.初期人数)&&Number.isInteger(row.高さ);
}

export const getV39PlayableRaceDefinitions=()=>raceData.filter(isV39RacePlayable);
