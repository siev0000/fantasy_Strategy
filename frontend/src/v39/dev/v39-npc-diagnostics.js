import {FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS,buildV39ResourceSnapshot} from '../../lib/v39-economy-rules.js';
import './v39-npc-diagnostics.css';
import {describeV39NpcObjective} from '../../lib/v39-npc-objective-label.js';
import {getV39RecordedResourceDelta,describeV39ResourceDelta} from '../../lib/v39-resource-delta-view.js';
import {normalizeResearchState,findResearchItem,resolveCompletedResearchLevel,requiredResearchExp} from '../../lib/research-progress.js';
import {RESEARCH_CATEGORY_ORDER} from '../../lib/research-tree-config.js';

export const npcDiagnosticSelection={factionId:'',view:'resources'};
const views=[['resources','資材'],['population','人口'],['construction','施設・建設'],['research','研究・成長'],['actions','行動目標']];
const n=value=>Number(value)||0;
const amount=value=>String(Math.round(n(value)*100)/100);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const alive=unit=>n(unit?.hp??unit?.currentHp)>0&&unit.state!=='死亡';
const card=(title,body,attribute='')=>`<section class="v39-test-base-card" ${attribute}><h4>${esc(title)}</h4>${body}</section>`;
const reasons=rows=>(rows||[]).length?`<p>${rows.map(esc).join(' / ')}</p>`:'';
const empty='<p class="npc-diagnostic-empty">なし</p>';
const basesOf=player=>(player.factionState?.settlements||[]).filter(base=>base.placed);

function resources(player){
  const bases=basesOf(player),plan=player.factionState.aiState?.developmentPlan;
  const stocks=bases.map(base=>{
    const items=new Map(Object.values(buildV39ResourceSnapshot(base)||{}).flatMap(group=>group.items).map(item=>[item.name,item]));
    return card(base.name||base.id,`<dl class="npc-diagnostic-values">${[...FOOD_RESOURCE_KEYS,...MATERIAL_RESOURCE_KEYS].map(key=>{
      const item=items.get(key),delta=describeV39ResourceDelta(getV39RecordedResourceDelta(base,key));
      return `<div><dt>${esc(key)}</dt><dd>${amount(item?.value??base.foodStockByType?.[key]??base.materialStockByType?.[key])} <span data-npc-stock-delta="${esc(key)}" class="npc-stock-delta ${delta.tone}" title="直近の経済更新による実増減">${delta.text}</span></dd></div>`;
    }).join('')}</dl>`,'data-npc-stock');
  });
  const goals=(plan?.resourceGoals||[]).map(row=>{
    const base=bases.find(base=>(base.settlementId||base.id)===row.settlementId);
    return `<li>${esc(row.name)} <b>${amount(row.stock)} / ${amount(row.required)}</b>（不足${amount(row.missing)}）<small>${esc(row.purpose)}${base?' / '+esc(base.name):''}</small></li>`;
  }).join('');
  return foodBalanceMarkup(plan)+card('現在の在庫',(stocks.join('')||'<p>配置済み拠点なし</p>')+'<p class="npc-diagnostic-empty">括弧内は直近の経済更新の実収支（産出−消費）。建築・製作など更新外の単発支出は含みません。</p>')
    +card('不足資材（AI判断時の在庫／必要）',plan?`<ul class="npc-diagnostic-list">${goals||'<li>現在の計画で不足なし</li>'}</ul><p class="npc-diagnostic-empty">用途別の目標です。同じ資源の必要量を足した予約量ではありません。</p>`:'<p>次のAI行動で判断します。</p>','data-npc-resource-goals');
}

function foodBalanceMarkup(plan){
  const rows=plan?.foodBalances;
  if(!rows?.length)return '';
  const total=bag=>amount(Object.values(bag||{}).reduce((sum,value)=>sum+n(value),0));
  return card('食料方針',rows.map(row=>`<p><b>${esc(row.name||row.settlementId)}: ${row.active?'食料確保を優先':row.status==='stable'?'通常運用':'食料優先OFF'}</b></p><p>通常食料 / 産出${total(row.income)}・維持${total(row.maintenance)} / T${row.queuedUnits?'（訓練中の兵を含む）':''}</p><p>代用後の収支不足 ${amount(row.deficitTotal)} / 備蓄不足 ${amount(row.reserveDeficitTotal)}${row.active?' / 新規増強を抑制':''}</p>`).join(''),'data-npc-food-priority');
}

function population(player){
  return basesOf(player).map(base=>card(`${base.name||base.id} / ${amount(base.population)}人`,
    `<dl class="npc-diagnostic-values">${Object.entries(base.populationByRace||{}).filter(([,count])=>n(count)>0).map(([race,count])=>
      `<div><dt>${esc(race)}${n(base.subjectPopulationByRace?.[race])?`<small>うち奴隷 ${amount(base.subjectPopulationByRace[race])}人</small>`:''}</dt><dd>${amount(count)}人</dd></div>`).join('')}</dl>`
    +Object.entries(base.populationGrowthByRace||{}).filter(([race])=>n(base.populationByRace?.[race])>0).map(([race,growth])=>
      `<p>${esc(race)}: 成長 ${amount(growth.gauge)} / ${amount(growth.lastRequiredGauge)}${n(growth.shortage)>0?' / 食料不足 '+amount(growth.shortage):''}</p>`).join('')
    +`<p>人口許容 ${amount(base.populationCapacity)} / 就業枠 ${amount(base.employmentSlots)} / 稼働率 ${amount(n(base.employmentRate)*100)}%</p>`)).join('')||'<p>配置済み拠点なし</p>';
}

function construction(player){
  const faction=player.factionState,plan=faction.aiState?.developmentPlan;
  const completed=basesOf(player).map(base=>card(base.name||base.id,
    `<p>完成施設: ${esc((base.buildings||[]).join('・')||'なし')}</p>`
    +(base.constructionQueue||[]).map(row=>`<p>工事中: ${esc(row.facilityName)} / 残り${amount(row.remainingTurns)}T / ${esc(row.tileKey)}</p>`).join(''))).join('');
  const next=plan?.construction;
  const goal=!next?'<p>次のAI行動で判断します。</p>':`<p><b>${esc(next.name||'候補なし')}</b>${next.tileKey?' @'+esc(next.tileKey):''}${next.status==='building'?' / 残り'+amount(next.remainingTurns)+'T':''}</p>`
    +reasons(next.reasons)+(next.status==='building'?'<p>次の候補は完成後に判断</p>':'');
  const cities=(plan?.citySpecializations||[]).map(city=>`<p>${esc(city.name||city.settlementId)}: ${esc(city.currentId||'未特化')}${city.targetId&&city.targetId!==city.currentId?' → '+esc(city.targetId):''} / ${({ready:'選択予定',waiting:'切替待機',maintain:'維持',blocked:'条件待ち'})[city.status]||''}${city.remainingTurns?' '+amount(city.remainingTurns)+'T':''} / 種族適性${amount(city.affinity)}%</p>${reasons(city.reasons)}`).join('');
  const labels={building:'開拓中',paused:'停止中',ready:'候補',blocked:'条件待ち',idle:'不足なし',disabled:'OFF'};
  const expansion=(plan?.resourceExpansion||[]).map(row=>`<p>${esc(row.name||row.settlementId)} / ${labels[row.status]||''}${row.tileKey?' @'+esc(row.tileKey):''}${row.remainingTurns!=null?' / 残り'+amount(row.remainingTurns)+'T':''}${row.reason?' / '+esc(row.reason):''}</p>`).join('');
  return card('施設と工事',completed||'<p>配置済み拠点なし</p>')+card(next?.status==='building'?'建設中の目標':'次の建設目標',goal,'data-npc-construction-goal')
    +card('都市特化',cities||'<p>次のAI行動で判断します。</p>','data-npc-city-specialization-goal')
    +card('資源地の開拓',expansion||empty,'data-npc-resource-expansion');
}

function research(player){
  const faction=player.factionState,state=normalizeResearchState(faction.research),growth=faction.aiState?.growthPlan;
  const progress=RESEARCH_CATEGORY_ORDER.map(category=>{
    const id=state.selection[category],found=findResearchItem(id),actor=faction.units.find(unit=>unit.id===state.assignedUnitIdByCategory[category]);
    const completed=Object.values(state.progress.completedByCategoryLevel[category]||{}).flat().map(id=>findResearchItem(id)?.item.name||id);
    return card(`${category.replace(/Lv$/,'')} Lv${resolveCompletedResearchLevel(state,category)}`,
      `<p>${esc(found?.item.name||'研究未選択')}${found?` / EXP ${amount(state.progress.targetExpMap[id])}/${requiredResearchExp(found.level)} / 担当 ${esc(actor?.name||'不在')}`:''}</p><p>完了: ${esc(completed.join('・')||'なし')}</p>`);
  }).join('');
  const equipment=growth?.equipment,rare=growth?.rare;
  return card('優先研究の目標',(growth?.researchRequests||[]).map(request=>`<p>${esc(request.category)} ${amount(resolveCompletedResearchLevel(state,request.category))}/${amount(request.level)}</p>`).join('')||empty)
    +progress+card('装備更新',equipment?`<p>${esc(equipment.unitId)} / ${esc(equipment.name)} / ${esc(equipment.rarity)} / ${equipment.researchReady?'研究条件OK':`鍛冶Lv${amount(equipment.level)}待ち`}</p>${reasons(equipment.shortages.map(row=>`${row.name} 不足${amount(row.missing)}`))}`:empty)
    +card('上位資源の確保',rare?`<p>${esc(rare.resource)} / ${esc(rare.status)}${rare.tileKey?' @'+esc(rare.tileKey):''}</p>${rare.requirement?.category?`<p>${esc(rare.requirement.category)} 完了Lv${amount(resolveCompletedResearchLevel(state,rare.requirement.category))} / 必要Lv${amount(rare.requirement.level)}</p>`:''}`:empty);
}

function actions(player){
  const faction=player.factionState,ai=faction.aiState||{},plan=ai.developmentPlan,objective=ai.objective||{};
  const purpose=describeV39NpcObjective(objective);
  const current=`<p><b>現在の目標: ${esc(purpose)}</b></p>${objective.targetName||objective.targetTileKey?`<p>${esc(objective.targetName||'')}${objective.targetTileKey?' @'+esc(objective.targetTileKey):''}</p>`:''}${objective.resource?`<p>必要資源: ${esc(objective.resource)}</p>`:''}`;
  const teams=(ai.resourceTeams||plan?.resourceTeams||[]).map(team=>`<li>${esc(team.resource)} / 不足${amount(team.missing)} / ${esc(team.role)} / ${esc(team.status)} / ${team.unitIds?.length||0}駒${team.objective?.targetName?' / '+esc(team.objective.targetName):''}</li>`).join('');
  const reinforcement=plan?.reinforcement;
  const label=reinforcement?.status==='satisfied'?(reinforcement.queued?'訓練完了待ち':'目標数を確保'):reinforcement?.status==='ready'?'次の訓練':'増強・条件待ち';
  const training=!reinforcement?'<p>次のAI行動で判断します。</p>':`<p>${label}: 生存${amount(reinforcement.living)}＋訓練中${amount(reinforcement.queued)} / 目標${amount(reinforcement.target)}駒（あと${amount(reinforcement.remaining)}）</p>${reinforcement.className?`<p>${esc(reinforcement.unitType)} / ${esc(reinforcement.race)} / ${esc(reinforcement.className)} Lv${amount(reinforcement.level)}</p>`:''}${reasons(reinforcement.reasons)}`;
  const units=faction.units||[];
  const roster=units.map(unit=>`<li data-npc-unit="${esc(unit.id)}"><b>${esc(unit.name)}</b> / ${unit.isSovereign?'統治者':['army','elite_army'].includes(unit.combatProfile?.mode)?`${esc(unit.unitType||'軍隊')} ${amount(unit.combatProfile.memberCount??unit.combatProfile.populationCost)}人`:unit.isNamed?'ヒーロー':'一般兵'} Lv${amount(unit.level)}<small>${esc(unit.worldId||'surface')} (${unit.x??'-'},${unit.y??'-'}) / HP ${amount(unit.hp??unit.currentHp)}/${amount(unit.maxHp)} / AP ${amount(unit.ap??unit.currentAp)}</small></li>`).join('');
  return foodBalanceMarkup(plan)+card('行動目標',current,'data-npc-current-objective')+card('直近の行動',`<ul class="npc-diagnostic-list">${(ai.lastCommands||[]).map(command=>`<li>${esc(command)}</li>`).join('')||'<li>まだ実行されていません</li>'}</ul>`)
    +card('資源確保の分担',teams?`<ul class="npc-diagnostic-list">${teams}</ul>`:empty,'data-npc-resource-teams')
    +card('戦力増強',training,'data-npc-reinforcement-goal')
    +card(`所属ユニット / 生存${units.filter(alive).length}・訓練中${(faction.unitTrainingQueue||[]).length}`,roster?`<ul class="npc-diagnostic-list">${roster}</ul>`:empty);
}

export function renderV39NpcDiagnostics(state,openAttribute=''){
  const factions=(state.players||[]).filter(player=>player.isPlayer===false),selection=npcDiagnosticSelection;
  if(!factions.some(player=>player.id===selection.factionId))selection.factionId=factions[0]?.id||'';
  const player=factions.find(row=>row.id===selection.factionId);
  const selector=`<select data-npc-diagnostic-select aria-label="診断するNPC勢力"${!factions.length?' disabled':''}>${factions.length?factions.map((player,index)=>`<option value="${esc(player.id)}" title="${esc(player.label||player.name||player.id)}"${selection.factionId===player.id?' selected':''}>N${index+1} / ${esc(player.race)}</option>`).join(''):'<option>なし</option>'}</select>`;
  const tabs=`<nav class="npc-diagnostic-tabs" role="tablist" aria-label="NPC診断の表示内容">${views.map(([id,label])=>`<button type="button" role="tab" id="npc-diagnostic-tab-${id}" data-npc-diagnostic-view="${id}" aria-selected="${selection.view===id}" aria-controls="npc-diagnostic-content" tabindex="${selection.view===id?0:-1}">${label}</button>`).join('')}</nav>`;
  const body=player?`<div class="npc-diagnostic-header">${tabs}</div><article role="tabpanel" id="npc-diagnostic-content" tabindex="0" aria-labelledby="npc-diagnostic-tab-${selection.view}" data-npc-diagnostic="${esc(player.id)}" data-npc-diagnostic-content="${selection.view}">${({resources,population,construction,research,actions})[selection.view](player)}</article>`:'<p>NPC勢力は登録されていません。開始設定のNPC勢力数、または「進行 → 勢力追加」を確認してください。</p>';
  return `<details class="v39-test-section npc-diagnostic" data-test-section="npc-ai"${openAttribute}><summary><span>NPC勢力診断（${factions.length}）</span>${selector}</summary><div class="v39-test-section-body">${body}</div></details>`;
}

export function handleV39NpcDiagnosticEvent(event,render){
  const select=event.target.closest?.('[data-npc-diagnostic-select]');
  if(select&&event.type==='change'){
    npcDiagnosticSelection.factionId=select.value;render();
    document.querySelector('[data-npc-diagnostic-select]')?.focus({preventScroll:true});return true;
  }
  const button=event.target.closest?.('[data-npc-diagnostic-view]');
  if(!button)return false;
  let view=button.dataset.npcDiagnosticView;
  if(event.type==='keydown'){
    const index=views.findIndex(([id])=>id===view),offset=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
    const next=offset?(index+offset+views.length)%views.length:event.key==='Home'?0:event.key==='End'?views.length-1:-1;
    if(next<0)return false;event.preventDefault();view=views[next][0];
  }else if(event.type!=='click')return false;
  npcDiagnosticSelection.view=view;render();
  document.querySelector(`[data-npc-diagnostic-view="${view}"]`)?.focus({preventScroll:true});return true;
}
