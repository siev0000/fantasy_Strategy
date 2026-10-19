import {getV39FusionRecipes,getV39FusionSkills,inspectV39MonsterFusion,inspectV39FusionMaterial,executeV39MonsterFusion,isV39FusionTerritoryScope,resolveV39FusionMaterialRadius,getV39FusionMaterials} from '../../lib/v39-monster-fusion.js';
import {matchV39FusionMaterialRequirement} from '../../lib/v39-monster-fusion.js';
import {resolveUnitArtwork} from '../../lib/map-entity-artwork.js';
import {resolveMonsterSheetArtwork} from '../../lib/monster-sheet-artwork.js';
import {renderV39UnitAbility,renderV39DetailTabs,renderV39UnitEquipment,renderV39UnitGrowth} from './v39-unit-detail.js';
import {renderV39UnitSkills} from './v39-unit-skills.js';
import {renderV39UnitCard} from './v39-unit-card.js';
import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';
import defaults from '../../../../config/v39-fusion-defaults.json';
import './v39-fusion-modal.css';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=null,lock=null,timer=null;
const currentState=()=>window.getV39GameState({includeWorlds:false});
function close(){clearTimeout(timer);timer=null;document.getElementById('v39-fusion-modal')?.remove();session=null;if(lock!==null)window.endV39MapInputLock?.(lock);lock=null;}
function portrait(unit,silhouette=false){
  const art=unit?(resolveMonsterSheetArtwork(unit)||resolveUnitArtwork(unit)):null,frame=art?.sheetFrame;
  const style=art?`background-image:url('${esc(art.src)}');background-size:${frame?`${frame.columns*100}% ${frame.rows*100}%`:'contain'};background-position:${frame?`${frame.column/(frame.columns-1)*100}% ${frame.row/(frame.rows-1)*100}%`:'center'};`:'';
  return `<div class="fusion-portrait${silhouette?' silhouette':''}" style="${style}" aria-label="${esc(silhouette?'素材を選択すると表示':unit?.name||'画像なし')}">${art?'':'?'}</div>`;
}
function candidateReasons(state,check,unit){
  const reasons=inspectV39FusionMaterial(state,session.playerId,check.actor,unit);
  if(session.materialIds.some((id,index)=>index!==session.activeSlot&&id===unit.id))reasons.push('別の素材枠で選択済み');
  return reasons;
}
function detail(unit,check){
  if(!unit)return '<div class="squad-empty">素材を選択すると詳細を表示します</div>';
  const content=session.detailTab==='skills'?`<div class="technique-list">${renderV39UnitSkills(unit,{expandedName:session.expandedSkillName})}</div>`
    :session.detailTab==='equipment'?renderV39UnitEquipment(unit)
    :session.detailTab==='growth'?renderV39UnitGrowth(unit):renderV39UnitAbility(unit);
  const allocation=session.detailSource==='result'&&check.growth?.ok?`<details><summary>合成Lvの計算</summary><p>最高Lv${check.growth.highestLevel} ＋ 残りLv${check.growth.sourceLevel-check.growth.highestLevel} × 20% ＝ ${check.growth.targetValue}</p><p>条件・獲得クラスは最低Lv1。残りは元のLv比率で配分。</p><p>端数EXP ${check.growth.baseProgress.exp.toFixed(1)}</p></details>`:'';
  const rewards=(session.detailSource==='result'||session.created)&&unit.fusionGrowth?.acquiredSkillNames?.length
    ? `<p data-fusion-acquired-skills>獲得スキル: ${unit.fusionGrowth.acquiredSkillNames.map(esc).join('、')}</p>` : '';
  return `<div class="squad-detail-header"><b>${esc(unit.name)}</b><span>Lv${unit.level}${unit.soulStored?' · 魂':''}</span></div>
    ${renderV39DetailTabs([['status','能力'],['skills','スキル'],['equipment','装備'],['growth','成長']],session.detailTab,'data-fusion-detail-tab')}
    <div class="squad-detail-tab-content"><div class="squad-detail-tab-panel" data-fusion-detail-scroll>${rewards}${content}${allocation}</div></div>`;
}
function render(){
  if(!session)return;
  const state=currentState();
  if(state.activePlayerId!==session.playerId||state.timeline.turnNumber!==session.turn||state.activeWorldId!==session.world){close();return;}
  let host=document.getElementById('v39-fusion-modal');
  if(!host){host=document.createElement('div');host.id='v39-fusion-modal';document.body.append(host);}
  const recipes=getV39FusionRecipes(state);
  if(!recipes.some(r=>r.id===session.recipeId)){session.recipeId=recipes[0]?.id;session.materialIds=[];}
  const check=inspectV39MonsterFusion(state,session),units=getV39FusionMaterials(check.faction),recipe=check.recipe;
  session.activeSlot=Math.min(session.activeSlot,Math.max(0,(check.slots?.length||1)-1));
  const required=check.slots?.[session.activeSlot],candidates=units.filter(u=>required&&matchV39FusionMaterialRequirement(u,required));
  if(!candidates.some(u=>u.id===session.candidateId))session.candidateId=session.materialIds[session.activeSlot]
    ||candidates.find(u=>!candidateReasons(state,check,u).length)?.id||candidates[0]?.id||'';
  const candidate=candidates.find(u=>u.id===session.candidateId),reasons=candidate?candidateReasons(state,check,candidate):['候補がありません'];
  const result=session.created||check.preview,detailUnit=session.created||(session.detailSource==='result'?check.preview:candidate);
  const detailKey=`${session.detailSource}:${detailUnit?.id}:${session.activeSlot}:${session.detailTab}`;
  const outline={name:recipe?.合成結果,race:recipe?.requirements?.[0]?.name,fusionGrowth:{recipeName:recipe?.合成結果},
    fusionAppearanceClass:recipe?.requirements?.find(row=>['エンジェル','デヴィル'].includes(row?.name))?.name};
  const preview=`<div class="fusion-preview fusion-result${session.animating?' animating':''}" data-fusion-preview>
    <span class="fusion-preview-label">${session.created?'合成完了':'合成後のユニット'}</span>
    ${session.animating?`<div class="fusion-converge">${session.materials.map(unit=>portrait(unit)).join('')}</div>`:''}${portrait(result||outline,!result)}
    <h3>${esc(result?.name||recipe?.合成結果||'レシピを選択')}</h3><b>${result?`Lv${result.level}`:'素材を選択してください'}</b>
    ${session.confirming?'<p class="fusion-confirm-warning">素材と素材の未使用EXPを消費します。元に戻せません。</p>':''}</div>`;
  const toolbar=`<div class="fusion-toolbar"><label><span>レシピ</span><select data-fusion-recipe aria-label="レシピ">${recipes.map(r=>`<option value="${r.id}"${r.id===session.recipeId?' selected':''}>${esc(r.合成結果)}${r.状態==='テスト専用'?'（テスト専用）':['候補','未定'].includes(r.状態)?`（${esc(r.状態)}・テスト限定）`:''}</option>`).join('')}</select></label>
    <label><span>方法</span><select data-fusion-mode aria-label="合成方法"><option value="skill"${session.mode==='skill'?' selected':''}>スキル</option><option value="facility"${session.mode==='facility'?' selected':''}>施設</option></select></label>
    ${session.mode==='skill'&&getV39FusionSkills(check.actor).length>1?`<label><span>スキル</span><select data-fusion-skill>${getV39FusionSkills(check.actor).map(row=>`<option value="${esc(row.名前)}"${check.skill?.名前===row.名前?' selected':''}>${esc(row.名前)}</option>`).join('')}</select></label>`:''}</div>`;
  const slotBar=`<div class="fusion-slots" role="tablist" aria-label="素材枠">${(check.slots||[]).map((name,index)=>`<button role="tab" aria-selected="${index===session.activeSlot}" data-fusion-slot="${index}">素材${index+1} ${esc(name)}${session.materialIds[index]?' ✓':''}</button>`).join('')}</div>`;
  const list=candidates.map(u=>{
    const blocked=candidateReasons(state,check,u);
    return `<div class="fusion-candidate${blocked.length?' unavailable':''}" data-fusion-row="${esc(u.id)}">${renderV39UnitCard(u,{attribute:'data-fusion-candidate',selected:u.id===session.candidateId,
      name:`${u.soulStored?'魂 · ':u.facilityStored?'格納 · ':''}${u.name}`,dead:u.soulStored,position:u.soulStored?'魂 / 合成専用':u.facilityStored?`${u.facilityStored.name} (${u.facilityStored.tileKey})`:undefined})}
      ${blocked.length?`<small>${esc(blocked[0])}</small>`:''}</div>`;
  }).join('')||'<div class="squad-empty">条件を満たす種族・クラスがありません</div>';
  const controls=session.created?`<button data-fusion-done>${session.animating?'演出をスキップ':'閉じる'}</button><button data-fusion-next>続けて合成</button>`
    :session.confirming?`<button data-fusion-back>戻る</button><button data-fusion-commit${check.available?'':' disabled'}>消費して合体する</button>`
    :`<button data-fusion-close>戻る</button><button data-fusion-choose${reasons.length?' disabled':''}>素材${session.activeSlot+1}に選ぶ</button><button data-fusion-confirm${check.available?'':' disabled'}>合体を確認</button>`;
  const status=session.created?'新しいユニットを作成しました。':session.message||
    (session.detailSource==='material'&&candidate&&reasons.length?reasons.join(' / '):check.warnings?.join(' / ')||check.reasons.join(' / ')||'合成内容を確認できます');
  updateV39RetainedMarkup(host,`<section role="dialog" aria-modal="true" aria-labelledby="fusion-title"><header><h3 id="fusion-title">モンスター合成</h3><span>${session.mode==='facility'?'施設 / AP消費なし':`AP${check.cost}`}</span><button data-fusion-close aria-label="閉じる">×</button></header>
    ${preview}<div class="fusion-workspace">${session.created?'':toolbar+slotBar}
    <div class="fusion-panes"><div class="fusion-material-pane"><div class="fusion-list-heading">${session.created?'消費した素材':`素材${session.activeSlot+1} · ${esc(required||'')}`}<small>${isV39FusionTerritoryScope(state,session.playerId,check.actor)?'自領全域':`周囲${resolveV39FusionMaterialRadius(check.actor)}マス`}</small></div>
      <div class="squad-member-list" data-fusion-candidates>${session.created?session.materials.map(u=>renderV39UnitCard(u,{attribute:'data-fusion-consumed',position:'消費済み'})).join(''):list}</div></div>
      <div class="squad-detail-pane"><div class="fusion-detail-source" role="tablist" aria-label="詳細の対象"><button data-fusion-source="material" aria-selected="${session.detailSource==='material'}"${session.created?' disabled':''}>選択素材</button><button data-fusion-source="result" aria-selected="${session.detailSource==='result'||!!session.created}">合成後</button></div>${detail(detailUnit,check)}</div></div></div>
    <footer><div class="fusion-status" role="status">${esc(status)}</div><div class="fusion-footer-buttons">${controls}</div></footer></section>`,{preserveInput:true,preserveDetails:()=>detailKey===session.lastDetailKey});
  if(detailKey!==session.lastDetailKey)host.querySelector('[data-fusion-detail-scroll]')?.scrollTo(0,0);
  session.lastDetailKey=detailKey;
}
export function openV39FusionModal(actorId,mode='skill'){
  if(session||window.isV39MapInputLocked?.())return false;
  const state=currentState();window.cancelV39SelectedUnitAttack?.('fusion-selected');window.cancelV39SelectedUnitMove?.();
  session={playerId:state.activePlayerId,actorId,mode,turn:state.timeline.turnNumber,world:state.activeWorldId,materialIds:[],activeSlot:0,candidateId:'',detailSource:'material',detailTab:'status',message:''};
  lock=window.beginV39MapInputLock?.('fusion-modal')??null;render();return true;
}
window.openV39FusionModal=openV39FusionModal;
document.addEventListener('click',event=>{
  const el=event.target instanceof Element?event.target:null,trigger=el?.closest('[data-v39-fusion-open]');
  if(trigger){openV39FusionModal(trigger.dataset.v39FusionOpen,trigger.dataset.fusionMode||'skill');return;}
  if(!session||!el?.closest('#v39-fusion-modal'))return;
  if(el.closest('[data-fusion-close]')){close();return;}
  if(el.closest('[data-fusion-next]')&&session.created){
    clearTimeout(timer);timer=null;
    Object.assign(session,{created:null,animating:false,busy:false,confirming:false,materials:[],materialIds:[],activeSlot:0,candidateId:'',detailSource:'material',expandedSkillName:'',message:'',lastDetailKey:null});
    render();return;
  }
  if(el.closest('[data-fusion-done]')){if(session.animating){clearTimeout(timer);session.animating=false;render();}else close();return;}
  const source=el.closest('[data-fusion-source]'),tab=el.closest('[data-fusion-detail-tab]');
  if(source){session.detailSource=source.dataset.fusionSource;render();return;}
  if(tab){session.detailTab=tab.dataset.fusionDetailTab;render();return;}
  const technique=el.closest('[data-v39-character-skill]');
  if(technique){session.expandedSkillName=session.expandedSkillName===technique.dataset.v39CharacterSkill?'':technique.dataset.v39CharacterSkill;render();return;}
  if(session.created||session.busy)return;
  const slot=el.closest('[data-fusion-slot]'),candidate=el.closest('[data-fusion-candidate]');
  if(slot){session.activeSlot=Number(slot.dataset.fusionSlot);session.candidateId=session.materialIds[session.activeSlot]||'';session.detailSource='material';session.confirming=false;session.message='';render();return;}
  if(candidate){session.candidateId=candidate.dataset.fusionCandidate;session.detailSource='material';render();return;}
  if(el.closest('[data-fusion-choose]')){
    const state=currentState(),check=inspectV39MonsterFusion(state,session),unit=getV39FusionMaterials(check.faction).find(u=>u.id===session.candidateId);
    if(unit&&matchV39FusionMaterialRequirement(unit,check.slots?.[session.activeSlot])&&!candidateReasons(state,check,unit).length){
      session.materialIds[session.activeSlot]=unit.id;session.message='';session.confirming=false;
      const next=(check.slots||[]).findIndex((_,i)=>!session.materialIds[i]);
      if(next>=0){session.activeSlot=next;session.candidateId='';}
    }
    render();return;
  }
  if(el.closest('[data-fusion-confirm]')){if(inspectV39MonsterFusion(currentState(),session).available){session.confirming=true;session.detailSource='result';render();}return;}
  if(el.closest('[data-fusion-back]')){session.confirming=false;render();return;}
  if(el.closest('[data-fusion-commit]')&&session.confirming){
    session.busy=true;
    const result=executeV39MonsterFusion(currentState(),session);
    if(!result.ok){session.busy=false;session.confirming=false;session.message=result.reason;render();return;}
    session.materials=getV39FusionMaterials(window.getV39ActiveFactionState()).filter(u=>session.materialIds.includes(u.id));
    session.created=result.created;session.animating=true;session.detailSource='result';
    window.setV39GameState({players:result.state.players},{reason:'monster-fusion-created'});
    window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();render();
    const current=session;timer=setTimeout(()=>{if(session===current){session.animating=false;render();}},defaults.animationMs);
  }
});
document.addEventListener('change',event=>{
  const el=event.target;if(!session||session.created||!(el instanceof HTMLSelectElement)||!el.closest('#v39-fusion-modal'))return;
  if(el.matches('[data-fusion-recipe]')){session.recipeId=el.value;session.materialIds=[];session.activeSlot=0;session.candidateId='';}
  if(el.matches('[data-fusion-skill]'))session.skillName=el.value;
  if(el.matches('[data-fusion-mode]')){session.mode=el.value;session.skillName='';}
  session.confirming=false;session.message='';render();
});
window.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
for(const name of ['v39:save-loaded','v39:field-generated'])window.addEventListener(name,close);
window.addEventListener('v39:game-state-changed',()=>{if(session)render();});
