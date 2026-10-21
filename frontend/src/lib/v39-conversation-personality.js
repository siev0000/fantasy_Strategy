import {getGameDataRows} from './game-data-registry.js';

export const getV39ConversationPersonalities=()=>getGameDataRows('性格会話').filter(row=>row.性格);
export function withV39ConversationPersonality(entity={},random=Math.random){
  if(entity.conversationPersonality)return entity;
  const rows=getV39ConversationPersonalities();
  const personality=entity.性格||rows[Math.min(rows.length-1,Math.floor(Math.max(0,random())*rows.length))]?.性格||'真面目';
  return {...entity,conversationPersonality:personality};
}
export function getV39ConversationProfile(entity={}){
  const rows=getV39ConversationPersonalities(),name=entity.conversationPersonality||entity.性格;
  return rows.find(row=>row.性格===name)||rows.find(row=>row.性格==='真面目')||rows[0]||{};
}
export function formatV39ConversationText(text,entity={},values={}){
  const profile=getV39ConversationProfile(entity),fields={一人称:profile.一人称||'私',二人称:profile.二人称||'あなた',名前:entity.name||'',...values};
  return String(text||'').replace(/\{(一人称|二人称|名前)\}/g,(match,key)=>fields[key]??match);
}
export function selectV39PersonalityLine(entity,column,{random=Math.random,fallback='',values={}}={}){
  const lines=String(getV39ConversationProfile(entity)[column]||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const text=lines.length?lines[Math.min(lines.length-1,Math.floor(Math.max(0,random())*lines.length))]:fallback;
  return formatV39ConversationText(text,entity,values);
}
export function getV39ConversationDataGaps(){
  const fields=['一人称','二人称','交渉開始','好条件','悪条件','値下げ要求','値上げ要求','承諾','拒否','交渉成功','交渉失敗','脅迫','威圧','煽り','挑発','降伏要求','金品要求','終了'];
  return getV39ConversationPersonalities().flatMap(row=>fields.filter(field=>!String(row[field]||'').trim()).map(field=>({性格:row.性格,項目:field})));
}
