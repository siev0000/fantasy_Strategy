// 通常の下部UIを壊さず、会話中だけ専用画面を重ねる共通表示。
let hiddenPanels=[];
let returnFocus=null;
let onClose=null;

export function closeV39Conversation(){
  const panel=document.getElementById("v39-conversation-panel");
  panel?.remove();
  for(const [node,inert] of hiddenPanels)node.inert=inert;
  hiddenPanels=[];
  document.querySelector(".footer-body")?.removeAttribute("data-v39-conversation");
  const callback=onClose;onClose=null;callback?.();
  const focus=returnFocus?.isConnected?returnFocus:document.getElementById(returnFocus?.id);
  focus?.focus({preventScroll:true});
  returnFocus=null;
}

export function showV39Conversation({name,portrait,dialogue,content,close,viewKey}){
  const host=document.querySelector(".footer-body");if(!host)return;
  const old=document.getElementById("v39-conversation-panel");
  const scrolls=old?.dataset.viewKey===viewKey?Array.from(old.querySelectorAll("[data-conversation-scroll]")).map(node=>node.scrollTop):[];
  const focusKey=old?.contains(document.activeElement)?document.activeElement.dataset.conversationFocus:null;
  if(!old){
    returnFocus=document.activeElement;
    hiddenPanels=Array.from(host.children).map(node=>[node,node.inert]);
    for(const [node] of hiddenPanels)node.inert=true;
  }
  old?.remove();onClose=close;
  host.setAttribute("data-v39-conversation","");
  const panel=document.createElement("div");panel.id="v39-conversation-panel";panel.setAttribute("role","region");
  panel.dataset.viewKey=viewKey;
  panel.setAttribute("aria-label",`${name}との会話`);
  const head=document.createElement("header"),title=document.createElement("b"),exit=document.createElement("button");
  title.textContent=name;exit.textContent="会話を閉じる";exit.type="button";exit.dataset.conversationFocus="close";
  exit.addEventListener("click",closeV39Conversation);head.append(title,exit);
  const body=document.createElement("div");body.className="v39-conversation-body";
  const left=document.createElement("div");left.className="v39-conversation-speaker";left.dataset.conversationScroll="";
  if(portrait){
    const picture=document.createElement("div");picture.className="v39-conversation-portrait";picture.role="img";picture.setAttribute("aria-label",name);
    picture.style.backgroundImage=`url("${portrait.src}")`;
    const frame=portrait.sheetFrame;
    if(frame){picture.style.backgroundSize=`${frame.columns*100}% ${frame.rows*100}%`;picture.style.backgroundPosition=`${frame.column/(frame.columns-1)*100}% ${frame.row/(frame.rows-1)*100}%`;}
    left.append(picture);
  }
  const text=document.createElement("p");text.textContent=dialogue;left.append(text);
  const right=document.createElement("div");right.className="v39-conversation-content";right.dataset.conversationScroll="";right.append(content);
  body.append(left,right);panel.append(head,body);host.append(panel);
  Array.from(panel.querySelectorAll("[data-conversation-scroll]")).forEach((node,index)=>node.scrollTop=scrolls[index]||0);
  if(focusKey)Array.from(panel.querySelectorAll("[data-conversation-focus]")).find(node=>node.dataset.conversationFocus===focusKey)?.focus({preventScroll:true});
}

document.addEventListener("keydown",event=>{if(event.key==="Escape"&&document.getElementById("v39-conversation-panel")){event.preventDefault();closeV39Conversation();}});
document.addEventListener("click",event=>{if(event.target.closest(".footer-tab"))closeV39Conversation();},true);

const style=document.createElement("style");
style.textContent=`.footer-body[data-v39-conversation]{position:relative}.footer-body[data-v39-conversation]>:not(#v39-conversation-panel){visibility:hidden!important;pointer-events:none!important}#v39-conversation-panel{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;background:#102025;color:#e3eeee;font-size:var(--font-body);overflow:hidden;padding:8px;box-sizing:border-box}#v39-conversation-panel header{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0;padding-bottom:8px;border-bottom:1px solid #486267}#v39-conversation-panel button{font:inherit;color:inherit;background:#20383f;border:1px solid #64838a;border-radius:6px;padding:8px;white-space:normal;overflow-wrap:anywhere;text-align:left}#v39-conversation-panel button:disabled{opacity:.4}#v39-conversation-panel button.active{border-color:#f1ca69;background:#3b3826}.v39-conversation-body{display:grid;grid-template-columns:minmax(0,35fr) minmax(0,65fr);gap:12px;flex:1;min-height:0;padding-top:10px}.v39-conversation-speaker,.v39-conversation-content{min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain}.v39-conversation-speaker{padding-right:8px;border-right:1px solid #486267}.v39-conversation-speaker p{line-height:1.65;overflow-wrap:anywhere;white-space:pre-wrap}.v39-conversation-portrait{width:min(100%,160px);aspect-ratio:1;margin:auto;background-repeat:no-repeat;background-size:contain;background-position:center}#v39-cave-event-panel{display:flex;flex-direction:column;gap:8px;min-width:0}#v39-cave-event-panel nav{display:flex;flex-wrap:wrap;gap:6px}#v39-cave-event-panel .v39-cave-event-row{width:100%}#v39-cave-event-panel .v39-cave-event-detail{padding:10px;background:#182e34;border:1px solid #486267;border-radius:6px;line-height:1.6;overflow-wrap:anywhere}#v39-cave-event-panel .v39-cave-event-detail p{margin:4px 0 10px}`;
document.head.appendChild(style);
