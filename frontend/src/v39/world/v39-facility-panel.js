import {readV39ItemListAction,renderV39ItemListScreen1} from '../ui/v39-item-list-screen-1.js';
import {V39_SCREEN_HELP_COPY} from '../ui/v39-screen-help-copy.js';
import {applyV39DerivedCharacterData} from '../unit/v39-character-derived-rules.js';
import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';
import {describeV39EnchantmentEffects,getV39GolemEnchantmentLimitReason,golemEnchantParts} from '../../lib/v39-equipment-rules.js';
import {golemWorkshopSizes,golemSizes,golemRecipes,golemRecipeNames,getV39GolemWorkshopCreators,getV39OwnedGolemWorkshops,matchesV39GolemTerrain,inspectV39GolemOrder,orderV39Golem} from '../../lib/v39-golem-workshop.js';
import {getFactionSettlements} from '../../lib/settlement-state.js';
import {formatV39FacilityProductionProgress} from '../../lib/v39-production-work.js';
import {getGameDataRows} from '../../lib/game-data-registry.js';
import {resolveFacilityIconArtwork} from '../../lib/facility-icon-artwork.js';
import {resolveV39IconSpriteStyle} from '../../lib/v39-icon-assignment.js';
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
  dialog.setAttribute('aria-labelledby','v39-golem-workshop-title');
  const labels={common:'コモン',uncommon:'アンコモン',rare:'レア',epic:'エピック'};
  let size=0,draft=null,activePart='頭',reviewing=false,needsReview=false;
  let focusedEnhancement=null;
  const chosenModifications=new Set();
  request.golemName??='ストーンゴーレム';
  let detailTab='ability', renderedCheck, availableOnly=false, renderedWorkshops=[];
  const sameWorkshop=workshop=>workshop.settlementId===request.settlementId
    &&workshop.tileKey===request.tileKey&&workshop.facilityName===request.facilityName;
  const selectWorkshop=({settlementId,tileKey,facilityName})=>Object.assign(request,{settlementId,tileKey,facilityName});
  const preview=(name,recipe,bonuses)=>applyV39DerivedCharacterData({
    id:`golem-preview-${name}`,name,race:name,className:name,level:recipe.level,
    golemBuild:{siz:recipe.siz,bonuses}
  });

  function render(){
    const state=window.getV39GameState({includeWorlds:false});
    const map=window.__v39FieldRuntime?.mapData;
    const player=state.players.find(row=>row.id===state.activePlayerId);
    const workshops=getV39OwnedGolemWorkshops(state,state.activePlayerId);
    const capacity=Math.max(golemWorkshopSizes.indexOf(request.facilityName),...workshops.map(shop=>shop.capacity));
    const sizes=golemSizes.slice(0,capacity+1);
    renderedWorkshops=workshops.filter(shop=>shop.capacity>=size);
    const checks=new Map();
    const checkAt=(shop,name)=>{
      const key=JSON.stringify([shop.id,name]);
      if(!checks.has(key))checks.set(key,inspectV39GolemOrder(state,{...shop,size,golemName:name},map));
      return checks.get(key);
    };
    let selectedWorkshop=renderedWorkshops.find(sameWorkshop);
    if(!draft&&!selectedWorkshop&&renderedWorkshops.length){
      selectedWorkshop=renderedWorkshops.find(shop=>!checkAt(shop,request.golemName).reasons.length)||renderedWorkshops[0];
      selectWorkshop(selectedWorkshop);
    }
    const terrainFits=(shop,name)=>matchesV39GolemTerrain(map,shop.tileKey,shop.facilityName,golemRecipes.get(name)?.必要地形);
    const preparedWorkshops=renderedWorkshops.filter(shop=>getV39GolemWorkshopCreators(player?.factionState,shop.tileKey).length===1);
    const availability=new Map();
    if(!draft){
      for(const name of golemRecipeNames){
        const here=!!selectedWorkshop&&terrainFits(selectedWorkshop,name)&&!checkAt(selectedWorkshop,name).reasons.length;
        const elsewhere=!here&&preparedWorkshops.some(shop=>shop!==selectedWorkshop&&terrainFits(shop,name)&&!checkAt(shop,name).reasons.length);
        availability.set(name,{here,elsewhere});
      }
      if(availableOnly&&!availability.get(request.golemName)?.here&&!availability.get(request.golemName)?.elsewhere){
        const first=golemRecipeNames.find(name=>availability.get(name).here||availability.get(name).elsewhere);
        if(first)request.golemName=first;
      }
    }
    const check=!draft&&selectedWorkshop?checkAt(selectedWorkshop,request.golemName)
      :inspectV39GolemOrder(state,{...request,size,...draft},map);
    renderedCheck=check;
    const facility=getGameDataRows('施設').find(row=>row.施設名===request.facilityName);
    const reach=golemWorkshopSizes.indexOf(request.facilityName);
    const copy=V39_SCREEN_HELP_COPY.golem;
    const help=[
      reviewing?copy.review:draft?copy.enhance:copy.select,
      request.facilityName,facility?.詳細,
      copy.terrain(reach)
    ].filter(Boolean);
    const costs={...check.material,...check.food};
    const getStock=name=>Number((Object.hasOwn(check.food,name)?check.base?.foodStockByType:check.base?.materialStockByType)?.[name])||0;
    const shortages=Object.fromEntries(Object.entries(costs).filter(([name,amount])=>getStock(name)<amount));
    const reasons=check.reasons.filter(reason=>!Object.keys(shortages).some(name=>reason===`${name}が不足しています`));
    const screen={
      title:reviewing?'ゴーレム作成の再確認':draft?'ゴーレムの付与':'ゴーレム作成',
      titleId:'v39-golem-workshop-title',closeAttribute:'data-golem-close',help,
      status:reasons.join(' / '),
      costs:[
        {label:'作成時',amounts:costs,summary:`工期 ${check.turns}T`},
        {label:'素材不足',amounts:shortages,stock:Object.fromEntries(Object.keys(shortages).map(name=>[name,getStock(name)]))}
      ]
    };

    if(!draft){
      const recipe=sizes[size];
      screen.rows=golemRecipeNames.flatMap(name=>{
        const {here,elsewhere}=availability.get(name);
        if(availableOnly&&!here&&!elsewhere)return [];
        return [{
          id:name,unit:preview(name,recipe,name===request.golemName?check.buildBonuses:undefined),
          unavailable:!here&&!elsewhere,
          badge:here?{icon:'✓',label:'作成可'}:elsewhere?{icon:'↗',label:'別の工房で作成可'}:{icon:'×',label:'条件未達'}
        }];
      });
      screen.listActions=[{id:'available-only',label:'作成可能のみ',selected:availableOnly}];
      const workshopsOptions=renderedWorkshops.map(shop=>{
        const option=checkAt(shop,request.golemName);
        const bonus=option.additionalSkillSlots? ` / 追加スキル+${option.additionalSkillSlots}`:'';
        const creator=option.creator?`${option.creator.name}${option.craftedByGolemCrafter?'（クラフター）':''} / 工期${option.turns}T${bonus}`:'作成者なし';
        return {value:shop.id,label:`${shop.baseName} ${shop.facilityName}（${shop.tileKey}） / ${creator}${option.reasons.length?' / 条件未達':''}`};
      });
      const creatorNote=check.creator
        ? `作成者 ${check.creator.name}${check.craftedByGolemCrafter?'（クラフター）':''} / 追加スキル+${check.additionalSkillSlots}`
        : '作成者なし';
      screen.detail={
        selectedId:request.golemName,candidateAttribute:'data-golem-recipe',
        unit:preview(request.golemName,recipe,check.buildBonuses),activeDetailTab:detailTab,
        emptyText:availableOnly?'作成できるゴーレムがいません':'候補がありません',
        notes:[`サイズ ${recipe.siz} / 付与品質 ${labels[check.enchantment.quality]}`,creatorNote],
        controls:[
          {id:'size',label:'サイズ',attribute:'data-golem-size',value:size,options:sizes.map(({label},index)=>({value:index,label:`${label}型`}))},
          {id:'workshop',label:'工房',attribute:'data-golem-workshop-select',value:selectedWorkshop?.id,
            options:workshopsOptions.length?workshopsOptions:[{value:'',label:'対応する工房なし'}]}
        ]
      };
      screen.enhancement={destination:'enhancement',attribute:'data-golem-next',disabled:check.reasons.length>0};
    }else{
      const parts=Object.entries(golemEnchantParts);
      const extraSources=[...check.selections.keys()].filter(source=>check.additionalCandidates.some(row=>row.source===source));
      const selectedSummary=parts.map(([part])=>`${part}　${draft.enchantmentsByPart[part]?.join('、')||'付与なし'}`);
      const unenchanted=parts.filter(([part])=>!draft.enchantmentsByPart[part]?.length).map(([part])=>part);
      const unselected=extraSources.filter(source=>!chosenModifications.has(source)
        &&check.additionalCandidates.some(row=>row.source===source&&!row.known));
      needsReview=unenchanted.length>0||unselected.length>0;
      screen.listNotes=[`${request.golemName}（${sizes[size].label}型）`,`品質　${labels[check.enchantment.quality]}`];

      if(reviewing){
        const lines=[];
        if(unenchanted.length)lines.push(`付与なし　${unenchanted.join('・')}`);
        if(unselected.length)lines.push(`未選択　${unselected.join('・')}`);
        const skillSummary=extraSources.map(source=>{
          const rows=check.additionalCandidates.filter(row=>row.source===source);
          const selected=rows.find(row=>check.additionalSkillNames.includes(row.name));
          const value=selected?.name||(rows.every(row=>row.known)?'習得済み':check.selections.get(source)?.emptyLabel||'追加なし');
          return `${source}　${value}${chosenModifications.has(source)?'':'（初期設定）'}`;
        });
        screen.detail={kind:'review',heading:'予約内容を再確認',lines:[...lines,...selectedSummary,...skillSummary]};
        screen.actions=[
          {id:'back',destination:'enhancement',label:'選択に戻る',attribute:'data-golem-review-back'},
          {id:'commit',label:'この内容で作成',attribute:'data-golem-commit',disabled:check.reasons.length>0}
        ];
      }else{
        screen.groups=[
          ...parts.map(([part,name])=>({value:part,label:`${part}（${name}）`})),
          ...extraSources.map(source=>({value:source,label:source}))
        ].map(group=>({...group,id:'group',attribute:'data-golem-part',selected:activePart===group.value}));
        const modifications=check.additionalCandidates.filter(row=>row.source===activePart);
        const choices=[];
        let limitText='';
        let section=activePart;
        if(modifications.length){
          const selected=modifications.find(row=>check.additionalSkillNames.includes(row.name));
          const emptyLabel=check.selections.get(activePart)?.emptyLabel;
          if(emptyLabel&&modifications.length>1)choices.push({id:'modification',value:'',label:emptyLabel,selected:!selected});
          choices.push(...modifications.map(row=>({
            id:'modification',value:row.name,label:`${row.name}${row.known?'（習得済み）':''}`,
            lines:[row.detail,row.known?'習得済み':''].filter(Boolean),selected:row===selected,disabled:row.known
          })));
        }else{
          section=`${activePart}（${golemEnchantParts[activePart]}）`;
          const {used,limit}=check;
          limitText=`全身の付与Lv ${used}/${limit.total}　1件 Lv${limit.single}まで`;
          const chosen=draft.enchantmentsByPart[activePart]||[];
          for(const option of check.enchantOptionsByPart[activePart]||[]){
            const selected=chosen.includes(option.name);
            const reason=option.failed.join(' / ')||getV39GolemEnchantmentLimitReason(option.cost.level,limit,used);
            choices.push({id:'enchantment',value:option.name,attribute:'data-golem-enchantment',
              label:`${option.name} Lv${option.cost.level}`,selected,disabled:!selected&&!!reason,
              lines:[...describeV39EnchantmentEffects(option.row), selected?'選択済み':reason].filter(Boolean),
              amounts:{...option.cost.material,...option.cost.food}
            });
          }
        }
        const focused=choices.find(candidate=>candidate.value===focusedEnhancement)||choices[0];
        screen.detail={
          kind:'enhancement',
          target:{heading:screen.listNotes[0],lines:[screen.listNotes[1],section,limitText].filter(Boolean)},
          choices:choices.map(({label,value,selected})=>({
            id:'inspect-enhancement',value,label,selected,focused:value===focused?.value
          })),
          choice:focused?{
            label:focused.label,lines:focused.lines,amounts:focused.amounts,
            action:{...focused,label:focused.id==='enchantment'&&focused.selected?'外す':'選択',selected:undefined,
              disabled:focused.disabled||(focused.id==='modification'&&focused.selected&&chosenModifications.has(activePart))}
          }:null
        };
        screen.footerNotes=selectedSummary;
        screen.actions=[
          {id:'back',destination:'candidates',label:'作成候補へ戻る',attribute:'data-golem-back'},
          {id:'confirm',destination:needsReview?'review':undefined,label:'予約確定',attribute:'data-golem-confirm',disabled:check.reasons.length>0}
        ];
      }
    }
    updateV39RetainedMarkup(dialog,renderV39ItemListScreen1(screen));
  }

  dialog.addEventListener('change',event=>{
    const action=readV39ItemListAction(event.target);
    if(action?.id==='size')size=Number(action.value);
    else if(action?.id==='workshop'){
      const workshop=renderedWorkshops.find(row=>row.id===action.value);
      if(!workshop)return;
      selectWorkshop(workshop);
    }else return;
    render();
  });
  dialog.addEventListener('click',event=>{
    if(event.target.closest?.('select'))return;
    const action=readV39ItemListAction(event.target);
    if(!action)return;
    const {id,value,destination}=action;
    if(id==='close'){dialog.close();return;}
    if(id==='candidate'){
      request.golemName=value;
      detailTab='ability';
    }else if(id==='available-only')availableOnly=!availableOnly;
    else if(id==='detail-tab')detailTab=value;
    else if(id==='enhance'&&destination==='enhancement'){
      activePart='頭';
      focusedEnhancement=null;
      chosenModifications.clear();
      draft={enchantmentsByPart:{},additionalSkillNames:[]};
    }else if(id==='back'){
      if(destination==='candidates')draft=null;
      reviewing=false;
    }else if(id==='group'){
      activePart=value;
      focusedEnhancement=null;
    }else if(draft&&id==='inspect-enhancement')focusedEnhancement=value;
    else if(draft&&id==='modification'){
      chosenModifications.add(activePart);
      const names=renderedCheck.additionalCandidates.filter(row=>row.source===activePart).map(row=>row.name);
      draft.additionalSkillNames=draft.additionalSkillNames.filter(name=>!names.includes(name));
      if(value)draft.additionalSkillNames.push(value);
    }else if(draft&&id==='enchantment'){
      const previous=draft.enchantmentsByPart[activePart]||[];
      draft.enchantmentsByPart[activePart]=previous.includes(value)?previous.filter(name=>name!==value):[...previous,value];
    }else if(id==='confirm'&&destination==='review')reviewing=true;
    else if(draft&&(id==='confirm'||id==='commit')){
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

export function renderV39FacilityOperations(state,playerId,facility,intel){
  if(!facility)return '';
  const {base,name,tileKey,worldId,health}=facility;
  const row=getGameDataRows('施設').find(row=>row.施設名===name);
  const currentWorld=worldId===(state.activeWorldId||'surface');
  const owned=!intel&&currentWorld&&tileKey&&state.territoryOwnerByTile?.[tileKey]===playerId;
  const slot=owned?getV39FacilitySummonSlots(state,playerId,base.settlementId||base.id).find(slot=>slot.tileKey===tileKey&&slot.row.施設名===name):null;
  const summon=slot?`<button type="button" class="settlement-chip" data-facility-summon-open="${esc(slot.id)}">施設召喚${slot.activeUnitIds.length?` · 活動中${slot.activeUnitIds.length}駒`:slot.remainingTurns?` · 残${slot.remainingTurns}T`:''}</button>`:'';
  const active=slot?state.players.find(player=>player.id===playerId)?.factionState.units.filter(unit=>slot.activeUnitIds.includes(unit.id))||[]:[];
  const upkeep=active.length?{...resolveV39FacilitySummonCosts(active[0]),goldCost:active.reduce((sum,unit)=>sum+resolveV39FacilitySummonCosts(unit).goldCost,0),
    materials:active.reduce((bag,unit)=>{for(const [name,amount] of Object.entries(unit.summon.upkeepMaterials||{}))bag[name]=(bag[name]||0)+amount;return bag;},{}),
    next:Math.min(...active.map(unit=>unit.summon.nextUpkeepTurn).filter(value=>value!=null))}:null;
  const storage=owned?renderV39FacilityStorageButtons(state,playerId,base,{tileKey,name}):'';
  const protection=!intel&&name==='墓地'?getV39DeathProtectionStatus(window.__v39FieldRuntime?.mapData,state,playerId,base.settlementId||base.id):null;
  const queue=(base.constructionQueue||[]).filter(item=>item.tileKey===tileKey&&tileKey);
  const art=resolveFacilityIconArtwork(name);
  const artworkStyle=art&&resolveV39IconSpriteStyle({...art.sheetFrame,src:art.src},art.sheetFrame.slotNumber+1);
  const maxHp=Math.max(1,Math.round(health?.maxHp||100));
  const hp=Math.max(0,Math.round(health?.hp||0));
  const hpRatio=Math.min(1,hp/maxHp);
  const hpTone=hpRatio>0.6?'healthy':hpRatio>0.3?'damaged':'critical';
  return `<div class="v39-facility-operations" data-facility-detail="${esc(facility.id)}">
    ${artworkStyle?`<span class="v39-facility-art" aria-hidden="true" style="background-image:${esc(artworkStyle.backgroundImage)};background-size:${artworkStyle.backgroundSize};background-position:${artworkStyle.backgroundPosition}"></span>`:""}
    ${health?`<p class="v39-facility-hp"><span>HP ${hp}/${maxHp}</span><span class="v39-facility-hp-track" data-hp-tone="${hpTone}" aria-hidden="true"><span style="width:${hpRatio*100}%"></span></span></p>`:''}
    ${queue.map(item=>`<p>改築中: ${esc(item.facilityName)} · ${formatV39FacilityProductionProgress(item)}</p>`).join('')}
    ${protection?.capacity?`<p data-v39-cemetery-quota>死亡時の浄化保護 残り${protection.remaining}/${protection.capacity}件（このターン）</p>`:''}
    ${intel?(row?.格納種別==='生体'? `<button type="button" class="settlement-chip" data-surveyed-storage="${esc(facility.id)}">格納ユニット一覧（${intel.storedUnits.filter(unit=>unit.tileKey===tileKey&&unit.facilityName===name).length}）</button>`:''):
      `<div class="settlement-chip-list">${summon}${storage}${owned?golemWorkshopMarkup(state,playerId,base,tileKey,name):''}</div>`}
    ${upkeep?`<p>召喚維持 ${upkeep.goldCost}金${formatV39SummonMaterials(upkeep.materials)?` ＋ ${esc(formatV39SummonMaterials(upkeep.materials))}`:''} / ${upkeep.upkeepIntervalTurns}Tごと${Number.isFinite(upkeep.next)?` / 次回T${upkeep.next}`:''}</p>`:''}
    ${row?.詳細?`<details class="v39-facility-description"><summary>施設効果</summary><p>${esc(row.詳細)}</p></details>`:''}
    ${intel?'':!currentWorld?'<p>施設のあるマップで操作してください</p>':!tileKey?'<p>配置情報なし</p>':!owned?'<p>自軍の領土ではありません</p>':''}
  </div>`;
}
