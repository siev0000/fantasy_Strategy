import {inspectV39Restraint,getV39RestraintPenalty,resolveV39RestraintRecovery} from '../../lib/v39-restraint.js';
import {V39_NUMERIC_STATUSES,readV39NumericStatus,resolveV39FatigueApLoss} from '../../lib/v39-control-status.js';
import {getHexDistance} from '../../lib/hex-grid.js';
import {resolveAttackRange,applyV39ActiveCombatEffects} from '../../lib/v39-combat-engine.js';
import {describeV39Bleeding} from '../../lib/v39-bleeding.js';
import {resolveV39UnitAbilityDisplay} from '../../lib/v39-current-unit-abilities.js';
import {v39SustainCost} from '../../lib/v39-sustained-effects.js';
import { RESISTANCE_FIELDS } from "../../constants/unitCommon.js";
import { formatResistanceValue, getResistanceIconSrc, resistanceValueTone } from "../../lib/resistance-display.js";
import "./v39-unit-detail.css";
import {EQUIPMENT_SLOT_KEYS} from '../../constants/unitCommon.js';
import {resolveV39UnitWeatherMovement} from '../../lib/v39-terrain-traversal.js';
import {V39_UNIT_ACHIEVEMENT_FIELDS} from '../../lib/v39-unit-achievements.js';

const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// 項目・表示名・順序はフィールドと自キャラ画面で共有する。
const STATUS_FIELDS = [
  ["攻撃", "攻撃", "detailAtk"], ["防御", "防御", "detailDef"],
  ["魔力", "魔力", "detailMatk"], ["精神", "精神", "detailMdef"],
  ["命中", "命中", "detailHit"], ["速度", "速度", "detailSpd"],
  ["SIZ", "SIZ", "detailSiz"], ["APP", "APP", "detailApp"],
  ["移動", "移動", "detailMov"], ["飛行", "飛行", "detailFlight"]
];

export function renderV39DetailSection(label, content) {
  return `<details class="squad-detail-section" data-v39-detail-section="${escapeHtml(label.replace(/ Lv\d+$/,''))}" open><summary class="squad-detail-section-title">${escapeHtml(label)}</summary><div class="squad-detail-section-body">${content}</div></details>`;
}

export function renderV39DetailTabs(tabs, active, attribute) {
  return `<div class="squad-detail-tabs" style="--v39-detail-tab-count:${tabs.length}" role="tablist" aria-label="キャラクター詳細">${tabs.map(([key, label]) =>
    `<button type="button" class="squad-detail-tab${key === active ? " active" : ""}" ${attribute}="${escapeHtml(key)}" role="tab" aria-selected="${key === active}">${escapeHtml(label)}</button>`
  ).join("")}</div>`;
}

export function renderV39UnitEquipment(unit,{readOnly=true,disabled=false}={}){
  const equipment=Array.isArray(unit?.equipment)?unit.equipment:[];
  return `<div class="v39-char-equipment-list">${EQUIPMENT_SLOT_KEYS.map(slot=>{
    const item=equipment.find(row=>row.slot===slot);
    const quality=item?.qualityLabel||item?.quality;
    const content=`<span>${escapeHtml(slot)}</span><b>${escapeHtml(item?.name||'なし')}${quality?` [${escapeHtml(quality)}]`:''}</b>`;
    return readOnly?`<div class="v39-char-equipment-row">${content}</div>`
      :`<button type="button" class="v39-char-equipment-row" data-v39-character-equip-open="${escapeHtml(slot)}"${disabled?' disabled':''}>${content}</button>`;
  }).join('')}</div>`;
}

export function renderV39UnitGrowth(unit){
  const derived=unit?.derivedCharacter||{},number=value=>Math.max(0,Math.floor(Number(value)||0));
  const rows=[['総合Lv',Math.max(1,number(unit?.level))],
    [`${unit?.race||'種族'} Lv`,derived.growthCaps?.raceLevels>0?`${number(derived.raceLevels)} / ${derived.growthCaps.raceLevels}`:number(derived.raceLevels)],
    [`${unit?.className||'クラス'} Lv`,derived.growthCaps?`${number(derived.classLevels)} / ${derived.growthCaps.classLevels}`:number(derived.classLevels)]];
  for(const [name,levels] of Object.entries(derived.prerequisiteClassLevels||{}))rows.push([`${name} Lv`,levels]);
  const second=derived.secondClassName||unit?.secondClassName||unit?.subClassName;
  if(second)rows.push([`${second} Lv`,1]);
  if(derived.strongAnimalClassName)rows.push([`${derived.strongAnimalClassName} Lv`,derived.strongAnimalClassLevel]);
  if(unit?.fusionGrowth){
    rows.push(['合体・基礎EXP',`${Number(unit.fusionGrowth.baseExp||0).toFixed(1)} / ${unit.fusionGrowth.baseNeed}`]);
    for(const [name,exp] of Object.entries(unit.fusionGrowth.classExp||{}))rows.push([`${name} EXP`,Number(exp).toFixed(1)]);
  }
  return `<div class="v39-char-growth-list">${rows.map(([label,value])=>`<div class="v39-char-growth-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>`;
}

export function renderV39UnitAchievements(unit){
  const number=value=>Math.max(0,Math.floor(Number(value)||0));
  const values=unit?.achievements||{};
  const rows=V39_UNIT_ACHIEVEMENT_FIELDS.map(row=>`<div class="v39-char-growth-row"><span>${escapeHtml(row.label)}</span><b>${row.connected?`${number(values[row.key])}${row.unit}`:'未接続'}</b></div>`).join('');
  return `<div class="v39-char-growth-list">${rows}</div>
    <p class="v39-char-note">記録開始後の累計です。転職・転生でリセットしません。過去の行動は遡って集計しません。</p>
    <details class="v39-char-note"><summary>集計ルール</summary><p>攻撃は範囲・連撃も1行動で1回。反撃も含みます。暗殺は系統「暗殺」の使用時に1回（撃破不要）。クリティカルは敵への物理攻撃で成立したヒット数です。治療は他者の実HP回復を対象ごとに記録。自己・自然回復は除外。状態異常解除の統合は未接続です。調査は完了したマス数、移動は実際に歩いた距離（転移・強制移動を除外）。強敵は自分以上のLvです。仲間を守る回数は、効果「守護」を自分以外の味方に使った対象数です。</p><p>破壊内訳：地形 ${number(values.terrain)} / 壁・結界 ${number(values.walls)} / 施設 未接続。土地/壁は壊れた時だけ記録します。</p><p>状態異常・施設破壊、クラス取得条件への使用は未接続です。</p></details>`;
}

export function renderV39UnitConditions(unit){
  const buffs=[],debuffs=[],bleed=describeV39Bleeding(unit);
  const state=globalThis.window?.getV39GameState?.({includeWorlds:false}),turn=Number(state?.timeline?.turnNumber)||1;
  const remaining=expires=>expires?'残り'+Math.max(0,Number(expires)-turn)+'T':'期限なし';
  const active=expires=>!expires||Number(expires)>turn;
  if(unit?.knockedDown)debuffs.push(['転倒','起き上がり 20AP / 回避 -25%']);
  if(unit?.staggeredTurn===turn&&Number(unit.ap??unit.currentAp)<=0)debuffs.push(['怯み','AP 0']);
  for(const kind of V39_NUMERIC_STATUSES){
    const value=readV39NumericStatus(unit,kind);
    if(!value)continue;
    const detail=kind==='疲労'?`最大AP -${resolveV39FatigueApLoss(unit)}`:kind==='麻痺'?`AP -${value}`:`感知・命中 -${value}`;
    debuffs.push([kind,`${value} / ${detail}`]);
  }
  for(const [kind,effect] of Object.entries(unit?.controlStatuses||{})){
    if(kind==='凍結'){
      debuffs.push([kind,`凍結値 ${effect.value} / 自然減少 10/T`]);
      continue;
    }
    const turns=Math.max(0,Number(effect.expiresAtTurn)-turn);
    if(turns||effect.value)debuffs.push([kind,`${turns?`残り${turns}T / `:''}蓄積 ${effect.value}/100`]);
  }
  for(const [bucket,label]of [['abilityDamage','能力ダメージ'],['abilityCurses','呪い'],['abilityPoison','毒による低下']])for(const [key,value]of Object.entries(unit?.[bucket]||{}))if(Number(value)>0)debuffs.push([label+'：'+key,'-'+value]);
  for(const kind of ['毒','燃焼']){
    const doses=(unit?.periodicDamage||[]).filter(effect=>effect.kind===kind&&effect.remainingTurns>0);
    if(doses.length)debuffs.push([kind,doses.reduce((sum,e)=>sum+Number(e.value||0),0)+'ダメージ/ターン / 残り'+Math.max(...doses.map(e=>e.remainingTurns))+'T']);
  }
  const hold=inspectV39Restraint(unit),holdPenalty=getV39RestraintPenalty(unit,state);
  if(hold.value)debuffs.push(['拘束',hold.value+' / '+hold.cap+'（段階'+hold.stage+'） / 自然抵抗 '+resolveV39RestraintRecovery(resolveV39UnitAbilityDisplay(unit,{state}).current.status)+'/T']);
  if(holdPenalty)debuffs.push(['命中・回避','-'+Math.round(holdPenalty*100)+'%'+(unit.restraint?.grapplerId?' / 組み付かれ中':'' )]);
  if(bleed)debuffs.push(['出血',bleed.value+' / 次回 '+bleed.damage+'ダメージ / 残り'+bleed.remainingTurns+'T']);
  if(Number(unit?.guard)>0&&active(unit.guardExpiresAtTurn))buffs.push(['ガード',unit.guard+' / '+remaining(unit.guardExpiresAtTurn)]);
  for(const [key,label]of [['shield','盾'],['barrier','障壁']]){
    const effect=unit?.[key];
    if(effect&&(key==='shield'||Number(effect.remaining)>0)&&active(effect.expiresAtTurn))buffs.push([effect.skillName||label,label+' '+effect.remaining+'/'+(effect.maximum??effect.remaining)+' / '+remaining(effect.expiresAtTurn)]);
  }
  if(unit?.guardedBy&&active(unit.guardedBy.expiresAtTurn)){
    const link=unit.guardedBy;
    const guardian=[...(state?.players||[]).flatMap(p=>p.factionState?.units||[]),...(state?.enemies||[]),...(state?.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])].find(row=>row.id===link.guardianId);
    const valid=guardian&&Number(guardian.hp??guardian.currentHp)>0&&(guardian.worldId||'surface')===(unit.worldId||'surface')
      &&getHexDistance(unit,guardian)<=resolveAttackRange({射程:link.range},guardian,globalThis.window?.__v39FieldRuntime?.mapData);
    buffs.push(['守護',(guardian?.name||link.guardianId)+' / '+(valid?'有効':'無効（射程外・守護者不在）')+' / '+remaining(link.expiresAtTurn)]);
  }
  const player=state?.players?.find(p=>p.factionState?.units?.some(row=>row.id===unit?.id));
  const effects=(player?.factionState?.combatRuntime?.activeEffectsByUnitId?.[unit?.id]||state?.enemyCombatRuntime?.activeEffectsByEnemyId?.[unit?.id]||[]).filter(effect=>active(effect.expiresAtTurn));
  const maximum=applyV39ActiveCombatEffects({status:{},skillLevels:{},resistances:{}},effects.filter(effect=>!['oneTurn','transformation'].includes(effect.stackGroup)));
  const maxima={...maximum.status,...maximum.skillLevels,...maximum.resistances};
  for(const effect of effects){
    const stacked=['oneTurn','transformation'].includes(effect.stackGroup),positive=[],negative=[];
    const durationLabel=effect.sustained?'持続':remaining(effect.expiresAtTurn);
    if(effect.skillRow?.攻撃手段==='武器'&&Number(effect.skillRow?.物理)>0){
      const amount=Number(effect.skillRow.物理)*(1+(Number(effect.judgeValue)||0)/100);
      buffs.push([effect.skillName||'武器強化','武器攻撃時 物理+'+(Math.round(amount*10)/10)+' / '+durationLabel]);
    }
    for(const [name,value]of Object.entries(effect.modifiers||{})){
      if(!Number(value))continue;
      const applied=stacked||Number(value)===Number(maxima[name]);
      const text=name+(Number(value)>0?'+':'')+value+'（'+(applied?'適用中':'待機中')+'）';
      (Number(value)>0?positive:negative).push(text);
    }
    const suffix=' / '+durationLabel+(stacked?' / '+(effect.stackGroup==='oneTurn'?'1ターン強化':'変身・別枠'):'');
    if(positive.length)buffs.push([effect.skillName||'継続強化',positive.join(' / ')+suffix]);
    if(negative.length)debuffs.push([effect.skillName||'継続弱体',negative.join(' / ')+suffix]);
  }
  const section=(title,rows)=>renderV39DetailSection(title,rows.length?rows.map(([name,value])=>'<div class="v39-char-growth-row v39-status-effect-row"><span>'+escapeHtml(name)+'</span><b>'+escapeHtml(value)+'</b></div>').join(''):'<div class="squad-empty">なし</div>');
  return section('強化・保護',buffs)+section('状態異常・弱体',debuffs);
}

export function renderV39UnitAbility(unit, { mapData, fieldIds = false } = {}) {
  const {current:adjusted,baseline,deltas}=resolveV39UnitAbilityDisplay(unit,{mapData});
  const baselineWeather=resolveV39UnitWeatherMovement(baseline,mapData);
  const weatherMovement=resolveV39UnitWeatherMovement(adjusted,mapData);
  const id = value => fieldIds ? ` id="${value}"` : "";
  const valueHtml=(value,delta=0,fieldId='')=>{
    const amount=Math.round(Number(delta||0)*10)/10;
    const annotation=amount?'('+ (amount>0?'+':'')+amount+')':'';
    return '<span class="v39-ability-value"><b'+(fieldId?id(fieldId):'')+'>'+escapeHtml(value)+'</b>'+(annotation?'<small class="v39-ability-delta '+(amount>0?'is-up':'is-down')+'" aria-label="一時補正 '+escapeHtml(annotation)+'">'+escapeHtml(annotation)+'</small>':'')+'</span>';
  };
  const stats = STATUS_FIELDS.map(([label, key, fieldId]) => {
    const raw = key==='移動'&&(weatherMovement.movementReduction>0||weatherMovement.flightReduction>0)?Math.max(1,Math.floor(weatherMovement.movement))
      :key==='飛行'&&weatherMovement.flightReduction>0?Math.round(weatherMovement.flight*10)/10
      :key === "移動"
      ? adjusted?.status?.移動 ?? adjusted?.movement ?? unit?.move ?? unit?.moveRange ?? unit?.移動
      : key === "飛行" ? adjusted?.skillLevels?.飛行 ?? adjusted?.status?.飛行 ?? unit?.飛行 ?? 0
      : adjusted?.status?.[key] ?? unit?.[key];
    const value=Number.isFinite(Number(raw))?Number(raw):'-';
    let delta=key==='飛行'?deltas.skillLevels?.飛行??deltas.status?.飛行:deltas.status?.[key];
    if(key==='移動'&&(weatherMovement.movementReduction>0||weatherMovement.flightReduction>0))delta=Number(raw)-Math.max(1,Math.floor(baselineWeather.movement));
    if(key==='飛行'&&weatherMovement.flightReduction>0)delta=Number(raw)-Math.round(baselineWeather.flight*10)/10;
    const cityBonus=Number(adjusted?.cityAuraDeltas?.status?.[key])||0;
    return `<div class="detail-stat"${cityBonus?` title="都市常時 ${cityBonus>0?'+':''}${cityBonus}"`:''}><span>${label}</span>${valueHtml(value,delta,fieldId)}</div>`;
  }).join("");
  const skills = Object.entries(adjusted?.skillLevels || {})
    .filter(([key, value]) => key !== "飛行" && Number.isFinite(Number(value)) && Number(value) !== 0)
    .map(([name, value]) => `<div class="proficiency-item"><span>${escapeHtml(name)}</span>${valueHtml(Number(value),deltas.skillLevels?.[name])}</div>`).join("");
  const resistances = RESISTANCE_FIELDS.flatMap(key => {
    const value = Number(adjusted?.resistances?.[key]);
    if (!Number.isFinite(value) || value === 0) return [];
    const icon = getResistanceIconSrc(key);
    return [`<button type="button" class="v39-resistance-indicator ${resistanceValueTone(value)}" data-v39-resistance-label="${escapeHtml(key)}" aria-label="${escapeHtml(key)} ${escapeHtml(formatResistanceValue(value))}">
      ${icon ? `<img src="${escapeHtml(icon)}" alt="" aria-hidden="true" class="v39-resistance-icon">` : '<span class="v39-resistance-icon-fallback" aria-hidden="true">?</span>'}
      ${valueHtml(formatResistanceValue(value),deltas.resistances?.[key])}</button>`];
  }).join("");
  const empty = message => `<div class="squad-empty">${message}</div>`;
  const level=Math.max(1,Math.floor(Number(unit?.level??unit?.lv??unit?.Lv)||1));
  const identity=unit?`<div class="v39-unit-lineage v39-unit-lineage-pair"><span>種族：${escapeHtml(unit.race||'-')}</span><span>クラス：${escapeHtml(unit.className||'-')}</span></div>`:'';
  const aura=adjusted?.cityAuraSkillNames?.length?`<div class="v39-unit-lineage">都市常時：${escapeHtml(adjusted.cityAuraSkillNames.join(' / '))}</div>`:'';
  const state=globalThis.window?.getV39GameState?.({includeWorlds:false});
  const owner=state?.players?.find(player=>player.factionState?.units?.some(row=>row.id===unit?.id));
  const sustained=(owner?.factionState?.combatRuntime?.activeEffectsByUnitId?.[unit?.id]||[]).filter(effect=>effect.sustained);
  const ongoing=sustained.length?renderV39DetailSection('持続中',sustained.map(effect=>{
    const cost=v39SustainCost(effect.skillRow);
    return `<div class="v39-char-growth-row"><span>${escapeHtml(effect.skillName)}</span><b>毎ターン AP${cost.ap} / HP${cost.hp}</b><button type="button" data-v39-sustain-cancel="${escapeHtml(effect.skillName)}" data-v39-sustain-unit="${escapeHtml(unit.id)}">解除</button></div>`;
  }).join('')):'';
  return ongoing+renderV39DetailSection(unit?`ステータス Lv${level}`:'ステータス', `${identity}${aura}<div class="squad-detail-stats v39-char-status-grid">${stats}</div>`)
    + renderV39DetailSection("技能", `<div class="proficiency-grid"${id("detailProficiencyList")}>${skills || empty("技能データなし")}</div>`)
    + renderV39DetailSection("軽減・耐性", `<div class="v39-resistance-grid"${id("detailResistanceList")}>${resistances || empty("軽減・耐性データなし")}</div>`)
    + renderV39UnitConditions(unit);
}

export function updateV39UnitAbility(host, unit, options) {
  if (!host) return;
  const markup = renderV39UnitAbility(unit, options);
  if (host.__v39AbilityMarkup === markup) return;
  const closed = new Set(Array.from(host.querySelectorAll("details:not([open])"),
    section => section.dataset.v39DetailSection));
  host.innerHTML = markup;
  host.__v39AbilityMarkup = markup;
  for (const section of host.querySelectorAll("details")) {
    if (closed.has(section.dataset.v39DetailSection)) section.open = false;
  }
}
