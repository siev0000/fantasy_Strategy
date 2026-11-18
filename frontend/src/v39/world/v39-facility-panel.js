import {renderV39SummonPicker} from '../unit/v39-summon-modal.js';
import {renderV39EnchantmentOptions} from '../unit/v39-equipment-ui.js';
import {renderV39UnitCard} from '../unit/v39-unit-card.js';
import {applyV39DerivedCharacterData} from '../unit/v39-character-derived-rules.js';
import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';
import {getV39GolemEnchantOptions,golemEnchantParts} from '../../lib/v39-equipment-rules.js';
import {golemWorkshopSizes,golemSizes,golemRecipeNames,inspectV39GolemOrder,orderV39Golem} from '../../lib/v39-golem-workshop.js';
import {getFactionSettlements} from '../../lib/settlement-state.js';
import {getGameDataRows} from '../../lib/game-data-registry.js';
import {getV39FacilitySummonSlots} from '../../lib/v39-facility-summoning.js';
import {resolveV39FacilitySummonCosts} from '../../lib/v39-facility-summon-costs.js';
import {formatV39SummonMaterials} from '../../lib/v39-summon-materials.js';
import {getV39DeathProtectionStatus} from '../../lib/v39-death-purification.js';
import {renderV39FacilityStorageButtons} from '../unit/v39-facility-storage-ui.js';
import './v39-facility-panel.css';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function getV39SettlementFacilities(state,playerId,base){
  if(!base)return [];
  const worldId=base.worldId||'surface';
  const rows=Object.entries(base.tileFacilityMap||{}).flatMap(([tileKey,names])=>(Array.isArray(names)?names:[]).map(name=>({
    id:JSON.stringify([worldId,tileKey,name]),tileKey,name,worldId,base,
    health:base.facilityStateByTile?.[tileKey]?.[name]
  })));
  // Older saves can contain a completed building before its tile was recorded.
  for(const name of base.buildings||[])if(!rows.some(row=>row.name===name))rows.push({id:JSON.stringify([base.settlementId,name]),name,worldId,base});
  return rows;
}
export function getV39LandFacility(state,playerId,tileKey){
  if(state.territoryOwnerByTile?.[tileKey]!==playerId)return null;
  const player=state.players?.find(row=>row.id===playerId);
  return getFactionSettlements(player?.factionState).flatMap(base=>getV39SettlementFacilities(state,playerId,base))
    .find(row=>row.tileKey===tileKey&&row.worldId===(state.activeWorldId||'surface'))||null;
}
function golemWorkshopMarkup(state,playerId,base,tileKey,name){
  const capacity=golemWorkshopSizes.indexOf(name);
  if(capacity<0)return '';
  const faction=state.players.find(player=>player.id===playerId)?.factionState;
  const order=faction?.golemOrders?.find(row=>row.tileKey===tileKey);
  if(order)return `<p>${order.remainingTurns>0?`ゴーレム作成中 · 残${order.remainingTurns}T`:'完成 · 配置待ち'}</p>`;
  return `<button type="button" class="settlement-chip" data-golem-workshop="${esc(JSON.stringify({
    settlementId:base.settlementId||base.id,tileKey,facilityName:name
  }))}">ゴーレム作成</button>`;
}

function openGolemWorkshop(request){
  const dialog=document.createElement('dialog');
  dialog.id='v39-golem-workshop';
  dialog.setAttribute('aria-labelledby','v39-summon-title');
  const labels={common:'コモン',uncommon:'アンコモン',rare:'レア',epic:'エピック'};
  const sizes=golemSizes.slice(0,golemWorkshopSizes.indexOf(request.facilityName)+1);
  let size=0,draft=null,activePart='頭',reviewing=false,needsReview=false;
  const chosenModifications=new Set();
  request.golemName??='ストーンゴーレム';
  function render(){
    const state=window.getV39GameState({includeWorlds:false});
    const map=window.__v39FieldRuntime?.mapData;
    const check=inspectV39GolemOrder(state,{...request,size,...draft},map);
    const cost=[...Object.entries(check.material),...Object.entries(check.food)].map(([key,amount])=>`${key}${amount}`).join('・');
    const summary=`<p>消費 ${esc(cost)} / ${check.turns}T</p>${check.reasons.length?`<p role="status">${esc(check.reasons.join(' / '))}</p>`:''}`;
    let candidates,detail;
    if(draft){
      const {limit,used}=check;
      const chosen=draft.enchantmentsByPart[activePart]||[];
      const partOptions=getV39GolemEnchantOptions(check.player,check.base,activePart);
      const options=partOptions.map(option=>{
        const selected=chosen.includes(option.name);
        const reason=option.failed.join(' / ')||(option.cost.level>(limit?.single??0)?'個別Lv上限を超えています':
          used+option.cost.level>(limit?.total??0)?'合計Lv上限を超えています':'');
        return {...option,name:option.name,selected,available:selected||!reason,reason};
      });
      candidates=`<p>品質　${labels[check.enchantment.quality]}</p>
        ${Object.entries(golemEnchantParts).map(([part,name])=>`<button type="button" class="v39-summon-action" data-golem-part="${part}" aria-pressed="${activePart===part}">${part}（${name}）</button>`).join('')}`;
      const selectedSummary=Object.entries(golemEnchantParts).map(([part])=>
        `<p>${part}　${esc(draft.enchantmentsByPart[part]?.join('、')||'付与なし')}</p>`).join('');
      const extraSources=[...check.selections.keys()]
        .filter(source=>check.additionalCandidates.some(row=>row.source===source));
      candidates+=extraSources.map(source=>`<button type="button" class="v39-summon-action"
        data-golem-part="${esc(source)}" aria-pressed="${activePart===source}">${esc(source)}</button>`).join('');
      const modifications=check.additionalCandidates.filter(row=>row.source===activePart);
      const selected=modifications.find(row=>check.additionalSkillNames.includes(row.name));
      const buttons=modifications.map(row=>`<button type="button" data-golem-modification="${esc(activePart)}"
        data-golem-skill="${esc(row.name)}" class="${row===selected?'active':''}" aria-pressed="${row===selected}" ${row.known?'disabled':''}>
        <b>${esc(row.name)}${row.known?'（習得済み）':''}</b><span>${esc(row.detail)}</span></button>`).join('');
      const emptyLabel=check.selections.get(activePart)?.emptyLabel;
      const defaultChoice=emptyLabel&&modifications.length>1?`<button type="button" data-golem-modification="${esc(activePart)}" data-golem-skill=""
        class="${selected?'':'active'}" aria-pressed="${!selected}"><b>${esc(emptyLabel)}</b></button>`:'';
      const content=modifications.length
        ? `<h4>${esc(activePart)}</h4><div class="summon-scroll"><div class="v39-enchant-options">${defaultChoice}${buttons}</div></div>`
        : `<h4>${activePart}（${golemEnchantParts[activePart]}）</h4>
           <p>全身の付与Lv ${used}/${limit.total}　1件 Lv${limit.single}まで</p>
           <div class="summon-scroll">${renderV39EnchantmentOptions(options,'data-golem-enchantment',true)}</div>`;
      const unenchanted=Object.keys(golemEnchantParts).filter(part=>!draft.enchantmentsByPart[part]?.length);
      const unselected=extraSources.filter(source=>!chosenModifications.has(source)
        &&check.additionalCandidates.some(row=>row.source===source&&!row.known));
      needsReview=unenchanted.length>0||unselected.length>0;
      if(reviewing){
        const skillSummary=extraSources.map(source=>{
          const rows=check.additionalCandidates.filter(row=>row.source===source);
          const selected=rows.find(row=>check.additionalSkillNames.includes(row.name));
          const value=selected?.name||(rows.every(row=>row.known)?'習得済み':check.selections.get(source)?.emptyLabel||'追加なし');
          const automatic=!chosenModifications.has(source);
          return `<p>${esc(source)}　${esc(value)}${automatic?'（初期設定）':''}</p>`;
        }).join('');
        detail=`<h4>予約内容を再確認</h4><div class="summon-scroll">
          ${unenchanted.length?`<p>付与なし　${unenchanted.join('・')}</p>`:''}
          ${unselected.length?`<p>未選択　${esc(unselected.join('・'))}</p>`:''}
          ${selectedSummary}${skillSummary}</div><footer>${summary}<div class="v39-golem-actions">
          <button type="button" class="v39-summon-action" data-golem-review-back>選択に戻る</button>
          <button type="button" class="v39-summon-action" data-golem-commit ${check.reasons.length?'disabled':''}>この内容で作成</button>
        </div></footer>`;
        candidates=`<p>${esc(request.golemName)}（${sizes[size].label}型）</p><p>品質　${labels[check.enchantment.quality]}</p>`;
      }else detail=`${content}
        <footer>${selectedSummary}${summary}<div class="v39-golem-actions">
          <button type="button" class="v39-summon-action" data-golem-back>作成候補へ戻る</button>
          <button type="button" class="v39-summon-action" data-golem-confirm ${check.reasons.length?'disabled':''}>予約確定</button>
        </div></footer>`;
    }else{
      const preview=(recipe,index)=>applyV39DerivedCharacterData({id:`golem-preview-${index}`,name:request.golemName,
        race:request.golemName,className:request.golemName,level:recipe.level,golemBuild:{siz:recipe.siz,bonuses:check.buildBonuses}});
      candidates=`<p>作成者　${esc(check.creator?.name||'—')}</p>
        ${golemRecipeNames.length>1?`<label>種類<select data-golem-recipe>${golemRecipeNames.map(name=>
          `<option ${name===request.golemName?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`:''}
        ${sizes.map((recipe,index)=>renderV39UnitCard(preview(recipe,index),{
          id:index,attribute:'data-golem-size',character:true,portrait:true,selected:index===size,
          collapseUnselected:false,position:`${recipe.label}型 / SIZ${recipe.siz}`
        })).join('')}`;
      const recipe=sizes[size],reach=golemWorkshopSizes.indexOf(request.facilityName);
      const unit=preview(recipe,size);
      detail=`<h4>${esc(request.golemName)}（${recipe.label}型）</h4>
        <div class="summon-scroll"><p>Lv${recipe.level} / SIZ${recipe.siz} / ${labels[check.enchantment.quality]}</p>
        <p>地形条件の範囲　${reach?`工房から${reach}マス以内`:'工房マスのみ'}</p>
        <p>HP ${unit.maxHp}　攻撃 ${unit.status?.攻撃??'–'}　防御 ${unit.status?.防御??'–'}</p></div>
        <footer>${summary}<button type="button" class="v39-summon-action" data-golem-next ${check.reasons.length?'disabled':''}>付与へ進む</button></footer>`;
    }

    updateV39RetainedMarkup(dialog,renderV39SummonPicker({title:reviewing?'ゴーレム作成の再確認':draft?'ゴーレムの付与':'ゴーレム作成',
      closeAttribute:'data-golem-close',candidates,detail}));
  }
  dialog.addEventListener('change',event=>{
    if(event.target.matches('[data-golem-recipe]'))request.golemName=event.target.value;
    else return;
    render();
  });
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    if(button.hasAttribute('data-golem-close')){dialog.close();return;}
    if(button.hasAttribute('data-golem-size'))size=Number(button.dataset.golemSize);
    else if(button.hasAttribute('data-golem-next')){
      activePart='頭';
      chosenModifications.clear();
      draft={enchantmentsByPart:{},additionalSkillNames:[]};
    }
    else if(button.hasAttribute('data-golem-back'))draft=null;
    else if(button.hasAttribute('data-golem-part'))activePart=button.dataset.golemPart;
    else if(draft&&button.hasAttribute('data-golem-modification')){
      const {golemModification,golemSkill}=button.dataset;
      chosenModifications.add(golemModification);
      const names=[...dialog.querySelectorAll('[data-golem-modification]')]
        .filter(row=>row.dataset.golemModification===golemModification).map(row=>row.dataset.golemSkill);
      draft.additionalSkillNames=draft.additionalSkillNames.filter(name=>!names.includes(name));
      if(golemSkill)draft.additionalSkillNames.push(golemSkill);
    }else if(button.hasAttribute('data-golem-enchantment')){
      const name=button.dataset.golemEnchantment,previous=draft.enchantmentsByPart[activePart]||[];
      draft.enchantmentsByPart[activePart]=previous.includes(name)?previous.filter(value=>value!==name):[...previous,name];
    }else if(button.hasAttribute('data-golem-review-back')){
      reviewing=false;
    }else if(button.hasAttribute('data-golem-confirm')&&needsReview){
      reviewing=true;
    }else if(draft&&(button.hasAttribute('data-golem-confirm')||button.hasAttribute('data-golem-commit'))){
      const result=orderV39Golem(window.getV39GameState({includeWorlds:false}),{...request,size,...draft},window.__v39FieldRuntime?.mapData);
      if(!result.reason){
        window.setV39GameState({players:result.state.players},{reason:'golem-order'});
        dialog.close();return;
      }
      window.showV39TurnBanner?.(result.reason,true);
    }else return;
    render();
  });
  const lock=window.beginV39MapInputLock?.('golem-workshop');
  dialog.addEventListener('close',()=>{
    if(lock!=null)window.endV39MapInputLock?.(lock);
    dialog.remove();
  },{once:true});
  document.body.append(dialog);render();dialog.showModal();
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-golem-workshop]');
  if(button)openGolemWorkshop(JSON.parse(button.dataset.golemWorkshop));
});

export function renderV39FacilityOperations(state,playerId,facility){
  if(!facility)return '';
  const {base,name,tileKey,worldId,health}=facility;
  const row=getGameDataRows('施設').find(row=>row.施設名===name);
  const currentWorld=worldId===(state.activeWorldId||'surface');
  const owned=currentWorld&&tileKey&&state.territoryOwnerByTile?.[tileKey]===playerId;
  const slot=owned?getV39FacilitySummonSlots(state,playerId,base.settlementId||base.id).find(slot=>slot.tileKey===tileKey&&slot.row.施設名===name):null;
  const summon=slot?`<button type="button" class="settlement-chip" data-facility-summon-open="${esc(slot.id)}">施設召喚${slot.activeUnitIds.length?` · 活動中${slot.activeUnitIds.length}駒`:slot.remainingTurns?` · 残${slot.remainingTurns}T`:''}</button>`:'';
  const active=slot?state.players.find(player=>player.id===playerId)?.factionState.units.filter(unit=>slot.activeUnitIds.includes(unit.id))||[]:[];
  const upkeep=active.length?{...resolveV39FacilitySummonCosts(active[0]),goldCost:active.reduce((sum,unit)=>sum+resolveV39FacilitySummonCosts(unit).goldCost,0),
    materials:active.reduce((bag,unit)=>{for(const [name,amount] of Object.entries(unit.summon.upkeepMaterials||{}))bag[name]=(bag[name]||0)+amount;return bag;},{}),
    next:Math.min(...active.map(unit=>unit.summon.nextUpkeepTurn).filter(value=>value!=null))}:null;
  const storage=owned?renderV39FacilityStorageButtons(state,playerId,base,{tileKey,name}):'';
  const protection=name==='墓地'?getV39DeathProtectionStatus(window.__v39FieldRuntime?.mapData,state,playerId,base.settlementId||base.id):null;
  const queue=(base.constructionQueue||[]).filter(item=>item.tileKey===tileKey&&tileKey);
  return `<div class="v39-facility-operations" data-facility-detail="${esc(facility.id)}">
    ${health?`<p>HP ${Math.max(0,Math.round(health.hp||0))}/${Math.round(health.maxHp||100)}</p>`:''}
    ${queue.map(item=>`<p>改築中: ${esc(item.facilityName)} · 残${Math.max(0,Math.floor(item.remainingTurns||0))}T</p>`).join('')}
    ${protection?.capacity?`<p data-v39-cemetery-quota>死亡時の浄化保護 残り${protection.remaining}/${protection.capacity}件（このターン）</p>`:''}
    <div class="settlement-chip-list">${summon}${storage}${owned?golemWorkshopMarkup(state,playerId,base,tileKey,name):''}</div>
    ${upkeep?`<p>召喚維持 ${upkeep.goldCost}金${formatV39SummonMaterials(upkeep.materials)?` ＋ ${esc(formatV39SummonMaterials(upkeep.materials))}`:''} / ${upkeep.upkeepIntervalTurns}Tごと${Number.isFinite(upkeep.next)?` / 次回T${upkeep.next}`:''}</p>`:''}
    ${row?.詳細?`<details class="v39-facility-description"><summary>施設効果</summary><p>${esc(row.詳細)}</p></details>`:''}
    ${!currentWorld?'<p>施設のあるマップで操作してください</p>':!tileKey?'<p>配置情報なし</p>':!owned?'<p>自軍の領土ではありません</p>':''}
  </div>`;
}
