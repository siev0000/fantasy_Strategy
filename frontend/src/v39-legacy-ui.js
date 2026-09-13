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
const NS="http://www.w3.org/2000/svg",svg=document.getElementById("map");
const cols=17,rows=12,R=38,hexW=Math.sqrt(3)*R,hexH=2*R;
const centers=new Map(),hexEls=new Map();
function ckey(x,y){return x+","+y}
function center(x,y){return {x:60+x*hexW+(y%2?hexW/2:0),y:55+y*(R*1.5)}}
function pts(cx,cy){return Array.from({length:6},(_,i)=>{const a=(Math.PI/180)*(60*i-30);return [cx+R*Math.cos(a),cy+R*Math.sin(a)]})}
function terrain(x,y){
  if(y<2&&x>11)return"海"; if((x+y)%11===0)return"森"; if((x*3+y)%17===0)return"山岳"; if((x+y*2)%13===0)return"丘陵"; return"平地"
}
const fill={平地:"#35472e",森:"#1d3a2a",山岳:"#4b4d4d",丘陵:"#5b5038",海:"#164660"};
for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
 const c=center(x,y);centers.set(ckey(x,y),c);
 const p=document.createElementNS(NS,"polygon");p.setAttribute("points",pts(c.x,c.y).map(v=>v.join(",")).join(" "));
 p.setAttribute("fill",fill[terrain(x,y)]);p.dataset.x=x;p.dataset.y=y;p.dataset.terrain=terrain(x,y);p.classList.add("hex");
 p.addEventListener("click",()=>tileClick(x,y,p));svg.appendChild(p);hexEls.set(ckey(x,y),p);
}
function neigh(x,y){
 const o=y%2===1;return [[x+1,y],[x-1,y],[x+(o?1:0),y-1],[x+(o?0:-1),y-1],[x+(o?1:0),y+1],[x+(o?0:-1),y+1]].filter(([a,b])=>a>=0&&b>=0&&a<cols&&b<rows)
}
function cube(x,y){const q=x-(y-(y&1))/2,r=y;return[q,-q-r,r]}
function dist(a,b){const A=cube(a.x,a.y),B=cube(b.x,b.y);return Math.max(...A.map((v,i)=>Math.abs(v-B[i])))}
const owned=new Set(["8,5","9,5","10,5","7,6","8,6","9,6","10,6","11,6","8,7","9,7","10,7","9,8"]);
function addLine(a,b,cls){
 const l=document.createElementNS(NS,"line");l.setAttribute("x1",a[0]);l.setAttribute("y1",a[1]);l.setAttribute("x2",b[0]);l.setAttribute("y2",b[1]);l.setAttribute("class",cls);svg.appendChild(l)
}
for(const k of owned){
 const [x,y]=k.split(",").map(Number),c=centers.get(k),v=pts(c.x,c.y),o=y%2===1;
 const defs=[[[x+1,y],[0,1]],[[x-1,y],[3,4]],[[x+(o?1:0),y-1],[5,0]],[[x+(o?0:-1),y-1],[4,5]],[[x+(o?1:0),y+1],[1,2]],[[x+(o?0:-1),y+1],[2,3]]];
 defs.forEach(([n,e])=>{if(!owned.has(ckey(n[0],n[1])))addLine(v[e[0]],v[e[1]],"territory-edge")})
}
// scout boundary hint
const sc=document.createElementNS(NS,"circle");sc.setAttribute("cx",centers.get("9,6").x);sc.setAttribute("cy",centers.get("9,6").y);sc.setAttribute("r",165);sc.setAttribute("class","scout-edge");svg.appendChild(sc);

const units=[
 {id:"u1",name:"レオン",x:9,y:6,glyph:"剣",hp:148,max:168,ap:100,move:6,side:"own"},
 {id:"u2",name:"ミレイユ",x:9,y:6,glyph:"杖",hp:122,max:122,ap:82,move:5,side:"own"},
 {id:"e1",name:"ゴブリン隊",x:10,y:6,glyph:"敵",hp:96,max:120,side:"enemy"},
 {id:"e2",name:"オーガ",x:12,y:7,glyph:"鬼",hp:185,max:185,side:"enemy"}
];
function drawUnit(u){
 const c=centers.get(ckey(u.x,u.y));if(!c)return;
 const g=document.createElementNS(NS,"g");g.classList.add(u.side==="enemy"?"enemy-marker":"unit-marker");g.dataset.id=u.id;
 const rect=document.createElementNS(NS,"rect");rect.setAttribute("x",c.x-27);rect.setAttribute("y",c.y-31);rect.setAttribute("width",54);rect.setAttribute("height",58);rect.setAttribute("rx",9);rect.setAttribute("class",u.side==="enemy"?"enemy-card-bg":"unit-card-bg");
 const name=document.createElementNS(NS,"text");name.setAttribute("x",c.x);name.setAttribute("y",c.y-38);name.setAttribute("class","marker-name");name.textContent=u.name;
 const glyph=document.createElementNS(NS,"text");glyph.setAttribute("x",c.x);glyph.setAttribute("y",c.y+8);glyph.setAttribute("class","marker-glyph");glyph.textContent=u.glyph;
 const hb=document.createElementNS(NS,"rect");hb.setAttribute("x",c.x-25);hb.setAttribute("y",c.y+30);hb.setAttribute("width",50);hb.setAttribute("height",6);hb.setAttribute("rx",3);hb.setAttribute("class","marker-hp-bg");
 const hf=document.createElementNS(NS,"rect");hf.setAttribute("x",c.x-24);hf.setAttribute("y",c.y+31);hf.setAttribute("width",48*(u.hp/u.max));hf.setAttribute("height",4);hf.setAttribute("rx",2);hf.setAttribute("class",u.side==="enemy"?"marker-hp-enemy":"marker-hp-own");
 g.append(rect,name,glyph,hb,hf);g.addEventListener("click",ev=>{ev.stopPropagation();selectMapUnit(u)});svg.appendChild(g);u.g=g;u.hpEl=hf
}
units.forEach(drawUnit);
let selectedUnit=units[0],selectedHex=hexEls.get("9,6"),mode="normal",movePlan=null,selectedSkill={name:"斬撃",ap:40,range:1,pattern:"single"},targetPreview=null;
selectedHex.classList.add("selected");
function setBanner(t){const e=document.getElementById("modeBanner");e.textContent=t||"";e.classList.toggle("show",!!t)}
function say(t){const e=document.getElementById("toast");e.textContent=t;e.classList.add("show");clearTimeout(say.t);say.t=setTimeout(()=>e.classList.remove("show"),1400)}
function clearMarks(){hexEls.forEach(e=>e.classList.remove("reachable","range","pattern"));const old=svg.querySelector(".path-line");if(old)old.remove()}
function updateUnitPosition(u){
 const c=centers.get(ckey(u.x,u.y));if(!c)return;const nodes=u.g.children;
 nodes[0].setAttribute("x",c.x-27);nodes[0].setAttribute("y",c.y-31);nodes[1].setAttribute("x",c.x);nodes[1].setAttribute("y",c.y-38);nodes[2].setAttribute("x",c.x);nodes[2].setAttribute("y",c.y+8);nodes[3].setAttribute("x",c.x-25);nodes[3].setAttribute("y",c.y+30);nodes[4].setAttribute("x",c.x-24);nodes[4].setAttribute("y",c.y+31)
}
function selectMapUnit(u){if(u.side==="enemy"){say(u.name+" / HP "+u.hp+"/"+u.max);return}selectedUnit=u;updateFooterUnit();say(u.name+" を選択")}
function updateFooterUnit(){
  const panelAp=document.getElementById("panelAp");
  const skillApHead=document.getElementById("skillApHead");
  if(panelAp)panelAp.style.width=selectedUnit.ap+"%";
  if(skillApHead)skillApHead.textContent="AP "+selectedUnit.ap+" / 100";
}
function movementCost(a,b){const ta=terrain(a.x,a.y),tb=terrain(b.x,b.y);const h=t=>t==="山岳"?2:t==="丘陵"?1:0;return 1+(h(ta)!==h(tb)?1:0)}
function buildReachable(u){
 const D=new Map([[ckey(u.x,u.y),0]]),P=new Map(),q=[{x:u.x,y:u.y,c:0}];
 while(q.length){q.sort((a,b)=>a.c-b.c);const cur=q.shift();if(cur.c!==D.get(ckey(cur.x,cur.y)))continue;
  for(const [nx,ny] of neigh(cur.x,cur.y)){if(terrain(nx,ny)==="海")continue;const nc=cur.c+movementCost(cur,{x:nx,y:ny});if(nc>u.move)continue;const k=ckey(nx,ny);if(!D.has(k)||nc<D.get(k)){D.set(k,nc);P.set(k,ckey(cur.x,cur.y));q.push({x:nx,y:ny,c:nc})}}
 }return{D,P}
}
function startMove(){mode="move";clearMarks();movePlan=buildReachable(selectedUnit);for(const k of movePlan.D.keys())if(k!==ckey(selectedUnit.x,selectedUnit.y))hexEls.get(k)?.classList.add("reachable");setBanner("移動先を選択：移動コスト内の青枠ヘックス")}
function pathTo(k){let cur=k,a=[];while(cur){const[x,y]=cur.split(",").map(Number);a.unshift({x,y});if(cur===ckey(selectedUnit.x,selectedUnit.y))break;cur=movePlan.P.get(cur)}return a}
function previewMove(x,y){
 const k=ckey(x,y);if(!movePlan.D.has(k)||k===ckey(selectedUnit.x,selectedUnit.y))return;
 const path=pathTo(k),poly=document.createElementNS(NS,"polyline");poly.setAttribute("points",path.map(n=>{const c=centers.get(ckey(n.x,n.y));return c.x+","+c.y}).join(" "));poly.setAttribute("class","path-line");svg.appendChild(poly);
 movePlan.target={x,y,cost:movePlan.D.get(k),path};document.getElementById("moveText").textContent="距離 "+(path.length-1)+" / 消費 "+movePlan.target.cost+" / 残 "+Math.max(0,selectedUnit.move-movePlan.target.cost);document.getElementById("moveConfirm").classList.add("show")
}
function cancelModes(){mode="normal";movePlan=null;targetPreview=null;clearMarks();setBanner("");document.getElementById("moveConfirm").classList.remove("show")}
function startAttackTargeting(){
 if(selectedUnit.ap<selectedSkill.ap){say("APが不足しています");return}
 mode="attack";clearMarks();for(const [k,c] of centers){const[x,y]=k.split(",").map(Number);if(dist(selectedUnit,{x,y})<=selectedSkill.range)hexEls.get(k)?.classList.add("range")}
 setBanner(selectedSkill.name+"：射程"+selectedSkill.range+" / "+selectedSkill.pattern+"　対象マスを選択")
}
function patternTiles(tx,ty){
 const out=[[tx,ty]];if(selectedSkill.pattern==="circle"){for(const[nx,ny]of neigh(tx,ty))out.push([nx,ny])}
 if(selectedSkill.pattern==="fan"){for(const[nx,ny]of neigh(selectedUnit.x,selectedUnit.y))if(dist({x:nx,y:ny},{x:tx,y:ty})<=1)out.push([nx,ny])}
 if(selectedSkill.pattern==="line"){const dx=Math.sign(tx-selectedUnit.x),dy=Math.sign(ty-selectedUnit.y);for(let i=1;i<=selectedSkill.range;i++){const x=selectedUnit.x+dx*i,y=selectedUnit.y+dy*i;if(hexEls.has(ckey(x,y)))out.push([x,y])}}
 return [...new Map(out.map(v=>[ckey(...v),v])).values()]
}
function previewAttack(x,y){
 if(dist(selectedUnit,{x,y})>selectedSkill.range){say("射程外です");return}
 hexEls.forEach(e=>e.classList.remove("pattern"));const tiles=patternTiles(x,y);tiles.forEach(([a,b])=>hexEls.get(ckey(a,b))?.classList.add("pattern"));
 const key=ckey(x,y);if(targetPreview===key){executeAttack(tiles)}else{targetPreview=key;setBanner(selectedSkill.name+"：赤枠が攻撃範囲 / 同じマスをもう一度タップで実行")}
}
function executeAttack(tiles){
 selectedUnit.ap-=selectedSkill.ap;updateFooterUnit();let hits=0;
 for(const u of units.filter(u=>u.side==="enemy"&&u.hp>0)){if(tiles.some(([x,y])=>x===u.x&&y===u.y)){const dmg=selectedSkill.name==="火球"?48:32;u.hp=Math.max(0,u.hp-dmg);u.hpEl.setAttribute("width",48*(u.hp/u.max));hits++;say(selectedSkill.name+"："+u.name+" に "+dmg+" ダメージ")}}
 if(!hits)say(selectedSkill.name+" を使用（敵命中なし）");cancelModes()
}
function tileClick(x,y,el){
 if(mode==="move"){previewMove(x,y);return}if(mode==="attack"){previewAttack(x,y);return}
 selectedHex?.classList.remove("selected");selectedHex=el;el.classList.add("selected");document.getElementById("landTerrain").textContent=terrain(x,y);document.getElementById("landOwner").textContent=owned.has(ckey(x,y))?"自領":"未支配";const here=units.filter(u=>u.x===x&&u.y===y);document.getElementById("landUnits").textContent=here.filter(u=>u.side==="own").map(u=>u.name).join(", ")||"なし";document.getElementById("landEnemies").textContent=here.filter(u=>u.side==="enemy").map(u=>u.name).join(", ")||"なし"
}


const OPERATION_UI_DATA=window.V39_OPERATION_UI_DATA;
if(!OPERATION_UI_DATA)throw new Error("operation UI data is not initialized");
const mobileSkillNames=Object.fromEntries(OPERATION_UI_DATA.actionSkills.map(skill=>[skill.key,skill.name]));
document.querySelectorAll("[data-mobile-skill]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll("[data-mobile-skill]").forEach(x=>x.classList.toggle("active",x===btn));
    const skill=OPERATION_UI_DATA.actionSkills.find(row=>row.key===btn.dataset.mobileSkill);
    if(!skill)return;
    selectedSkill={name:skill.name,ap:skill.ap,range:skill.range,pattern:skill.pattern};
    const label=document.getElementById("mobileSelectedSkill");
    if(label)label.textContent=mobileSkillNames[skill.key];
  });
});
document.getElementById("mobileBattleMove")?.addEventListener("click",()=>startMove());
document.getElementById("mobileSkillUse")?.addEventListener("click",()=>{
  const active=document.querySelector("[data-mobile-skill].active");
  const skill=OPERATION_UI_DATA.actionSkills.find(row=>row.key===active?.dataset.mobileSkill);
  if(skill)selectedSkill={name:skill.name,ap:skill.ap,range:skill.range,pattern:skill.pattern};
  startAttackTargeting();
  toastMsg("マップ上で攻撃対象を選択");
});

document.getElementById("moveCancel")?.addEventListener("click",cancelModes);document.getElementById("moveOk")?.addEventListener("click",()=>{if(!movePlan?.target)return;selectedUnit.x=movePlan.target.x;selectedUnit.y=movePlan.target.y;selectedUnit.move=Math.max(0,selectedUnit.move-movePlan.target.cost);updateUnitPosition(selectedUnit);say(selectedUnit.name+" 移動完了 / 残"+selectedUnit.move);cancelModes()});

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



const RESOURCE_DETAIL={
  food:{
    title:"食料",icon:"🌾",
    items:[
      {name:"穀物",icon:"🌾",value:420,delta:16},
      {name:"野菜",icon:"🥬",value:260,delta:9},
      {name:"肉",icon:"🍖",value:220,delta:7},
      {name:"魚",icon:"🐟",value:180,delta:6},
      {name:"死体",icon:"☠",value:80,delta:2,rare:true},
      {name:"魂",icon:"◉",value:120,delta:2,rare:true}
    ]
  },
  wood:{
    title:"木材",icon:"🪵",
    items:[
      {name:"木材",icon:"🪵",value:920,delta:18},
      {name:"黒木",icon:"🌑",value:185,delta:3},
      {name:"特木",icon:"🌿",value:48,delta:1,rare:true}
    ]
  },
  ore:{
    title:"鉱石",icon:"⛏",
    items:[
      {name:"石材",icon:"🪨",value:410,delta:5},
      {name:"鉄",icon:"⚙",value:265,delta:4},
      {name:"銀鉄",icon:"◈",value:92,delta:0,rare:true},
      {name:"青金鋼",icon:"🔷",value:34,delta:0,rare:true},
      {name:"赤黒鋼",icon:"🔻",value:21,delta:0,rare:true}
    ]
  },
  precious:{
    title:"貴金属",icon:"💎",
    items:[
      {name:"金",icon:"🟡",value:38,delta:0,rare:true},
      {name:"銀",icon:"⚪",value:39,delta:0},
      {name:"宝石",icon:"💎",value:18,delta:0,rare:true}
    ]
  }
};
const SIMPLE_RESOURCE_DATA=[
  {key:"foodSimple",label:"食料",icon:"🌾",value:1080,delta:38,cls:"food-group",tip:"穀物+野菜+肉+魚"},
  {key:"woodSimple",label:"木材",icon:"🪵",value:1482,delta:28,cls:"wood-group",tip:"木材+黒木×2+特木×4"},
  {key:"ironSimple",label:"鉄",icon:"⚙",value:669,delta:12,cls:"ore-group",tip:"鉄+銀鉄×2+青金鋼×4+赤黒鋼×4"},
  {key:"goldSimple",label:"金",icon:"🟡",value:151,delta:0,cls:"precious-group",tip:"金×2+銀+宝石×2"},
  {key:"soulSimple",label:"魂",icon:"◉",value:320,delta:6,cls:"soul-group",tip:"死体+魂×2"}
];
let resourceMode="detail";
const resourceSet=document.getElementById("resourceSet");
const resourceDrawer=document.getElementById("resourceDrawer");

function fmtNum(v){return Number(v).toLocaleString("ja-JP")}
function signed(v){const n=Number(v)||0;return n>0?"+"+n:String(n)}
function detailGroupTotal(group){
  const g=RESOURCE_DETAIL[group];
  return g.items.reduce((s,i)=>s+i.value,0);
}
function detailGroupDelta(group){
  const g=RESOURCE_DETAIL[group];
  return g.items.reduce((s,i)=>s+i.delta,0);
}
function renderResourceTop(){
  resourceSet.innerHTML="";
  resourceSet.classList.toggle("mode-simple",resourceMode==="simple");
  if(resourceMode==="detail"){
    ["food","wood","ore","precious"].forEach(key=>{
      const g=RESOURCE_DETAIL[key];
      const b=document.createElement("button");
      b.className=`res-chip ${key==="food"?"food-group":key==="wood"?"wood-group":key==="ore"?"ore-group":"precious-group"} tappable resource-group-btn`;
      b.dataset.group=key;
      b.innerHTML=`<span class="ico">${g.icon}</span><span><span class="resource-label">${g.title}</span><b class="value-main">${fmtNum(detailGroupTotal(key))}</b><small class="value-delta">${signed(detailGroupDelta(key))}</small></span>`;
      b.title=`${g.title}の内訳を表示`;
      b.addEventListener("click",e=>{e.stopPropagation();openResourceGroup(key,b)});
      resourceSet.appendChild(b);
    });
  }else{
    SIMPLE_RESOURCE_DATA.forEach(g=>{
      const b=document.createElement("button");
      b.className=`res-chip ${g.cls} tappable`;
      b.innerHTML=`<span class="ico">${g.icon}</span><span><span class="resource-label">${g.label}</span><b class="value-main">${fmtNum(g.value)}</b><small class="value-delta">${signed(g.delta)}</small></span>`;
      b.title=g.tip;
      b.addEventListener("click",()=>say(`${g.label}: ${fmtNum(g.value)}（簡易換算）`));
      resourceSet.appendChild(b);
    });
  }
}

function openResourceGroup(key,anchor){
  if(resourceMode!=="detail")return;
  const g=RESOURCE_DETAIL[key];if(!g)return;

  const total=detailGroupTotal(key),delta=detailGroupDelta(key);

  const body=document.getElementById("resourceDrawerBody");
  body.innerHTML=
    `<div class="resource-subgrid">`+
      g.items.map(i=>`<div class="resource-sub ${i.rare?"rare":""}"><span><span class="sub-ico">${i.icon}</span><strong class="sub-label">${i.name}</strong></span><b>${fmtNum(i.value)}</b><small>${signed(i.delta)}</small></div>`).join("")+
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
document.addEventListener("keydown",e=>{if(e.key==="Escape"){document.querySelectorAll(".modal-backdrop").forEach(m=>m.classList.remove("open"));cancelModes()}});
updateFooterUnit();
