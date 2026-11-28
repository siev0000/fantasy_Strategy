import field from "../../../../config/v39-gacha-field.json";
import {resolveUnitArtwork} from "../../lib/map-entity-artwork.js";
import {MAP_ENTITY_SIZE_RULES,resolveV39UnitImageScale} from "../../lib/map-entity-size-rules.js";
import {V39_GACHA_FIELD_TILES,fitGachaFighters} from "../../lib/v39-gacha-field-rules.js";
import {resolveAttackApCost} from "../../lib/v39-combat-engine.js";
import {createV39GachaMatch} from "../combat/v39-gacha-match.js";
import {createV39GachaEffects} from "../combat/v39-gacha-effects.js";
import {createV39CombatVisualHp} from "../../lib/v39-combat-visual-state.js";
import {HEX_TILE_CONFIG} from "../../lib/phaser-map-panel-config.js";
import {renderV39UnitCard} from "../unit/v39-unit-card.js";
import {renderV39UnitHeading} from "../unit/v39-unit-heading.js";
import {renderV39DetailTabs,renderV39UnitAbility} from "../unit/v39-unit-detail.js";
import {renderV39UnitSkills} from "../unit/v39-unit-skills.js";

const fieldImages=import.meta.glob("../../../../assets/images/background/*_{地面,背景,設置物1,設置物2,天候}.{webp,png,jpg,jpeg,avif}",{
  eager:true,query:"?url",import:"default"
});
const layerNames={background:"背景",ground:"地面",object1:"設置物1",object2:"設置物2",weather:"天候"};
const assetsByFilename=new Map(Object.entries(fieldImages).map(([path,url])=>[path.split("/").at(-1),url]));
const formats=["webp","png","jpg","jpeg","avif"];
const tabs=[["status","能力"],["basic","基本"],["skills","スキル"]];

function layerImage(name,layer) {
  const stem=`${name}_${layerNames[layer]}`;
  return formats.map(extension=>assetsByFilename.get(`${stem}.${extension}`)).find(Boolean);
}

function renderBattleUnit(host,unit) {
  const art=resolveUnitArtwork(unit);
  host.style.backgroundImage="";
  host.style.backgroundSize="";
  host.style.backgroundPosition="";
  if(!art?.src)return;
  host.style.backgroundImage=`url("${art.src}")`;
  const frame=art.sheetFrame;
  if(frame){
    const {columns,rows,column,row}=frame;
    host.style.backgroundSize=`${columns*100}% ${rows*100}%`;
    host.style.backgroundPosition=`${columns>1?column/(columns-1)*100:0}% ${rows>1?row/(rows-1)*100:0}%`;
  }
}

export function createV39GachaBattlePreview(roster,selectedId,enemy,onBack) {
  let selected=0;
  let activeTab="status";
  let expandedSkill="";
  let attackRow=null;
  let moveMode=false;
  let moveTile=null;
  const panel=document.createElement("div");
  panel.className="v39-gacha-view";
  panel.innerHTML=`
    <section class="v39-gacha-field v39-gacha-battle-field">
      <header class="v39-gacha-battle-header"><h2>バトル</h2><select aria-label="フィールド" data-v39-battle-field></select></header>
      <div class="v39-gacha-battle-stage" aria-label="横一列12マスのフィールド">
        <div data-layer="background" aria-hidden="true"></div>
        <div data-layer="object1" aria-hidden="true"></div>
        <div data-layer="object2" aria-hidden="true"></div>
        <div class="v39-gacha-battle-world">
          <div data-layer="ground" aria-hidden="true"></div>
          <div class="v39-gacha-battle-grid">${Array.from({length:V39_GACHA_FIELD_TILES},(_,i)=>
            `<button type="button" data-v39-battle-tile="${i}" aria-label="${i+1}マス目">${i+1}</button>`).join("")}</div>
          <button type="button" data-v39-battle-sprite="0" class="v39-gacha-battle-unit" aria-label="味方を選択"></button>
          <button type="button" data-v39-battle-sprite="1" class="v39-gacha-battle-unit" aria-label="敵を選択"></button>
        </div>
        <div data-layer="weather" aria-hidden="true"></div>
        <div class="v39-gacha-battle-effects" aria-hidden="true"></div>
        <details class="v39-gacha-battle-history">
          <summary>攻撃ログ</summary>
          <p data-v39-battle-history-empty>攻撃ログはまだありません。</p>
          <ol data-v39-battle-history></ol>
        </details>
      </div>
    </section>
    <section class="v39-gacha-battle-footer" aria-label="部隊">
      <div class="v39-gacha-battle-panes squad-content-split">
        <div class="squad-list-pane" data-v39-battle-list></div>
        <section class="squad-detail-pane" data-v39-battle-detail></section>
      </div>
      <div class="v39-gacha-battle-actions">
        <button type="button" data-v39-gacha-back>編成に戻る</button>
        <output aria-live="polite" data-v39-battle-log></output>
        <button type="button" data-v39-battle-end>ターン終了</button>
      </div>
    </section>`;

  const stage=panel.querySelector(".v39-gacha-battle-stage");
  const world=stage.querySelector(".v39-gacha-battle-world");
  const tiles=[...stage.querySelectorAll("[data-v39-battle-tile]")];
  const sprites=[...stage.querySelectorAll("[data-v39-battle-sprite]")];
  const list=panel.querySelector("[data-v39-battle-list]");
  const detail=panel.querySelector("[data-v39-battle-detail]");
  const log=panel.querySelector("[data-v39-battle-log]");
  const history=panel.querySelector("[data-v39-battle-history]");
  const historyEmpty=panel.querySelector("[data-v39-battle-history-empty]");
  const endTurn=panel.querySelector("[data-v39-battle-end]");
  const fieldSelect=panel.querySelector("[data-v39-battle-field]");
  const report=message=>{log.textContent=message;};
  const visualHp=createV39CombatVisualHp(()=>{if(panel.isConnected)render();});
  const effects=createV39GachaEffects(stage.querySelector(".v39-gacha-battle-effects"),busy=>{
    stage.classList.toggle("v39-gacha-effect-playing",busy);
    endTurn.disabled=busy||finished();
    fieldSelect.disabled=busy;
  },{
    visualHp,
    resolveCenter(entry){
      const target=[match.active(0),match.active(1)].find(unit=>unit.id===entry.targetId);
      if(!target)return;
      return {x:(entry.x+match.footprint(target).length/2)*HEX_TILE_CONFIG.width,y:HEX_TILE_CONFIG.height/2};
    },
    react(entry,{dodged,damage}){
      if(dodged||!damage)return;
      const index=[0,1].find(side=>match.active(side).id===entry.targetId);
      sprites[index]?.animate?.([{opacity:1},{opacity:.25},{opacity:1}],{duration:180});
    }
  });
  const match=createV39GachaMatch(roster,selectedId,enemy,report,{
    playEffect:effects.play,
    onCombatLog(entry,turn){
      effects.presentLog(entry,{state:match.state,mapData:match.map});
      const item=document.createElement("li");
      item.textContent=`T${turn} ${entry.summary}`;
      historyEmpty.hidden=true;
      history.prepend(item);
      if(history.childElementCount>100)history.lastElementChild.remove();
    }
  });
  const living=unit=>Number(unit?.hp??unit?.currentHp)>0;
  const finished=()=>[0,1].some(side=>!match.faction(side).units.some(living));
  for(const name of field.names){
    const option=document.createElement("option");
    option.value=name;
    option.textContent=name;
    fieldSelect.appendChild(option);
  }
  fieldSelect.value=field.names.includes(field.name)?field.name:field.names[0];
  function updateLayers() {
    match.setField(fieldSelect.value);
    for(const element of stage.querySelectorAll("[data-layer]")){
      const url=layerImage(fieldSelect.value,element.dataset.layer);
      element.style.backgroundImage=url?`url("${url}")`:"";
    }
    updateStage();
  }
  fieldSelect.addEventListener("change",updateLayers);
  updateLayers();

  function updateStage() {
    if(!stage.clientWidth||!stage.clientHeight)return;
    const fighters=[0,1].map(side=>{
      const unit=match.active(side),width=match.footprint(unit).length;
      const scale=resolveV39UnitImageScale(unit)*MAP_ENTITY_SIZE_RULES.unit.imageFill;
      return {unit,tile:unit.x,width,imageSize:width*Math.min(1,scale)};
    });
    const movement=moveMode?match.movement(selected):null;
    const range=attackRow?match.range(selected,attackRow):null;
    const {tileSize,offset}=fitGachaFighters(fighters,stage.clientWidth,stage.clientHeight);
    effects.setView({tileSize,offset,width:stage.clientWidth,height:stage.clientHeight});
    stage.style.setProperty("--v39-gacha-tile-size",`${tileSize}px`);
    world.style.width=`${tileSize*V39_GACHA_FIELD_TILES}px`;
    world.style.transform=`translateX(${offset}px)`;
    for(const [index,fighter] of fighters.entries()){
      sprites[index].style.left=`${(fighter.tile+fighter.width/2)*tileSize}px`;
      sprites[index].style.width=`${fighter.imageSize*tileSize}px`;
      sprites[index].setAttribute("aria-pressed",String(index===selected));
      sprites[index].disabled=!!attackRow||moveMode;
      sprites[index].classList.toggle("v39-gacha-defeated",!living(visualHp.visualUnit(fighter.unit)));
      renderBattleUnit(sprites[index],fighter.unit);
    }
    for(const [tile,button] of tiles.entries()){
      const occupied=fighters.findIndex(fighter=>living(fighter.unit)&&tile>=fighter.tile&&tile<fighter.tile+fighter.width);
      button.dataset.occupant=occupied<0?"":String(occupied);
      button.classList.toggle("selected",occupied===selected);
      const targetable=range?.has(`${tile},0`)||movement?.plan.clickable.has(`${tile},0`);
      button.classList.toggle("v39-gacha-targetable",!!targetable);
      button.classList.toggle("v39-gacha-destination",tile===moveTile);
      button.disabled=attackRow||moveMode?!targetable:occupied<0;
    }
  }

  function showDetail() {
    const current=visualHp.visualUnit(match.active(selected));
    const displayOptions={state:match.state,mapData:match.map};
    const movementQueued=moveMode&&moveTile!==null;
    const possibleAttacks=activeTab==="skills"?match.actions(selected):[];
    const canAttack=possibleAttacks.some(row=>row.名前===expandedSkill);
    const content=activeTab==="skills"
      ? `${attackRow?'<p>攻撃先のマスを選んでください。</p>':canAttack?'<button type="button" data-v39-battle-aim>攻撃先を選ぶ</button>':''}
        ${attackRow?'<button type="button" data-v39-battle-cancel>取消</button>':''}
        <div class="technique-list">${renderV39UnitSkills(current,{...displayOptions,expandedName:expandedSkill})}</div>`
      : activeTab==="basic"
        ? `<div class="v39-gacha-battle-movement"><button type="button" data-v39-battle-move${finished()||!living(current)?' disabled':''}>移動</button>
          ${moveMode?`<p>${movementQueued?`${moveTile+1}マス目へ移動`:'移動先のマスを選んでください。'}</p><button type="button" data-v39-battle-cancel>取消</button>
          <button type="button" data-v39-battle-confirm-move${movementQueued?'':' disabled'}>移動確定</button>`:''}</div>`
        : renderV39UnitAbility(current,displayOptions);
    detail.innerHTML=`<div class="squad-detail-minihead">${renderV39UnitHeading(current,{state:null})}</div>
      ${renderV39DetailTabs(tabs,activeTab,"data-v39-battle-tab")}
      <div class="squad-detail-tab-content"><section class="squad-detail-tab-panel" role="tabpanel">${content}</section></div>`;
  }

  function render() {
    list.innerHTML=[0,1].map(i=>renderV39UnitCard(visualHp.visualUnit(match.active(i)),{
      attribute:"data-v39-battle-fighter",id:i,portrait:true,snapshot:true,
      selected:i===selected,collapseUnselected:false,position:i===0?"味方":"敵"
    })).join("")+`<div class="v39-gacha-reserves"><b>控え</b>${match.faction(0).units.filter(member=>member.id!==match.active(0).id)
      .map(member=>renderV39UnitCard(member,{
        attribute:"data-v39-battle-reserve",portrait:true,snapshot:true,collapseUnselected:false,
        position:living(member)?'交代候補':'戦闘不能',dead:!living(member)
      })).join("")}</div>`;
    endTurn.disabled=effects.busy||finished();
    endTurn.textContent=`T${match.turn()} 終了`;
    if([0,1].some(side=>!match.faction(side).units.some(unit=>living(visualHp.visualUnit(unit)))))
      report(match.faction(0).units.some(living)?'勝利':'敗北');
    showDetail();
    updateStage();
  }

  function clearAction(){
    attackRow=null;
    moveMode=false;
    moveTile=null;
  }

  function selectFighter(index) {
    selected=index;
    expandedSkill="";
    clearAction();
    render();
  }

  list.addEventListener("click",event=>{
    const reserve=event.target.closest("[data-v39-battle-reserve]");
    if(reserve){
      if(effects.busy)return;
      const id=reserve.dataset.v39BattleReserve;
      if(!finished()&&match.swap(0,id))selectFighter(0);
      else if(!finished())report('交代できません。AP・交代済み・出撃先を確認してください。');
      return;
    }
    const card=event.target.closest("[data-v39-battle-fighter]");
    if(!card)return;
    const index=Number(card.dataset.v39BattleFighter);
    selectFighter(index);
    list.querySelector(`[data-v39-battle-fighter="${index}"]`)?.focus({preventScroll:true});
  });
  stage.addEventListener("click",event=>{
    if(effects.busy)return;
    const sprite=event.target.closest("[data-v39-battle-sprite]");
    if(sprite){selectFighter(Number(sprite.dataset.v39BattleSprite));return;}
    const tileButton=event.target.closest("[data-v39-battle-tile]");
    if(!tileButton)return;
    const {occupant,v39BattleTile}=tileButton.dataset;
    const tile=Number(v39BattleTile);
    if(attackRow){
      const success=match.attack(selected,attackRow,tile);
      if(success)clearAction();
      else if(!log.textContent)report('そのマスには攻撃できません。');
      render();return;
    }
    if(moveMode){moveTile=tile;showDetail();updateStage();return;}
    if(occupant!=="")selectFighter(Number(occupant));
  });
  detail.addEventListener("click",event=>{
    const tab=event.target.closest("[data-v39-battle-tab]");
    if(tab){
      activeTab=tab.dataset.v39BattleTab;
      clearAction();
      showDetail();
      updateStage();
      detail.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
    }
    const skill=event.target.closest("[data-v39-character-skill]");
    if(skill){
      const scroller=skill.closest(".squad-detail-tab-panel");
      const scroll=scroller.scrollTop;
      const name=skill.dataset.v39CharacterSkill;
      expandedSkill=expandedSkill===name?"":name;
      clearAction();
      showDetail();
      updateStage();
      const next=[...detail.querySelectorAll("[data-v39-character-skill]")].find(button=>button.dataset.v39CharacterSkill===name);
      next?.focus({preventScroll:true});
      detail.querySelector(".squad-detail-tab-panel").scrollTop=scroll;
    }
    if(event.target.closest('[data-v39-battle-aim]')&&!finished()){
      attackRow=match.actions(selected).find(row=>row.名前===expandedSkill)||null;
      if(attackRow)report(`${attackRow.名前} / AP ${resolveAttackApCost(attackRow,match.active(selected))}`);
      showDetail();updateStage();
    }
    if(event.target.closest('[data-v39-battle-move]')){
      moveMode=true;moveTile=null;showDetail();updateStage();
    }
    if(event.target.closest('[data-v39-battle-cancel]')){clearAction();showDetail();updateStage();}
    if(event.target.closest('[data-v39-battle-confirm-move]')&&moveTile!==null&&!effects.busy){
      if(match.move(selected,moveTile))clearAction();
      render();
    }
  });
  endTurn.addEventListener('click',()=>{
    if(finished()||effects.busy)return;
    clearAction();match.nextTurn();render();
  });
  selectFighter(0);
  const observer=new ResizeObserver(updateStage);
  observer.observe(stage);
  panel.querySelector("[data-v39-gacha-back]").addEventListener("click",()=>{
    observer.disconnect();
    effects.destroy();
    onBack();
  });
  return panel;
}
