import { V39_CAVE_BALANCE } from "../../lib/v39-gameplay-balance.js";

let menu, targetId="", pressTimer=0, pressStart=null, blockedClick=null;
const cancelPress=()=>{clearTimeout(pressTimer);pressTimer=0;pressStart=null;};
const close=()=>{if(menu)menu.hidden=true;targetId="";};
const cardFrom=event=>event.target instanceof Element?event.target.closest("#squadMemberList [data-v39-unit-id]"):null;

function squadFor(id){
  if(window.getV39EnemyTurnState()?.activeWorldId==="surface")return null;
  return window.getV39ActiveFactionState()?.squads.find(squad=>squad.unitIds?.includes(id));
}

function open(card,x,y){
  const id=card.dataset.v39UnitId;
  if(window.isV39MapInputLocked?.()||!squadFor(id))return false;
  targetId=id;menu.hidden=false;syncV39CavePartyMenu();
  const rect=menu.getBoundingClientRect();
  menu.style.left=`${Math.max(0,Math.min(x,innerWidth-rect.width))}px`;
  menu.style.top=`${Math.max(0,Math.min(y,innerHeight-rect.height))}px`;
  menu.querySelector("button:not(:disabled)")?.focus({preventScroll:true});
  return true;
}

export function syncV39CavePartyMenu(){
  const list=document.getElementById("squadMemberList");if(!list)return;
  if(!menu){
    menu=document.createElement("div");menu.id="v39-cave-party-menu";menu.hidden=true;
    menu.setAttribute("role","group");menu.setAttribute("aria-label","隊列変更");
    menu.innerHTML='<button type="button" data-order="-1" aria-label="隊列を前へ">前へ</button><button type="button" data-order="1" aria-label="隊列を後ろへ">後ろへ</button>';
    const style=document.createElement("style");
    style.textContent='#v39-cave-party-menu{position:fixed;z-index:10300;display:grid;gap:4px;padding:5px;border:1px solid #73949c;border-radius:7px;background:#102027;box-shadow:0 5px 16px #0008}#v39-cave-party-menu[hidden]{display:none}#v39-cave-party-menu button{min-height:40px;padding:8px 20px;font-size:var(--font-body);color:#ecf4f1;background:#1c323a;border:1px solid #55727b;border-radius:5px}';
    document.head.appendChild(style);document.body.appendChild(menu);
    menu.addEventListener("click",event=>{
      const button=event.target.closest("[data-order]");if(!button||button.disabled)return;
      const id=targetId;close();window.reorderV39CaveParty(Number(button.dataset.order),id);
    });
    list.addEventListener("contextmenu",event=>{
      const card=cardFrom(event);if(!card)return;
      cancelPress();if(open(card,event.clientX,event.clientY))event.preventDefault();
    });
    list.addEventListener("pointerdown",event=>{
      cancelPress();const card=cardFrom(event);
      if(!card||event.button!==0||!squadFor(card.dataset.v39UnitId))return;
      pressStart={x:event.clientX,y:event.clientY};
      pressTimer=setTimeout(()=>{
        if(open(card,event.clientX,event.clientY))blockedClick={id:card.dataset.v39UnitId,until:Date.now()+1000};
        cancelPress();
      },V39_CAVE_BALANCE.partyOrderLongPressMs);
    });
    list.addEventListener("pointermove",event=>{
      if(pressStart&&Math.hypot(event.clientX-pressStart.x,event.clientY-pressStart.y)>V39_CAVE_BALANCE.partyOrderCancelDistance)cancelPress();
    });
    document.addEventListener("click",event=>{
      const card=cardFrom(event);
      if(blockedClick&&Date.now()<blockedClick.until&&card?.dataset.v39UnitId===blockedClick.id){event.preventDefault();event.stopImmediatePropagation();blockedClick=null;}
    },true);
    list.addEventListener("keydown",event=>{
      const card=cardFrom(event);if(!card)return;
      if(event.key==="ContextMenu"||(event.shiftKey&&event.key==="F10")){
        const rect=card.getBoundingClientRect();if(open(card,rect.left,rect.top))event.preventDefault();
      }
    });
    document.addEventListener("pointerup",cancelPress,true);
    document.addEventListener("pointercancel",cancelPress,true);
    document.addEventListener("scroll",()=>{cancelPress();close();},true);
    document.addEventListener("pointerdown",event=>{if(menu&&!menu.contains(event.target))close();},true);
    document.addEventListener("keydown",event=>{if(event.key==="Escape"){close();cancelPress();}});
    window.addEventListener("resize",close);
  }
  if(!targetId)return;
  const squad=squadFor(targetId),index=squad?.unitIds.indexOf(targetId)??-1;
  if(index<0||window.isV39MapInputLocked?.()){close();return;}
  [...menu.children].forEach(button=>{const next=index+Number(button.dataset.order);button.disabled=next<0||next>=squad.unitIds.length;});
}
