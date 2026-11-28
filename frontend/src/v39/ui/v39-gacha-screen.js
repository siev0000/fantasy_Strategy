import {drawV39GachaUnits,V39_GACHA_DRAW_COUNT,V39_GACHA_UNIT_LEVEL} from "../../lib/v39-gacha-rules.js";
import {renderV39UnitCard} from "../unit/v39-unit-card.js";
import "./v39-gacha-screen.css";

let screen=null;
let units=[];
let opponentPool=[];
let selectedId="";

function render() {
  const result=screen.querySelector("[data-v39-gacha-results]");
  result.innerHTML=units.length
    ? units.map(unit=>renderV39UnitCard(unit,{
      attribute:"data-v39-gacha-unit",selected:unit.id===selectedId,
      portrait:true,snapshot:true,showVitals:false,collapseUnselected:false,
      position:unit.gachaRarity==null?"合体":unit.raceOnly?`★${unit.gachaRarity}`:`★${unit.gachaRarity} ${unit.className}`
    })).join("")
    : `<p class="v39-gacha-empty">抽選すると、Lv${V39_GACHA_UNIT_LEVEL}のユニットが${V39_GACHA_DRAW_COUNT}体出ます。</p>`;
  screen.querySelector("[data-v39-gacha-draw]").textContent=units.length?`${V39_GACHA_DRAW_COUNT}体引き直す`:`${V39_GACHA_DRAW_COUNT}体引く`;
  screen.querySelector("[data-v39-gacha-list]").disabled=!units.length;
  screen.querySelector("[data-v39-gacha-fusion]").disabled=units.length<2;
  screen.querySelector("[data-v39-gacha-battle]").disabled=!selectedId;
  for(const button of result.querySelectorAll("[data-v39-gacha-unit]")){
    button.setAttribute("aria-pressed",String(button.dataset.v39GachaUnit===selectedId));
  }
}

export function openV39GachaScreen() {
  if(screen)return true;
  const app=document.querySelector(".app");
  const previousInert=app?.inert;
  screen=document.createElement("section");
  screen.className="v39-gacha-screen";
  screen.setAttribute("aria-label","ガチャバトル");
  screen.innerHTML=`
    <div class="v39-gacha-view" data-v39-gacha-setup>
    <section class="v39-gacha-field">
      <h2>ガチャバトル</h2>
      <div class="v39-gacha-results" data-v39-gacha-results aria-live="polite"></div>
    </section>
    <section class="v39-gacha-controls" aria-label="ガチャ操作">
      <div class="v39-gacha-actions">
        <button type="button" data-v39-gacha-draw></button>
        <button type="button" data-v39-gacha-list>ユニット一覧</button>
        <button type="button" data-v39-gacha-fusion>合体</button>
        <button type="button" data-v39-gacha-battle>バトル画面へ</button>
      </div>
      <output data-v39-gacha-status role="status"></output>
      <button type="button" data-v39-gacha-back>タイトルへ戻る</button>
    </section>
    </div>`;
  const draw=screen.querySelector("[data-v39-gacha-draw]");
  const status=screen.querySelector("[data-v39-gacha-status]");
  draw.addEventListener("click",()=>{
    const drawn=drawV39GachaUnits();
    if(!drawn.length){
      status.textContent="抽選できるユニットがありません";
      return;
    }
    units=drawn;
    opponentPool=drawn;
    selectedId="";
    status.textContent="";
    render();
  });
  const setup=screen.querySelector("[data-v39-gacha-setup]");
  const battleButton=screen.querySelector("[data-v39-gacha-battle]");
  const result=screen.querySelector("[data-v39-gacha-results]");
  result.addEventListener("click",event=>{
    const button=event.target.closest("[data-v39-gacha-unit]");
    if(!button)return;
    selectedId=button.dataset.v39GachaUnit;
    for(const card of result.querySelectorAll("[data-v39-gacha-unit]")){
      const selected=card===button;
      card.classList.toggle("selected",selected);
      card.setAttribute("aria-pressed",String(selected));
    }
    battleButton.disabled=false;
  });
  battleButton.addEventListener("click",async()=>{
    const host=screen;
    battleButton.disabled=true;
    try{
      const {createV39GachaBattlePreview}=await import('./v39-gacha-battle-preview.js');
      if(screen!==host||setup.hidden)return;
      const enemy=opponentPool.find(row=>row.id!==selectedId)||opponentPool[0];
      if(!enemy||!units.some(row=>row.id===selectedId))return;
      const preview=createV39GachaBattlePreview(units,selectedId,{...enemy,id:`enemy-${enemy.id}`},()=>{
        preview.remove();
        setup.hidden=false;
        battleButton.focus({preventScroll:true});
      });
      setup.hidden=true;
      screen.appendChild(preview);
      preview.querySelector("[data-v39-gacha-back]").focus({preventScroll:true});
    }catch(error){
      console.error('[v39 gacha] battle setup failed',error);
      status.textContent='バトル画面を開けませんでした。';
    }finally{battleButton.disabled=!selectedId;}
  });
  screen.querySelector("[data-v39-gacha-fusion]").addEventListener("click",async()=>{
    const host=screen;
    try{
      const {openV39PrebattleFusion}=await import('../unit/v39-fusion-modal.js');
      if(host!==screen||setup.hidden||units.length<2)return;
      openV39PrebattleFusion({
        getState:()=>({gachaPreparation:true,activePlayerId:'gacha-player',activeWorldId:'surface',timeline:{phase:'player',turnNumber:1},
          players:[{id:'gacha-player',factionState:{units:units.map((unit,x)=>({...unit,x,y:0,worldId:'surface'}))}}]}),
        commit:state=>{
          units=state.players[0].factionState.units.map(unit=>unit.id===state.players[0].factionState.selectedUnitId
            ? {...unit,gachaRarity:null,ap:unit.maxAp,currentAp:unit.maxAp}:unit);
          if(!units.some(unit=>unit.id===selectedId))selectedId='';
          render();
        }
      });
    }catch(error){
      console.error('[v39 gacha] fusion setup failed',error);
      status.textContent='合体画面を開けませんでした。';
    }
  });
  screen.querySelector("[data-v39-gacha-list]").addEventListener("click",()=>{
    if(units.length)window.openV39CharacterModal?.({roster:units});
  });
  screen.querySelector("[data-v39-gacha-back]").addEventListener("click",()=>{
    screen.remove();
    screen=null;
    if(app)app.inert=previousInert;
    window.openV39PlayModeSelection?.();
  });
  if(app)app.inert=true;
  document.body.appendChild(screen);
  render();
  draw.focus({preventScroll:true});
  return true;
}
