import { V39_CAVE_EVENT_BALANCE as balance } from "../../lib/v39-gameplay-balance.js";
import { buildV39UnitEntity } from "../../lib/v39-unit-creation-rules.js";
import { getV39EquipmentCatalog, createV39EquipmentEntry } from "../../lib/v39-equipment-rules.js";
import { normalizeV39Cargo } from "../../lib/v39-logistics-state.js";
import { applyV39DerivedCharacterData } from "../unit/v39-character-derived-rules.js";
import { getHexDistance } from "../../lib/hex-grid.js";
import { HEX_TILE_CONFIG as hex } from "../../lib/phaser-map-panel-config.js";
import { resolveUnitArtwork } from "../../lib/map-entity-artwork.js";
import { isMobUnit } from "../../composables/unitCoreUtils.js";
import { showV39Conversation, closeV39Conversation } from "../ui/v39-conversation-ui.js";

let opened=false;
let conversationMode="home",selectedEntry=null,conversationActor=null;
const catalog=()=>getV39EquipmentCatalog().filter(row=>row.slots.includes("武器1")&&row.row.武器分類!=="盾").slice(0,balance.shopWeaponCount);
export function createV39CaveEventNpc(map){
  if(!map.caveTest||map.caveFloor!==1)return;
  const entry=map.entrances[0],x=entry.x+balance.npcOffsetX,y=entry.y+balance.npcOffsetY;
  if(x<0||x>=map.w||y<0||y>=map.h)throw new Error("鍛冶師を配置する入口周辺の余白がありません");
  // 指定位置が壁でも、入口から歩いて会話できる通路を確保する。
  for(let row=Math.min(entry.y,y);row<=Math.max(entry.y,y);row++)map.grid[row][entry.x]="洞窟";
  for(let col=Math.min(entry.x,x);col<=Math.max(entry.x,x);col++)map.grid[y][col]="洞窟";
  map.caveEventNpc={...buildV39UnitEntity({id:`${map.id}-smith`,name:"ドワーフの鍛冶師",race:"ドワーフ",className:"ファイター",level:balance.npcLevel,x,y}),画像番号:balance.npcArtworkSlot};
}

function context(){
  const state=window.getV39GameState?.({includeWorlds:false}),map=window.__v39FieldRuntime?.mapData;
  const player=state?.players.find(row=>row.id===state.activePlayerId),faction=player?.factionState;
  const actor=faction?.units.find(row=>row.id===faction.selectedUnitId);
  const key=map?.caveSeed;
  const campaign=faction?.caveEvents?.[key];
  const near=!!map?.caveTest&&!!map.caveEventNpc&&!!actor&&actor.hp>0
    &&(actor.worldId||"surface")===state.activeWorldId&&getHexDistance(actor,map.caveEventNpc)<=1;
  return {state,map,player,faction,actor,key,campaign,near};
}
function definitions(race){
  return [
    {id:"ore",name:"鍛冶用の鉱石",kind:"delivery",resource:"鉱石",need:balance.oreDelivery,reward:balance.oreReward},
    {id:"gem",name:"宝石の納品",kind:"delivery",resource:"宝石",need:balance.gemDelivery,reward:balance.gemReward},
    {id:"kills",name:"洞窟の生物を討伐",kind:"kill",need:balance.kills,reward:balance.killReward},
    {id:"habitat",name:`${race}の討伐`,kind:"kill",race,need:balance.habitatKills,reward:balance.habitatReward},
    {id:"floor",name:`地下${balance.targetFloor}階へ到達`,kind:"floor",need:balance.targetFloor,reward:balance.floorReward}
  ];
}
function cargo(faction,actor){
  const squad=faction.squads.find(row=>row.unitIds?.includes(actor.id));
  const individual=squad?.id==="solo"||actor.squadId==="solo"||!!actor.transportAssignment;
  return {squad,individual,value:normalizeV39Cargo(individual?squad?.cargoByUnitId?.[actor.id]:squad?.cargo)};
}
function replaceCargo(faction,actor,value){
  const {squad,individual}=cargo(faction,actor);
  if(!squad)throw new Error("運搬する部隊がありません");
  return {...faction,squads:faction.squads.map(row=>row.id!==squad.id?row:individual
    ?{...row,cargoByUnitId:{...row.cargoByUnitId,[actor.id]:value}}:{...row,cargo:value})};
}
function commit(c,faction,campaign,message){
  const updated={...faction,caveEvents:{...faction.caveEvents,[c.key]:campaign}};
  window.setV39GameState({players:c.state.players.map(row=>row.id===c.player.id?{...row,factionState:updated}:row)},{reason:"cave-event"});
  if(message)window.appendV39ActivityLog?.(c.player.id,"イベント",message,{worldId:c.state.activeWorldId});
}
function initialize(){
  if(window.__v39BackgroundWorldTurn)return;
  const c=context();if(!c.map?.caveTest||!c.player||!c.key)return;
  if(!c.campaign){
    commit(c,c.faction,{gold:balance.initialGold,quests:definitions(c.map.caveHabitatRace).map(row=>({...row,status:"available",progress:0})),countedKills:[],visitedFloor:c.map.caveFloor},"");
  }else{
    const campaign=structuredClone(c.campaign);
    let changed=c.map.caveFloor>campaign.visitedFloor;
    campaign.visitedFloor=Math.max(campaign.visitedFloor,c.map.caveFloor);
    for(const quest of campaign.quests)if(quest.status==="accepted"&&quest.kind==="floor"&&c.map.caveFloor>quest.progress){
      quest.progress=Math.min(quest.need,c.map.caveFloor);changed=true;
    }
    if(changed)commit(c,c.faction,campaign,"");
  }
}
function action(type,id){
  const c=context();
  if(!c.near||!c.campaign||window.isV39MapInputLocked?.())return {ok:false,reason:"鍛冶師の隣で会話してください"};
  let faction=c.faction,campaign=structuredClone(c.campaign),message="";
  try{
    if(type==="buy"||type==="craft"){
      const row=catalog().find(row=>row.name===id),cost=type==="buy"?balance.buyGold:balance.craftGold;
      if(!row)throw new Error("武器がありません");
      const held=cargo(faction,c.actor);
      if(campaign.gold<cost)throw new Error("携帯金が不足しています");
      if(type==="craft"&&(held.value.resourcesByType.鉱石||0)<balance.craftOre)throw new Error("鉱石が不足しています");
      const item=createV39EquipmentEntry(id,undefined,"武器1");
      if(!item)throw new Error("装備を生成できません");
      if(type==="craft")held.value.resourcesByType.鉱石-=balance.craftOre;
      held.value.equipmentInventory.push(item);faction=replaceCargo(faction,c.actor,held.value);
      campaign.gold-=cost;message=`${type==="buy"?"購入":"製作"}: ${id} / 金-${cost}`;
    }else if(type==="equip"){
      if(isMobUnit(c.actor))throw new Error("固定装備のユニットは装備変更できません");
      const held=cargo(faction,c.actor),item=held.value.equipmentInventory[Number(id)];
      if(!item)throw new Error("武器がありません");
      held.value.equipmentInventory.splice(Number(id),1);
      const old=c.actor.equipment?.find(row=>row.slot==="武器1");if(old)held.value.equipmentInventory.push(old);
      faction=replaceCargo(faction,c.actor,held.value);
      const equipped=applyV39DerivedCharacterData({...c.actor,equipment:[...(c.actor.equipment||[]).filter(row=>row.slot!=="武器1"),{...item,slot:"武器1"}]});
      if(!equipped.derivedCharacter?.ok)throw new Error("装備の計算に失敗しました");
      faction={...faction,units:faction.units.map(row=>row.id!==c.actor.id?row:{...equipped,hp:Math.min(c.actor.hp,equipped.maxHp),currentHp:Math.min(c.actor.hp,equipped.maxHp),ap:c.actor.ap,currentAp:c.actor.currentAp})};
      message=`${c.actor.name}: ${item.name}を装備`;
    }else{
      const quest=campaign.quests.find(row=>row.id===id);if(!quest)throw new Error("依頼がありません");
      if(type==="accept"){
        if(quest.status!=="available")throw new Error("受注済みです");
        quest.status="accepted";quest.progress=0;quest.acceptedFloor=c.map.caveFloor;message=`受注: ${quest.name}`;
      }else if(type==="claim"){
        if(quest.status!=="accepted")throw new Error("報酬は受け取れません");
        if(quest.kind==="delivery"){
          const held=cargo(faction,c.actor);
          if((held.value.resourcesByType[quest.resource]||0)<quest.need)throw new Error("納品資源が不足しています");
          held.value.resourcesByType[quest.resource]-=quest.need;faction=replaceCargo(faction,c.actor,held.value);
        }else if(quest.progress<quest.need)throw new Error("条件を達成していません");
        quest.status="claimed";campaign.gold+=quest.reward;message=`依頼達成: ${quest.name} / 金+${quest.reward}`;
      }else throw new Error("不明な操作です");
    }
    commit(c,faction,campaign,message);return {ok:true};
  }catch(error){window.showV39TurnBanner?.(error.message);return {ok:false,reason:error.message};}
}
function element(tag,text,className=""){
  const node=document.createElement(tag);node.textContent=text;node.className=className;return node;
}
function button(text,fn,disabled=false){const node=element("button",text);node.type="button";node.disabled=disabled;node.dataset.conversationFocus=text;node.addEventListener("click",fn);return node;}
function questProgress(quest,held){
  if(quest.status==="available")return 0;
  if(quest.status==="claimed")return quest.need;
  return Math.min(quest.need,quest.kind==="delivery"?held.resourcesByType[quest.resource]||0:quest.progress);
}
function questStatus(quest,held){
  if(quest.status==="available")return "未受注";
  if(quest.status==="claimed")return "受領済み";
  return questProgress(quest,held)>=quest.need?"報告可能":"受注中";
}
function openConversation(){
  initialize();window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.("conversation");
  opened=true;conversationActor=context().actor?.id;conversationMode="home";selectedEntry=null;render();
}
function conversationDialogue(c,held){
  switch(conversationMode){
    case "buy":
      return selectedEntry===null?"武器を探しているのか。気になるものを選んでくれ。"
        :`${selectedEntry}だな。金${balance.buyGold}で売ろう。`;
    case "craft":
      return selectedEntry===null?"鉱石があれば武器を作れるぞ。作りたい武器を選んでくれ。"
        :`${selectedEntry}を作るなら、鉱石${balance.craftOre}と金${balance.craftGold}が必要だ。`;
    case "equip":{
      const item=selectedEntry!==null?held.equipmentInventory[Number(selectedEntry)]:null;
      return item?`${item.name}を${c.actor.name}に装備させるのだな。今の武器は荷物に戻しておこう。`
        :"持っている武器から、装備したいものを選んでくれ。";
    }
    case "quests":{
      const quest=c.campaign.quests.find(row=>row.id===selectedEntry);
      if(!quest)return "頼みたい仕事がある。詳しく聞きたい依頼を選んでくれ。";
      if(quest.status==="claimed")return `${quest.name}、助かったぞ。報酬はもう渡してある。`;
      const request=quest.kind==="delivery"?`${quest.resource}を${quest.need}個持ってきてくれ。`
        :quest.kind==="floor"?`地下${quest.need}階まで到達して、ここへ戻ってきてくれ。`
          :`${quest.race||"洞窟の生物"}を${quest.need}体討伐してくれ。受注してからの討伐が対象だ。`;
      return `${request}\n報酬は金${quest.reward}だ。${quest.status==="accepted"?"達成したら報告してくれ。":"引き受けてくれるか？"}`;
    }
    default:return "よく来たな。鉱石を持ってくれば武器を作ろう。\n依頼の報酬も用意している。";
  }
}
function render(){
  const c=context(),list=document.getElementById("detailTechniqueList");if(!list)return;
  document.getElementById("v39-cave-talk")?.remove();
  if(!c.near||(opened&&conversationActor!==c.actor.id)){opened=false;closeV39Conversation();if(!c.near)return;}
  const talk=button("⚒ ドワーフに話す",openConversation);talk.id="v39-cave-talk";talk.className="technique-card system-action-card";
  list.insertBefore(talk,document.getElementById("detailTechniqueRows"));
  if(!opened||!c.campaign)return;
  const panel=element("section", "");panel.id="v39-cave-event-panel";
  panel.append(element("b",`携帯金 ${c.campaign.gold}`));
  const nav=element("nav","");
  const modes=[["buy","武器を買う"],["craft","製作を頼む"],["equip","装備する"],["quests","依頼"]];
  if(conversationMode!=="home")nav.append(button("戻る",()=>{
    if(selectedEntry!==null)selectedEntry=null;
    else conversationMode="home";
    render();
  }));
  for(const [mode,label] of conversationMode==="home"?modes:[]){
    const choice=button(label,()=>{conversationMode=mode;selectedEntry=null;render();});
    choice.classList.toggle("active",conversationMode===mode);nav.append(choice);
  }
  panel.append(nav);
  const held=cargo(c.faction,c.actor).value;
  const detail=element("div","","v39-cave-event-detail");
  if(conversationMode==="buy"||conversationMode==="craft"){
    for(const row of selectedEntry===null?catalog():[]){
      const choice=button(row.name,()=>{selectedEntry=row.name;render();});choice.className="v39-cave-event-row";choice.classList.toggle("active",selectedEntry===row.name);panel.append(choice);
    }
    const row=catalog().find(row=>row.name===selectedEntry);
    if(row){
      const item=createV39EquipmentEntry(row.name),craft=conversationMode==="craft";
      detail.append(element("b",row.name),element("p",`威力 ${item.power}\n${craft?`鉱石 ${balance.craftOre} / 所持 ${held.resourcesByType.鉱石||0} / 金 ${balance.craftGold}`:`金 ${balance.buyGold}`}`));
      detail.append(button(craft?`製作 鉱石${balance.craftOre} 金${balance.craftGold}`:`購入 金${balance.buyGold}`,()=>action(conversationMode,row.name),c.campaign.gold<(craft?balance.craftGold:balance.buyGold)||(craft&&(held.resourcesByType.鉱石||0)<balance.craftOre)));
    }else detail.append(element("p","武器を選択してください。"));
  }else if(conversationMode==="equip"){
    if(selectedEntry===null)held.equipmentInventory.forEach((item,index)=>{
      if(item.slot!=="武器1")return;
      const choice=button(item.name,()=>{selectedEntry=String(index);render();});choice.className="v39-cave-event-row";panel.append(choice);
    });
    const item=selectedEntry!==null?held.equipmentInventory[Number(selectedEntry)]:null;
    if(item){detail.append(element("p",`${item.name} / 威力 ${item.power}`),button(`${c.actor.name}に装備`,()=>{const id=selectedEntry;selectedEntry=null;action("equip",id);},isMobUnit(c.actor)));}
    else detail.append(element("p","携帯している武器を選択してください。"));
  }else if(conversationMode==="quests"){
    for(const quest of selectedEntry===null?c.campaign.quests:[]){
      const choice=button(`${quest.name}\n${questStatus(quest,held)} ${questProgress(quest,held)}/${quest.need}`,()=>{selectedEntry=quest.id;render();});choice.className="v39-cave-event-row";choice.dataset.questId=quest.id;choice.classList.toggle("active",selectedEntry===quest.id);panel.append(choice);
    }
    const quest=c.campaign.quests.find(row=>row.id===selectedEntry);
    if(quest){
      const progress=questProgress(quest,held);
      detail.append(element("b",quest.name),element("p",`${questStatus(quest,held)} ${progress}/${quest.need} / 報酬 金${quest.reward}`));
      if(quest.status==="available")detail.append(button("受注",()=>action("accept",quest.id)));
      else if(quest.status==="accepted")detail.append(button(quest.kind==="delivery"?"納品・報酬受取":"報酬受取",()=>action("claim",quest.id),progress<quest.need));
      else detail.append(element("span","受領済み"));
    }else detail.append(element("p","依頼を選択してください。"));
  }else{
    detail.append(button("やめる",closeV39Conversation));
  }
  if(selectedEntry!==null||conversationMode==="home")panel.insertBefore(detail,nav.nextSibling);
  showV39Conversation({name:c.map.caveEventNpc.name,portrait:resolveUnitArtwork(c.map.caveEventNpc),dialogue:conversationDialogue(c,held),content:panel,viewKey:`${conversationMode}:${selectedEntry??"list"}`,close:()=>{opened=false;conversationActor=null;}});
}
function drawNpc(){
  const c=context(),scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];if(!scene)return;
  scene.v39CaveNpc?.destroy(true);scene.v39CaveNpc=null;
  const npc=c.map?.caveTest&&c.map.caveEventNpc;if(!npc)return;
  if(!window.isV39TileExplored?.(npc.x,npc.y)&&!window.isV39TileInCurrentVision?.(npc.x,npc.y))return;
  const x=npc.x*hex.width+(npc.y%2?hex.oddRowOffsetX:0)+hex.width/2,y=npc.y*hex.rowStep+hex.height/2;
  const group=scene.add.container(x,y).setDepth(28);scene.v39CaveNpc=group;
  const artwork=resolveUnitArtwork(npc);
  let marker;
  if(artwork&&scene.textures.exists(artwork.textureKey)){
    const texture=scene.textures.get(artwork.textureKey),frame=artwork.sheetFrame;
    if(frame&&!texture.has(frame.frameKey)){
      const source=texture.source[0],width=source.width/frame.columns,height=source.height/frame.rows;
      texture.add(frame.frameKey,0,frame.column*width,frame.row*height,width,height);
    }
    marker=scene.add.image(0,0,artwork.textureKey,frame?.frameKey).setDisplaySize(hex.width*.65,hex.height*.8);
  }
  else{
    marker=scene.add.text(0,0,"⚒",{fontSize:`${hex.width*.55}px`,color:"#ffdc8c"}).setOrigin(.5);
    if(artwork&&!scene.v39NpcLoading){scene.v39NpcLoading=true;scene.load.image(artwork.textureKey,artwork.src);scene.load.once("complete",()=>{scene.v39NpcLoading=false;drawNpc();});if(!scene.load.isLoading())scene.load.start();}
  }
  marker.setInteractive();marker.on("pointerdown",()=>{
    if(!context().near){window.showV39TurnBanner?.("鍛冶師の隣へ移動してください");return;}
    window.activateV39FooterTab?.("squad");document.querySelector('[data-squad-detail-tab="action"]')?.click();openConversation();
  });group.add(marker);
  group.add(scene.add.text(hex.width*.25,-hex.height*.3,"…",{fontSize:`${hex.width*.25}px`,color:"#ffe3a1",backgroundColor:"#172a30"}).setOrigin(.5));
}
function recordCombat(event){
  const c=context(),detail=event.detail;if(!c.map?.caveTest||!c.campaign||!c.faction.units.some(row=>row.id===detail?.attackerId))return;
  const campaign=structuredClone(c.campaign);let changed=false;
  for(const hit of detail.entries||[]){
    const id=`${c.state.activeWorldId}:${hit.targetId}`,target=c.state.enemies.find(row=>row.id===hit.targetId);
    if(!target||target.hp>0||hit.friendly||!(hit.beforeHp>0)||!(hit.afterHp<=0)||campaign.countedKills.includes(id))continue;
    campaign.countedKills.push(id);changed=true;
    for(const quest of campaign.quests)if(quest.status==="accepted"&&quest.kind==="kill"&&(!quest.race||quest.race===target.race))quest.progress=Math.min(quest.need,quest.progress+1);
  }
  if(changed)commit(c,c.faction,campaign,"");
}
for(const type of ["v39:squad-detail-rendered","v39:unit-selected","v39:map-input-lock-changed"])window.addEventListener(type,render);
for(const type of ["v39:cave-world-ready","v39:save-loaded"])window.addEventListener(type,()=>{initialize();render();drawNpc();});
for(const type of ["v39:field-layer-changed","v39:visibility-rendered"])window.addEventListener(type,()=>{render();drawNpc();});
window.addEventListener("v39:game-state-changed",event=>{if(event.detail?.reason!=="activity-log"){render();}});
window.addEventListener("v39:combat-log",recordCombat);
window.performV39CaveEventAction=action;
