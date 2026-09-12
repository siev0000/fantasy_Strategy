const CATEGORY_META = {
  "鍛冶": { icon: "⚒", accent: "#d9b56b" },
  "魔法": { icon: "✦", accent: "#a980de" },
  "信仰": { icon: "✚", accent: "#e9de8b" },
  "軍事": { icon: "⚔", accent: "#cf705e" },
  "経済": { icon: "◆", accent: "#79c88f" },
  "学術": { icon: "▣", accent: "#78b9d8" }
};

function installStyles() {
  if (document.getElementById("v39-research-ui-style")) return;
  const style = document.createElement("style");
  style.id = "v39-research-ui-style";
  style.textContent = `
#researchModal{
  --research-accent:#cf705e;
  padding:max(8px,var(--safe-t,0px)) max(8px,var(--safe-r,0px)) max(8px,var(--safe-b,0px)) max(8px,var(--safe-l,0px));
  background:rgba(2,7,10,.82);
  backdrop-filter:blur(3px);
}
#researchModal .modal{
  width:min(920px,calc(100vw - 20px));
  height:min(690px,calc(100svh - 20px));
  border:1px solid #46575e;
  border-radius:10px;
  background:linear-gradient(180deg,#111c20 0,#0a1216 100%);
  box-shadow:0 18px 50px rgba(0,0,0,.62),inset 0 1px rgba(255,255,255,.025);
  grid-template-rows:48px minmax(0,1fr);
}
#researchModal .modal-head{
  min-height:48px;
  padding:7px 9px 7px 12px;
  border-bottom:1px solid #34444a;
  background:linear-gradient(180deg,#152126,#0d171b);
}
#researchModal .modal-head h2{
  display:flex;
  align-items:baseline;
  gap:9px;
  margin:0;
  font-size:15px;
  letter-spacing:.04em;
}
#researchModal .modal-head h2::before{
  content:"研";
  display:grid;
  place-items:center;
  width:27px;
  height:27px;
  border:1px solid #51636a;
  border-radius:7px;
  background:#1b2a2f;
  color:#dce8e7;
  font-size:12px;
}
#researchModal .research-head-sub{
  margin-left:1px;
  color:#829499;
  font-size:9px;
  font-weight:500;
  letter-spacing:0;
}
#researchModal .modal-head .close{
  width:32px;
  height:32px;
  margin-left:auto;
  padding:0;
  border:1px solid #46575d;
  border-radius:7px;
  background:#172429;
  color:#dce6e5;
  font-size:20px;
  line-height:1;
}
#researchModal .modal-body{
  display:grid;
  grid-template-columns:174px minmax(0,1fr);
  grid-template-rows:minmax(0,1fr);
  gap:0;
  min-height:0;
  padding:0;
  overflow:hidden;
}
#researchModal .research-category-list{
  display:flex;
  flex-direction:column;
  gap:5px;
  min-width:0;
  padding:8px;
  overflow:auto;
  border-right:1px solid #2f3f45;
  background:rgba(7,14,17,.64);
  scrollbar-width:none;
}
#researchModal .research-category-list::-webkit-scrollbar,
#researchModal .research-content::-webkit-scrollbar{display:none;width:0;height:0}
#researchModal .research-category-list::before{
  content:"研究系統";
  display:block;
  padding:2px 4px 5px;
  color:#788b90;
  font-size:9px;
  font-weight:700;
  letter-spacing:.08em;
}
#researchModal .research-category-list .research-rail-btn{
  --cat-accent:#72858b;
  position:relative;
  width:100%;
  min-width:0;
  height:auto;
  min-height:52px;
  margin:0;
  padding:7px 8px 7px 42px;
  display:block;
  border:1px solid #35464c;
  border-radius:7px;
  background:linear-gradient(180deg,#172328,#111b1f);
  color:#dbe5e4;
  text-align:left;
  box-shadow:none;
  overflow:hidden;
}
#researchModal .research-category-list .research-rail-btn::before{
  content:attr(data-research-icon);
  position:absolute;
  left:8px;
  top:50%;
  transform:translateY(-50%);
  display:grid;
  place-items:center;
  width:27px;
  height:27px;
  border:1px solid color-mix(in srgb,var(--cat-accent) 58%,#38484e);
  border-radius:50%;
  background:#0c1519;
  color:var(--cat-accent);
  font-size:14px;
}
#researchModal .research-category-list .research-rail-btn::after{display:none!important}
#researchModal .research-category-list .research-rail-btn span{
  display:block;
  color:#dce6e4;
  font-size:12px;
  font-weight:800;
  line-height:1.2;
}
#researchModal .research-category-list .research-rail-btn b{
  display:block;
  margin-top:3px;
  color:#829499;
  font-size:9px;
  font-weight:600;
  white-space:nowrap;
}
#researchModal .research-category-list .research-rail-btn:hover{
  border-color:#53656c;
  background:#1a282d;
}
#researchModal .research-category-list .research-rail-btn.active{
  border-color:var(--cat-accent);
  background:linear-gradient(90deg,color-mix(in srgb,var(--cat-accent) 15%,#172328),#152126 62%);
  box-shadow:inset 3px 0 var(--cat-accent),0 0 0 1px color-mix(in srgb,var(--cat-accent) 12%,transparent);
}
#researchModal .research-category-list .research-rail-btn.active span{color:#f1f5f2}
#researchModal .research-content{
  min-width:0;
  min-height:0;
  padding:10px;
  overflow:auto;
  scrollbar-width:none;
}
#researchModal .research-content-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  min-height:35px;
  margin:0 0 8px;
  padding:0 2px 7px;
  border-bottom:1px solid #29383e;
}
#researchModal .research-content-head h3{
  margin:0;
  color:#e4ecea;
  font-size:13px;
}
#researchModal .research-selected-chip{
  flex:0 0 auto;
  padding:3px 7px;
  border:1px solid color-mix(in srgb,var(--research-accent) 62%,#405158);
  border-radius:999px;
  background:color-mix(in srgb,var(--research-accent) 10%,#10191d);
  color:#cbd6d5;
  font-size:9px;
}
#researchModal .research-content .detail-pane{
  min-height:150px;
  margin:0!important;
  padding:12px;
  border:1px solid #324249;
  border-radius:8px;
  background:linear-gradient(180deg,rgba(23,34,39,.88),rgba(14,23,27,.92));
  overflow:auto;
}
#researchModal .research-content .detail-pane b{
  color:#e3ebe9;
  font-size:12px;
}
#researchModal .research-content .detail-pane p{
  max-width:560px;
  margin:7px 0 0;
  color:#93a4a8;
  font-size:10px;
  line-height:1.65;
}
#researchModal .research-empty-visual{
  display:grid;
  place-items:center;
  min-height:105px;
  margin-top:10px;
  border:1px dashed #2e4046;
  border-radius:7px;
  background:radial-gradient(circle at 50% 50%,rgba(92,126,133,.06),transparent 68%);
  color:#566b71;
  text-align:center;
  font-size:10px;
}
#researchModal .research-empty-visual strong{
  display:block;
  margin-bottom:4px;
  color:#70868b;
  font-size:22px;
  font-weight:500;
}
@media(max-width:700px){
  #researchModal{
    padding:max(4px,var(--safe-t,0px)) max(4px,var(--safe-r,0px)) max(4px,var(--safe-b,0px)) max(4px,var(--safe-l,0px));
  }
  #researchModal .modal{
    width:100%;
    height:100%;
    max-width:none;
    max-height:none;
    border-radius:7px;
    grid-template-rows:44px minmax(0,1fr);
  }
  #researchModal .modal-head{min-height:44px;padding:5px 7px 5px 9px}
  #researchModal .modal-head h2{font-size:14px;gap:7px}
  #researchModal .modal-head h2::before{width:25px;height:25px}
  #researchModal .modal-body{
    grid-template-columns:minmax(0,1fr);
    grid-template-rows:auto minmax(0,1fr);
  }
  #researchModal .research-category-list{
    flex-direction:row;
    gap:4px;
    padding:6px;
    overflow-x:auto;
    overflow-y:hidden;
    border-right:0;
    border-bottom:1px solid #2f3f45;
  }
  #researchModal .research-category-list::before{display:none}
  #researchModal .research-category-list .research-rail-btn{
    flex:0 0 112px;
    width:112px;
    min-height:44px;
    padding:6px 6px 6px 35px;
  }
  #researchModal .research-category-list .research-rail-btn::before{
    left:6px;
    width:23px;
    height:23px;
    font-size:12px;
  }
  #researchModal .research-category-list .research-rail-btn span{font-size:11px}
  #researchModal .research-category-list .research-rail-btn b{margin-top:2px;font-size:8px}
  #researchModal .research-content{padding:8px}
  #researchModal .research-content-head{min-height:31px;margin-bottom:6px;padding-bottom:5px}
  #researchModal .research-content .detail-pane{min-height:130px;padding:10px}
}
@media(max-width:430px){
  #researchModal .research-head-sub{display:none}
  #researchModal .research-category-list .research-rail-btn{flex-basis:102px;width:102px}
  #researchModal .research-content{padding:6px}
}
`;
  document.head.appendChild(style);
}

function normalizeResearchModal() {
  const backdrop = document.getElementById("researchModal");
  if (!(backdrop instanceof HTMLElement)) return false;
  const modal = backdrop.querySelector(":scope > .modal");
  const head = modal?.querySelector(":scope > .modal-head");
  const body = modal?.querySelector(":scope > .modal-body");
  if (!(modal instanceof HTMLElement) || !(head instanceof HTMLElement) || !(body instanceof HTMLElement)) return false;
  if (modal.dataset.researchUiReady === "1") return true;

  modal.dataset.researchUiReady = "1";
  modal.classList.add("research-modal-shell");

  const heading = head.querySelector("h2");
  if (heading instanceof HTMLElement && !heading.querySelector(".research-head-sub")) {
    const sub = document.createElement("span");
    sub.className = "research-head-sub";
    sub.textContent = "研究系統 / 研究項目";
    heading.appendChild(sub);
  }

  const oldGrid = body.querySelector(":scope > .detail-grid");
  const oldHeading = body.querySelector(":scope > h3");
  const detailPane = body.querySelector(":scope > .detail-pane");
  if (!(oldGrid instanceof HTMLElement) || !(detailPane instanceof HTMLElement)) return true;

  oldGrid.classList.add("research-category-list");
  oldGrid.classList.remove("detail-grid");

  const content = document.createElement("section");
  content.className = "research-content";

  const contentHead = document.createElement("div");
  contentHead.className = "research-content-head";
  const title = document.createElement("h3");
  title.textContent = oldHeading?.textContent?.trim() || "選択中の研究";
  const selectedChip = document.createElement("span");
  selectedChip.className = "research-selected-chip";
  selectedChip.textContent = "軍事";
  contentHead.append(title, selectedChip);

  const emptyVisual = document.createElement("div");
  emptyVisual.className = "research-empty-visual";
  emptyVisual.innerHTML = "<div><strong>◇</strong>研究項目・研究ツリー表示領域</div>";

  oldHeading?.remove();
  content.append(contentHead, detailPane, emptyVisual);
  body.appendChild(content);

  const buttons = [...oldGrid.querySelectorAll(".research-rail-btn")];
  for (const button of buttons) {
    const key = String(button.dataset.research || button.querySelector("span")?.textContent || "").trim();
    const meta = CATEGORY_META[key] || { icon: "◇", accent: "#72858b" };
    button.dataset.researchIcon = meta.icon;
    button.style.setProperty("--cat-accent", meta.accent);
  }

  const updateSelected = button => {
    const key = String(button?.dataset?.research || "研究").trim();
    const meta = CATEGORY_META[key] || { accent: "#72858b" };
    selectedChip.textContent = key;
    backdrop.style.setProperty("--research-accent", meta.accent);
  };

  oldGrid.addEventListener("click", event => {
    const button = event.target.closest?.(".research-rail-btn");
    if (button) updateSelected(button);
  });

  const initial = oldGrid.querySelector(".research-rail-btn.active") || oldGrid.querySelector(".research-rail-btn");
  updateSelected(initial);
  return true;
}

function boot() {
  installStyles();
  if (normalizeResearchModal()) return;
  const observer = new MutationObserver(() => {
    if (normalizeResearchModal()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

boot();
