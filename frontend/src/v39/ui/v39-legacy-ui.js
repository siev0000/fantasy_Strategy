import { showV39Feedback } from "./v39-feedback.js";
import { renderV39SpecialtyHeader } from "./v39-specialty-ui.js";
import { renderV39ResourceItemSprite } from "./v39-resource-item-icon.js";
import {renderV39ScreenIcon} from "./v39-screen-icons.js";
import {getSelectedSettlement} from "../../lib/settlement-state.js";
import {forecastV39ProductionWork,v39EnchantmentPoints,v39FacilityProductionProgress,v39ProductionPoints} from "../../lib/v39-production-work.js";
import {getV39ProductionUnitBonus} from "../../lib/v39-production-unit-support.js";
import {getV39EquipmentEnhancementDisplay} from "../../lib/v39-equipment-rules.js";

function applyViewportScale(){
  const vv=window.visualViewport;
  const w=Math.max(320,Math.floor(vv?.width||window.innerWidth||1280));
  const h=Math.max(480,Math.floor(vv?.height||window.innerHeight||720));

  // 390x844 smartphone = 1.0.
  // PC grows more strongly in font size, while touch targets grow more mildly.
  const widthScale=w/390;
  const heightScale=h/844;
  const compact=Math.min(widthScale,heightScale);

  let uiScale;
  let touchScale;

  if(w<700){
    uiScale=Math.max(.84,Math.min(1.05,compact));
    touchScale=Math.max(.92,Math.min(1.06,compact));
  }else if(w<1200){
    uiScale=Math.max(1.00,Math.min(1.18,w/980));
    touchScale=Math.max(1.00,Math.min(1.10,w/1050));
  }else{
    uiScale=Math.max(1.10,Math.min(1.42,w/1450));
    touchScale=Math.max(1.05,Math.min(1.25,w/1550));
  }

  const userFontScale=Number(document.documentElement.dataset.v39FontScale||1);
  // 基準文字サイズはCSSでPC15px・スマホ12px。設定倍率だけを掛ける。
  const fontScale=Math.max(.8,Math.min(1.4,Number.isFinite(userFontScale)?userFontScale:1));

  document.documentElement.style.setProperty("--ui-scale",uiScale.toFixed(3));
  document.documentElement.style.setProperty("--font-scale",fontScale.toFixed(3));
  document.documentElement.style.setProperty("--touch-scale",touchScale.toFixed(3));
  document.documentElement.style.setProperty("--viewport-w",w+"px");
  document.documentElement.style.setProperty("--viewport-h",h+"px");
}
applyViewportScale();
window.addEventListener("resize",applyViewportScale);
window.visualViewport?.addEventListener("resize",applyViewportScale);
function say(t){showV39Feedback(t)}
document.querySelectorAll("[data-char-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-char-tab]").forEach(x=>x.classList.toggle("active",x===b));document.getElementById("charCharacter").style.display=b.dataset.charTab==="character"?"grid":"none";document.getElementById("charSquad").style.display=b.dataset.charTab==="squad"?"grid":"none"});


document.addEventListener("pointerdown",e=>{
  const materialDrawer=document.getElementById("materialDrawer");
  if(!materialDrawer?.classList.contains("show")) return;
  const materialSummaryBtn=document.getElementById("materialSummaryBtn");
  if(materialDrawer.contains(e.target) || materialSummaryBtn?.contains(e.target)) return;
  materialDrawer.classList.remove("show");
});



let resourceMode="detail";
const resourceSet=document.getElementById("resourceSet");
const resourceDrawer=document.getElementById("resourceDrawer");
function currentResourceDetail(){return window.getV39ResourceSnapshot?.()||{}}
const productionButton=document.createElement("button");
productionButton.type="button";
productionButton.className="res-chip tappable resource-group-btn v39-production-chip";
productionButton.title="製作ポイント・作業一覧";
productionButton.innerHTML='<span class="ico" aria-hidden="true">⚒</span><b class="value-main"></b>';
productionButton.addEventListener("click",event=>{event.stopPropagation();openResourceGroup("production",productionButton);});

function productionContext(){
  const player=window.getV39ActivePlayer?.();
  const state=window.getV39EnemyTurnState?.();
  const village=getSelectedSettlement(player?.factionState);
  return village?.placed&&state?{player,state,village}:null;
}

function productionDetails(body,{player,state,village}){
  const turn=state.timeline?.turnNumber;
  const points=document.createElement("dl");
  points.className="v39-production-point-summary";
  for(const [label,field,value] of [
    ["製作","work",v39ProductionPoints(player,village,turn)],
    ["魔術","magic",v39EnchantmentPoints(player,village,"enchantMagicUsed",turn)],
    ["信仰","faith",v39EnchantmentPoints(player,village,"enchantFaithUsed",turn)]
  ]){
    const pair=document.createElement("div");
    const name=document.createElement("dt");
    name.textContent=label;
    const amount=document.createElement("dd");
    amount.textContent=`${fmtNum(value.remaining)}/${fmtNum(value.max)}`;
    pair.append(name,amount);
    const bonus=getV39ProductionUnitBonus(village,field,turn);
    if(bonus>0){
      const detail=document.createElement("small");
      detail.textContent=`ユニット +${fmtNum(bonus)}`;
      amount.append(detail);
    }
    points.append(pair);
  }
  const list=document.createElement("ul");
  list.className="v39-production-list";
  const jobs=[
    ...(village.constructionQueue||[]).map(job=>({...v39FacilityProductionProgress(job),label:job.facilityName})),
    ...(village.equipmentProductionQueue||[]).map(job=>({...job,label:`${getV39EquipmentEnhancementDisplay(job.item).name} ×${job.count}`}))
  ].sort((left,right)=>(left.workOrder||0)-(right.workOrder||0));
  const dates=jobs.length?forecastV39ProductionWork(player,village,state):new Map();
  for(const job of jobs){
    const row=document.createElement("li");
    const name=document.createElement("strong");
    name.textContent=job.label;
    const progress=document.createElement("small");
    progress.textContent=[
      `製作 ${job.workProgress||0}/${job.workRequired}`,
      job.magicRequired&&`魔術 ${job.magicProgress||0}/${job.magicRequired}`,
      job.faithRequired&&`信仰 ${job.faithProgress||0}/${job.faithRequired}`,
      dates.has(job.id)&&`完成予定 T${dates.get(job.id)}`
    ].filter(Boolean).join("　");
    row.append(name,progress);
    list.append(row);
  }
  for(const plan of (village.operationPlans||[]).filter(plan=>plan.kind==="construction")){
    const row=document.createElement("li");
    row.textContent=`${plan.facilityName}　${plan.reason||"建設フェーズで着手"}`;
    list.append(row);
  }
  const title=document.createElement("b");
  title.textContent=`${village.name||"拠点"}の製作`;
  body.replaceChildren(title,points);
  if(list.children.length)body.append(list);
  else {
    const empty=document.createElement("p");
    empty.textContent="作業予約はありません";
    body.append(empty);
  }
}


function fmtNum(v){return Number(v).toLocaleString("ja-JP")}
function signed(v){
  const value=Number(v)||0;
  // 表示だけを四捨五入する。負数も絶対値で丸め、-0は表示しない。
  const rounded=Math.round(Math.abs(value));
  const n=value<0?-rounded:rounded;
  return n===0?"0":(n>0?"+":"")+fmtNum(n);
}
function resourceIconMarkup(name,icon,color,className){
  const safeColor=/^#[0-9a-f]{3,8}$/i.test(String(color||"").trim())?String(color).trim():"";
  const style=safeColor?` style="color:${safeColor}"`:"";
  return `<span class="${className}"${style}>${renderV39ResourceItemSprite(name)||icon||""}</span>`;
}
function renderResourceTop(){
  const snapshot=currentResourceDetail();
  resourceSet.classList.toggle("mode-simple",resourceMode==="simple");
  const activeKeys=new Set(Object.keys(snapshot));
  for(const button of resourceSet.querySelectorAll('[data-group]'))if(button.dataset.group!=="special"&&!activeKeys.has(button.dataset.group))button.remove();
  let index=0;
  for(const [key,g] of Object.entries(snapshot)){
    if(key==="special")continue;
    let b=[...resourceSet.children].find(button=>button.dataset.group===key);
    if(!b){
      b=document.createElement("button");
      b.dataset.group=key;
      b.addEventListener("click",e=>{e.stopPropagation();openResourceGroup(key,b)});
    }
    b.className=`res-chip ${g.className} tappable resource-group-btn`;
    const markup=`${resourceIconMarkup(g.iconKey,g.icon,g.iconColor,"ico")}<span><span class="resource-label">${g.title}</span><b class="value-main"></b><small class="value-delta"></small></span>`;
    if(b.__v39ResourceMarkup!==markup){b.innerHTML=markup;b.__v39ResourceMarkup=markup;}
    const total=fmtNum((g.items||[]).reduce((sum,item)=>sum+item.value,0));
    const delta=signed((g.items||[]).reduce((sum,item)=>sum+item.delta,0));
    const value=b.querySelector('.value-main'),change=b.querySelector('.value-delta');
    if(value.textContent!==total)value.textContent=total;
    if(change.textContent!==delta)change.textContent=delta;
    b.title=`${g.title}の内訳を表示`;
    b.setAttribute("aria-label",g.title);
    if(resourceSet.children[index]!==b)resourceSet.insertBefore(b,resourceSet.children[index]||null);
    index++;
  }
  renderV39SpecialtyHeader(resourceSet,snapshot);
  const production=productionContext();
  if(!production){productionButton.remove();return;}
  const {player,state,village}=production;
  const {remaining,max}=v39ProductionPoints(player,village,state.timeline?.turnNumber);
  const points=`${remaining}/${max}`;
  const icon=renderV39ScreenIcon("製作ポイント");
  if(productionButton._productionIcon!==icon){
    productionButton.querySelector(".ico").innerHTML=icon;
    productionButton._productionIcon=icon;
  }
  const value=productionButton.querySelector(".value-main");
  if(value.textContent!==points)value.textContent=points;
  productionButton.setAttribute("aria-label",`製作ポイント ${points}。作業一覧を開く`);
  if(resourceSet.lastElementChild!==productionButton)resourceSet.append(productionButton);
  if(resourceDrawer.classList.contains("show")&&resourceDrawer.dataset.group==="production"){
    productionDetails(document.getElementById("resourceDrawerBody"),production);
  }
}

function openResourceGroup(key,anchor){

  const body=document.getElementById("resourceDrawerBody");
  if(key==="production"){
    const context=productionContext();
    if(!context)return;
    productionDetails(body,context);
  }else{
  const g=currentResourceDetail()[key];if(!g)return;
  body.innerHTML=
    `<div class="resource-subgrid">`+
      g.items.map(i=>`<div class="resource-sub ${i.rare?"rare":""}"><span>${resourceIconMarkup(i.name,i.icon,i.iconColor,"sub-ico")}<strong class="sub-label">${i.name}</strong></span><b>${fmtNum(i.value)}</b><small>${signed(i.delta)}</small></div>`).join("")+
    `</div>`;
  }

  resourceDrawer.dataset.group=key;
  resourceDrawer.classList.add("show");

  requestAnimationFrame(()=>{
    const playfield=document.querySelector(".playfield");
    const pr=playfield?.getBoundingClientRect();
    const ar=anchor?.getBoundingClientRect();
    const dr=resourceDrawer.getBoundingClientRect();
    if(!pr||!ar)return;

    let left=ar.left-pr.left;
    const rightLimit=pr.width-dr.width-6;
    left=Math.max(6,Math.min(left,rightLimit));

    resourceDrawer.style.left=`${Math.round(left)}px`;
    resourceDrawer.style.top="6px";
  });
}

document.getElementById("resourceModeToggle").addEventListener("click",()=>{
  resourceMode=resourceMode==="detail"?"simple":"detail";
  document.getElementById("resourceModeToggle").classList.toggle("simple",resourceMode==="simple");
  document.getElementById("resourceModeLabel").textContent=resourceMode==="detail"?"詳細":"簡易";
  resourceDrawer.classList.remove("show");
  renderResourceTop();
  say(resourceMode==="detail"?"資源表示：詳細":"資源表示：簡易4分類");
});
document.getElementById("resourceDrawerClose").addEventListener("click",e=>{e.stopPropagation();resourceDrawer.classList.remove("show")});
document.addEventListener("pointerdown",e=>{
  if(!resourceDrawer.classList.contains("show"))return;
  if(resourceDrawer.contains(e.target)||e.target.closest?.(".resource-group-btn"))return;
  resourceDrawer.classList.remove("show");
});
document.querySelectorAll(".research-rail-btn").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".research-rail-btn").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  document.getElementById("researchModal").classList.add("open");
  say("研究対象を「"+b.dataset.research+"」に変更（仮）");
}));
renderResourceTop();
window.renderV39ResourceTop=renderResourceTop;

document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.open+"Modal").classList.add("open"));document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest(".modal-backdrop").classList.remove("open"));

const iconBubble=document.getElementById("iconBubble");
function showIconBubble(text,el){
  if(!text||!el) return;
  const r=el.getBoundingClientRect();
  iconBubble.textContent=text;
  iconBubble.classList.add("show");
  let x=r.left+r.width/2;
  let y=r.top-8;
  iconBubble.style.left=`${Math.round(x)}px`;
  iconBubble.style.top=`${Math.round(y)}px`;
  clearTimeout(showIconBubble._t);
  showIconBubble._t=setTimeout(()=>iconBubble.classList.remove("show"),900);
}
document.querySelectorAll(".tappable[data-tip]").forEach(el=>{
  el.addEventListener("pointerdown",ev=>{
    showIconBubble(el.dataset.tip,el);
  });
});


const mobileFabMenu=document.getElementById("mobileFabMenu");
const mobileFabToggle=document.getElementById("mobileFabToggle");
const mobileFabPanel=document.getElementById("mobileFabPanel");

function closeFabMenu(){
  if(!mobileFabMenu)return;
  mobileFabMenu.classList.remove("open");
  if(mobileFabToggle){
    mobileFabToggle.setAttribute("aria-expanded","false");
    mobileFabToggle.textContent="☰";
  }
}
mobileFabToggle?.addEventListener("click",e=>{
  e.stopPropagation();
  const opened=mobileFabMenu.classList.toggle("open");
  mobileFabToggle.setAttribute("aria-expanded",opened?"true":"false");
  mobileFabToggle.textContent=opened?"×":"☰";
});
document.addEventListener("pointerdown",e=>{
  if(!mobileFabMenu) return;
  if(mobileFabMenu.contains(e.target)) return;
  closeFabMenu();
});

document.querySelectorAll("[data-open]").forEach(el=>{
  el.addEventListener("click",()=>closeFabMenu());
});

document.querySelectorAll("[data-toast]").forEach(b=>b.addEventListener("click",()=>say(b.dataset.toast)));
document.querySelectorAll(".tappable").forEach(b=>{b.addEventListener("pointerdown",ev=>{if(!b.dataset.tip)return;const t=document.getElementById("tip");t.textContent=b.dataset.tip;t.style.left=Math.min(innerWidth-230,Math.max(6,ev.clientX-40))+"px";t.style.top=Math.min(innerHeight-50,ev.clientY+12)+"px";t.classList.add("show");clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove("show"),1200)})});
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".modal-backdrop").forEach(m=>m.classList.remove("open"))});
