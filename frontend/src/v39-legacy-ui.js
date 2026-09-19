import { showV39Feedback } from "./v39-feedback.js";

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
  let fontScale;
  let touchScale;

  if(w<700){
    uiScale=Math.max(.84,Math.min(1.05,compact));
    fontScale=Math.max(.92,Math.min(1.08,compact));
    touchScale=Math.max(.92,Math.min(1.06,compact));
  }else if(w<1200){
    uiScale=Math.max(1.00,Math.min(1.18,w/980));
    fontScale=Math.max(1.08,Math.min(1.22,w/920));
    touchScale=Math.max(1.00,Math.min(1.10,w/1050));
  }else{
    uiScale=Math.max(1.10,Math.min(1.42,w/1450));
    fontScale=Math.max(1.18,Math.min(1.52,w/1250));
    touchScale=Math.max(1.05,Math.min(1.25,w/1550));
  }

  const userFontScale=Number(document.documentElement.dataset.v39FontScale||1);
  fontScale*=Math.max(.8,Math.min(1.4,Number.isFinite(userFontScale)?userFontScale:1));

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
document.querySelectorAll("[data-equip-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-equip-tab]").forEach(x=>x.classList.toggle("active",x===b));document.getElementById("equipDetail").style.display=b.dataset.equipTab==="detail"?"block":"none";document.getElementById("equipCraft").style.display=b.dataset.equipTab==="craft"?"block":"none";document.getElementById("equipEnchant").style.display=b.dataset.equipTab==="enchant"?"block":"none"});
document.querySelectorAll(".inv[data-item]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".inv").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.getElementById("equipName").textContent=b.dataset.item+" ["+b.dataset.rarity+"]"});


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
function currentSimpleResourceData(){return window.getV39SimpleResourceSnapshot?.()||[]}

function fmtNum(v){return Number(v).toLocaleString("ja-JP")}
function signed(v){const n=Number(v)||0;return n>0?"+"+n:String(n)}
function resourceIconMarkup(icon,color,className){
  const safeColor=/^#[0-9a-f]{3,8}$/i.test(String(color||"").trim())?String(color).trim():"";
  const style=safeColor?` style="color:${safeColor}"`:"";
  return `<span class="${className}"${style}>${icon||""}</span>`;
}
function detailGroupTotal(group){
  const g=currentResourceDetail()[group];
  return (g?.items||[]).reduce((s,i)=>s+i.value,0);
}
function detailGroupDelta(group){
  const g=currentResourceDetail()[group];
  return (g?.items||[]).reduce((s,i)=>s+i.delta,0);
}
function renderResourceTop(){
  resourceSet.innerHTML="";
  resourceSet.classList.toggle("mode-simple",resourceMode==="simple");
  if(resourceMode==="detail"){
    ["food","wood","ore","precious"].forEach(key=>{
      const g=currentResourceDetail()[key];
      if(!g)return;
      const b=document.createElement("button");
      b.className=`res-chip ${key==="food"?"food-group":key==="wood"?"wood-group":key==="ore"?"ore-group":"precious-group"} tappable resource-group-btn`;
      b.dataset.group=key;
      b.innerHTML=`${resourceIconMarkup(g.icon,g.iconColor,"ico")}<span><span class="resource-label">${g.title}</span><b class="value-main">${fmtNum(detailGroupTotal(key))}</b><small class="value-delta">${signed(detailGroupDelta(key))}</small></span>`;
      b.title=`${g.title}の内訳を表示`;
      b.addEventListener("click",e=>{e.stopPropagation();openResourceGroup(key,b)});
      resourceSet.appendChild(b);
    });
  }else{
    currentSimpleResourceData().forEach(g=>{
      const b=document.createElement("button");
      b.className=`res-chip ${g.cls} tappable`;
      b.innerHTML=`${resourceIconMarkup(g.icon,g.iconColor,"ico")}<span><span class="resource-label">${g.label}</span><b class="value-main">${fmtNum(g.value)}</b><small class="value-delta">${signed(g.delta)}</small></span>`;
      b.title=g.tip;
      b.addEventListener("click",()=>say(`${g.label}: ${fmtNum(g.value)}（簡易換算）`));
      resourceSet.appendChild(b);
    });
  }
}

function openResourceGroup(key,anchor){
  if(resourceMode!=="detail")return;
  const g=currentResourceDetail()[key];if(!g)return;

  const total=detailGroupTotal(key),delta=detailGroupDelta(key);

  const body=document.getElementById("resourceDrawerBody");
  body.innerHTML=
    `<div class="resource-subgrid">`+
      g.items.map(i=>`<div class="resource-sub ${i.rare?"rare":""}"><span>${resourceIconMarkup(i.icon,i.iconColor,"sub-ico")}<strong class="sub-label">${i.name}</strong></span><b>${fmtNum(i.value)}</b><small>${signed(i.delta)}</small></div>`).join("")+
    `</div>`;

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
  say(resourceMode==="detail"?"資源表示：詳細":"資源表示：簡易5分類");
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
