import {availableSpy,continueSpy,dispatchSpy,publicizeSpy,recallSpy,spyBalance,spyDestinations,spySubjectOptions,spyMissionNames} from "../../lib/v39-spy-operations.js";
import {readV39ItemListAction,renderV39ItemListScreen1} from "../ui/v39-item-list-screen-1.js";
import {updateV39RetainedMarkup} from "../ui/v39-retained-markup.js";
import "./v39-spy-panel.css";

import {renderV39StoragePanes} from "../unit/v39-facility-storage-ui.js";
import {renderV39DetailSection} from "../unit/v39-unit-detail.js";
import {renderV39UnitCard} from "../unit/v39-unit-card.js";
import {getV39SettlementFacilities} from "./v39-facility-panel.js";
import {renderV39SettlementView} from "./v39-settlement-ui.js";
import {getV39SettlementIntelUnits,settlementIntelGroups,snapshotV39SettlementIntelUnits} from "../../lib/v39-settlement-intel.js";
import {focusV39MapTile} from "../map/v39-map-focus.js";

let mapSelection=null;
window.getV39SpyTargetSelection=()=>mapSelection?.highlight||null;
window.handleV39SpyTargetTap=tile=>{if(!mapSelection)return false;mapSelection.select(tile);return true;};

const generalTabs=["派遣","防諜","報告"];
const factionTabs=["概要","調査結果","諜報"];
const missionDescriptions={
  偵察:"対象拠点のユニット・施設・領土から、選んだ項目の情報を取得します。",
  内政調査:"人口・幸福度、資源・備蓄、施設・生産のうち、選んだ項目の情報を取得します。",
  技術調査:"研究中の技術、習得済みの技術、研究施設を調査します。自勢力に未習得の技術が見つかると、研究中・習得済みの調査では研究経験値も得られます。",
  情報網構築:"対象拠点に情報網を作り、その拠点での発見回避率を2ポイント上げます。",
  破壊工作:"判明している施設を選び、耐久を0にします。発見されて中断した場合も、進捗50％以上で最大耐久の25％、90％以上で50％のダメージを与えます。",
  物資妨害:"対象拠点の産出を次の3ターン半減させます。",
  扇動:"拠点住民の幸福度を10下げるか、対象勢力が指定した別勢力に抱く友好度を10下げます。",
  物資窃盗:"選んだ備蓄資源を自拠点に移します。持ち出せる量は早業と対象の在庫で決まります。",
  装備窃盗:"対象拠点の在庫から通常装備を1個、自拠点に移します。",
  複数装備窃盗:`怪盗専用。通常装備を最大${spyBalance.masterThiefItems}個、自拠点に移します。`,
  希少品窃盗:"怪盗専用。レア以上の装備を1個、自拠点に移します。",
  軍隊潜入:"対象拠点で新しい軍隊の編成を待ちます。潜入に成功すると、その軍隊に同行しながら所属ユニットの情報を取得できます。"
};
const read=()=>window.getV39GameState({includeWorlds:false});
const escape=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const ap=u=>Number(u.ap??u.currentAp)||0;
const options=pairs=>pairs.map(([value,label])=>({value,label}));
const sameLabels=values=>values.map(value=>({value,label:value}));
const ownTile=(state,owner,unit)=>(unit.worldId||"surface")==="surface"&&state.territoryOwnerByTile?.[unit.x+","+unit.y]===owner.id;

function renderSurveyedUnitDetail(unit){
  if(!unit)return "";
  const facts=[["役割",unit.roles?.join("・")],["Lv",unit.level],["種族",unit.race],["クラス",unit.className],
    ["HP",unit.hp!=null&&unit.maxHp!=null?`${unit.hp}/${unit.maxHp}`:null],
    ["AP",unit.ap!=null&&unit.maxAp!=null?`${unit.ap}/${unit.maxAp}`:null],
    ...Object.entries(unit.status||{})];
  return renderV39DetailSection(String(unit.name??"ユニット"),facts
    .filter(([,value])=>value!=null&&value!=="")
    .map(([label,value])=>`<div class="detail-stat"><span>${escape(label)}</span><b>${escape(value)}</b></div>`).join(""));
}

export function openSpyPanel(onBack,{targetId}={}){
  if(mapSelection)return;
  const initial=read(),ownerId=initial.activePlayerId;
  if(targetId&&!initial.players.find(player=>player.id===ownerId)?.factionState.factionSightings?.[targetId])return;
  const tabs=(targetId?factionTabs:generalTabs).map(id=>({id,label:id}));
  document.getElementById("v39-spy-dialog")?.close();
  const host=document.createElement("dialog");
  host.id="v39-spy-dialog";
  host.setAttribute("aria-labelledby","v39-spy-title");
  document.body.append(host);
  const selection={},orders=new Map();
  const openSettlementSections=new Set(["population"]);
  let settlementPage="overview",surveyedFacilityId,surveyedStorageId,storedUnitIndex=0;
  let surveyedUnitId;
  let tab=targetId?"調査結果":"派遣",message="",commands=new Map();
  function pickTarget(sites,draft){
    const listeners=new AbortController();
    const {signal}=listeners;
    const toolbar=document.createElement("div");
    toolbar.id="v39-spy-target-picker";
    const prompt=document.createElement("span");
    prompt.setAttribute("role","status");
    prompt.textContent="強調された対象拠点を選んでください。";
    const cancel=document.createElement("button");
    cancel.type="button";cancel.textContent="キャンセル";
    const confirm=document.createElement("button");
    confirm.type="button";
    confirm.textContent="この拠点に決定";
    confirm.disabled=true;
    toolbar.append(prompt,confirm,cancel);
    document.body.append(toolbar);
    function finish(reopen){
      mapSelection=null;
      listeners.abort();
      toolbar.remove();
      window.renderV39Visibility?.();
      if(reopen){render();host.showModal();}
      else host.remove();
    }
    const tileKey=tile=>tile.x+","+tile.y;
    const highlight={candidateTileKeys:sites.map(({v})=>tileKey(v)),selectedTileKeys:[]};
    let pendingSite=null;
    mapSelection={
      highlight,
      select(tile){
        const site=sites.find(({v})=>tileKey(v)===tileKey(tile));
        if(!site)return;
        pendingSite=site;
        highlight.selectedTileKeys=[tileKey(site.v)];
        prompt.textContent=`対象拠点は ${site.p.label}の${site.v.name}（${site.v.x}, ${site.v.y}）でよいですか？`;
        confirm.disabled=false;
        window.renderV39Visibility?.();
      }
    };
    confirm.addEventListener("click",()=>{
      if(!pendingSite)return;
      const state=read();
      const owner=state.players.find(player=>player.id===ownerId);
      const target=state.players.find(player=>player.id===pendingSite.p.id);
      if(!owner||!target||!spyDestinations(owner,target).some(v=>v.id===pendingSite.v.id&&tileKey(v)===tileKey(pendingSite.v))){
        pendingSite=null;
        highlight.selectedTileKeys=[];
        confirm.disabled=true;
        prompt.textContent="この拠点は現在選択できません。別の拠点を選んでください。";
        window.renderV39Visibility?.();
        return;
      }
      draft.site=pendingSite.key;
      finish(true);
    },{signal});
    cancel.addEventListener("click",()=>finish(true),{signal});
    window.addEventListener("keydown",event=>{
      if(event.key!=="Escape")return;
      event.preventDefault();event.stopImmediatePropagation();finish(true);
    },{signal,capture:true});
    for(const name of ["v39:save-loaded","v39:field-generated","v39:field-layer-changed"]){
      window.addEventListener(name,()=>finish(false),{signal});
    }
    window.addEventListener("v39:game-state-changed",()=>{
      const state=read();
      if(state.activePlayerId!==ownerId||state.timeline?.phase!=="player")finish(false);
    },{signal});
    host.close();
    const focus=sites.find(site=>site.key===draft.site)||sites[0];
    focusV39MapTile(focus.v,{worldId:"surface"});
    window.renderV39Visibility?.();
    cancel.focus();
  }
  function render(){
    const state=read(),owner=state.players.find(p=>p.id===ownerId);
    if(!owner||state.activePlayerId!==ownerId){host.close();return;}
    const f=owner.factionState,ops=f.spyOperations||{};
    const target=targetId?state.players.find(p=>p.id===targetId):null;
    if(targetId&&!target){host.close();return;}
    const agents=(ops.agents||[]).filter(agent=>!targetId||agent.targetId===targetId);
    const overviewTab=tab==="概要",resultsTab=tab==="調査結果";
    const reportTab=tab==="報告",defenseTab=tab==="防諜";
    const bases=target?spyDestinations(owner,target):[];
    const reportsByBase=new Map();
    if(resultsTab){
      for(const entry of ops.intel||[]){
        if(entry.targetId!==targetId)continue;
        const entries=reportsByBase.get(entry.settlementId)||[];
        entries.push(entry);
        reportsByBase.set(entry.settlementId,entries);
      }
    }
    let rows;
    if(overviewTab){
      rows=bases.map(base=>({id:base.id,label:base.name,metrics:[`(${base.x}, ${base.y})`]}));
    }else if(resultsTab){
      rows=[...reportsByBase].map(([id,entries])=>({
        id,entries,label:bases.find(base=>base.id===id)?.name||entries.at(-1)?.settlementName||"拠点の記録",
        metrics:[`${entries.length}件`]
      }));
    }else if(reportTab){
      rows=(ops.intel||[]).map((entry,i)=>({id:String(i),entry,label:"T"+entry.turn+"　"+(entry.mission||"任務報告"),
        metrics:[state.players.find(p=>p.id===entry.targetId)?.label||entry.targetId]})).reverse();
    }else if(defenseTab){
      rows=f.units.filter(u=>Number(u.hp??u.currentHp)>0).map(unit=>({id:unit.id,unit,meta:unit.spySearch?"捜索ON":"捜索OFF"}));
      for(const captive of f.villagePrisoners||[])if(captive.spyCapture)rows.push({id:"captive/"+captive.unit.id,unit:captive.unit,captive,meta:"捕虜"});
    }else{
      rows=[...f.units.filter(availableSpy).map(unit=>({id:unit.id,unit,meta:"派遣可能"})),
        ...agents.map(agent=>({id:agent.unit.id,unit:agent.unit,agent,meta:agent.stage+"　"+agent.mission+" "+Math.floor(agent.progress)+"%"}))];
    }
    const row=rows.find(r=>r.id===selection[tab])||rows[0];
    selection[tab]=row?.id;
    const detail={kind:"item",selectedId:row?.id,heading:row?.unit?.name||row?.label,facts:[],controls:[],sections:[],
      emptyText:overviewTab?"判明した拠点はありません。":resultsTab?"この勢力の調査結果はまだありません。":reportTab?"任務報告はまだありません。":defenseTab?"防諜を担当できるユニットはいません。":"派遣には隠密・変装がともに150以上必要です。"};
    commands=new Map();
    const actions=[],notes=[];
    function action(id,label,fn,reason=""){
      if(state.timeline?.phase!=="player")reason="自勢力の操作ターンに指示できます。";
      actions.push({id,label,disabled:!!reason});
      if(reason){if(!notes.includes(reason))notes.push(reason);}
      else commands.set(id,fn);
    }
    if(overviewTab){
      const sight=f.factionSightings?.[targetId];
      const worldId=sight?.worldId||"surface";
      const sameMap=(state.activeWorldId||"surface")===worldId;
      const settlements=bases.map(base=>{
        const reports=(ops.intel||[]).filter(entry=>entry.targetId===targetId&&entry.settlementId===base.id);
        const intel={};
        for(const [key] of settlementIntelGroups.flatMap(group=>group.keys)){
          const report=reports.findLast(entry=>entry.settlementIntel?.[key]!==undefined);
          if(report)intel[key]={turn:report.turn,data:report.settlementIntel[key]};
        }
        return {
          name:base.name,settlementId:base.id,x:base.x,y:base.y,worldId:base.worldId,
          ...intel.population?.data?.base,...intel.territory?.data?.base,
          ...intel.operations?.data?.base,...intel.facilities?.data?.base,intel
        };
      });
      const settlement=settlements.find(base=>base.settlementId===row?.id);
      let unitsPage="";
      if(settlement&&settlementPage==="units"){
        const reported=settlement.intel.units;
        const units=new Map((reported?.data?.units||[]).map(unit=>[unit.id,{unit,turn:reported.turn}]));
        if((settlement.worldId||"surface")===(state.activeWorldId||"surface")){
          const visible=getV39SettlementIntelUnits(target,settlement).filter(unit=>
            window.isV39TileInCurrentVision?.(unit.x,unit.y)===true&&window.isV39EntityDetected?.(unit)===true);
          for(const unit of snapshotV39SettlementIntelUnits(target,visible))units.set(unit.id,{unit,visible:true});
        }
        const ordered=[...units.values()].sort((a,b)=>Number(Boolean(b.unit.roles?.length))-Number(Boolean(a.unit.roles?.length)));
        const selection=units.get(surveyedUnitId)??ordered[0];
        const cards=ordered.map(({unit,turn,visible})=>renderV39UnitCard(unit,{
          attribute:"data-v39-surveyed-roster-unit",selected:unit.id===selection?.unit.id,portrait:true,
          collapseUnselected:false,position:[...(unit.roles||[]),visible?"視認中":`調査 T${turn}`].join(" · "),snapshot:true,turnNumber:turn,
          showVitals:unit.hp!=null&&unit.maxHp!=null
        })).join("");
        unitsPage=cards?renderV39StoragePanes(cards,renderSurveyedUnitDetail(selection?.unit))
          :`<p>${reported?"調査で確認されたユニットはいません。":"視認・調査で判明したユニットはいません。"}</p>`;
      }
      const view=settlement?renderV39SettlementView({state,player:target,settlements,settlement,
        activePage:settlementPage,openSections:openSettlementSections,intel:settlement.intel,facilityId:surveyedFacilityId,unitsPage})
        :'<p>判明した拠点はありません。</p>';
      const report=settlement?.intel.facilities;
      const storageFacility=surveyedStorageId&&report?.data?.base&&
        getV39SettlementFacilities(state,targetId,settlement).find(facility=>facility.id===surveyedStorageId);
      const storedUnits=storageFacility?(report.data.storage||[]).filter(entry=>
        entry.tileKey===storageFacility.tileKey&&entry.facilityName===storageFacility.name):[];
      const selectedIndex=storedUnits[storedUnitIndex]?storedUnitIndex:0;
      const entry=storedUnits[selectedIndex];
      const unit=entry?.unit||entry;
      const cards=storedUnits.map((record,index)=>renderV39UnitCard(record.unit||record,{
        id:index,attribute:"data-surveyed-unit",selected:index===selectedIndex,portrait:true,
        collapseUnselected:false,position:"格納中",snapshot:true,turnNumber:report.turn,showVitals:!!record.unit
      })).join("");
      const unitDetail=renderSurveyedUnitDetail(unit);
      const bodyMarkup=storageFacility?`<div class="v39-spy-settlement-overview">
        <div class="v39-spy-overview-summary">
          <strong>${escape(storageFacility.name)} (${escape(storageFacility.tileKey)})</strong>
          <span>調査 T${escape(report.turn)}</span>
          <button type="button" class="v39-summon-action" data-surveyed-storage-back>施設へ戻る</button>
        </div>
        ${renderV39StoragePanes(cards||"<p>格納中のユニットはいません。</p>",unitDetail)}
        </div>`:`<div class="v39-spy-settlement-overview">
        <div class="v39-spy-overview-summary">
          <span>種族 ${escape(target.race||"未設定")}</span>
          ${sight?`<span>最終確認 T${escape(sight.turn)} / ${worldId==="surface"?"地上":"別マップ"} (${escape(sight.x)}, ${escape(sight.y)})</span>
          <button type="button" class="v39-summon-action" data-v39-item-list-action="locate"${sameMap?"":" disabled"}>地図で見る</button>`:""}
          <button type="button" class="v39-summon-action" data-v39-item-list-action="back">戻る</button>
        </div>
        ${sight&&!sameMap?"<p>視認したマップに切り替えると位置を確認できます。</p>":""}
        ${message?`<p role="status">${escape(message)}</p>`:""}
        <div class="settlement-panel">${view}</div></div>`;
      updateV39RetainedMarkup(host,renderV39ItemListScreen1({title:target.label,titleId:"v39-spy-title",tabs,activeTab:tab,bodyMarkup}));
      return;
    }else if(resultsTab){
      if(row)detail.sections=[...row.entries].reverse().map(entry=>({
        label:`T${entry.turn}　${entry.mission||"任務報告"}`,lines:[entry.message]
      }));
    }else if(row?.entry){
      detail.sections.push({label:"取得情報",lines:[row.entry.message]});
    }else if(row?.captive){
      detail.facts.push({label:"所属",value:state.players.find(p=>p.id===row.captive.ownerPlayerId)?.label||row.captive.ownerPlayerId});
      action("publicize","所属を公表",(s,p)=>publicizeSpy(s,p,row.unit.id),row.captive.publicized?"所属は公表済みです。":"");
    }else if(row&&defenseTab){
      const u=row.unit,tile=u.x+","+u.y;
      detail.facts.push({label:"残AP",value:ap(u)},{label:"スパイ捜索",value:u.spySearch?"ON":"OFF"});
      const until=ops.alerts?.[tile];
      if(until>=state.timeline.turnNumber)detail.facts.push({label:"警戒期間",value:"T"+until+"まで"});
      action("search",u.spySearch?"捜索をOFF":"捜索をON",(_,p)=>{
        const unit=p.factionState.units.find(v=>v.id===u.id);
        if(!unit)return false;
        unit.spySearch=!unit.spySearch;return true;
      });
      if(ownTile(state,owner,u))action("alert","この土地を警戒",(s,p)=>{
        const unit=p.factionState.units.find(v=>v.id===u.id);
        if(!unit||!ownTile(s,p,unit)||ap(unit)<spyBalance.alertAp)return false;
        unit.ap=unit.currentAp=unit.actionPoint=ap(unit)-spyBalance.alertAp;
        p.factionState.spyOperations.alerts[unit.x+","+unit.y]=s.timeline.turnNumber+2;return true;
      },ap(u)<spyBalance.alertAp?"警戒にはAP"+spyBalance.alertAp+"が必要です。":"");
    }else if(row){
      const {agent,unit}=row;
      detail.facts.push({label:"残AP",value:ap(unit)});
      if(agent){
        detail.facts.push({label:"状態",value:agent.stage},{label:"任務",value:agent.mission},
          {label:"進捗",value:Math.floor(agent.progress)+"%"});
        if(agent.remaining>0)detail.facts.push({label:"移動",value:"残"+agent.remaining+"T"});
        if(agent.armyReport)detail.sections.push({label:"軍隊情報",lines:[agent.armyReport]});
      }
      if(!agent||agent.stage==="現地滞在"){
        const draft=orders.get(unit.id)||{};orders.set(unit.id,draft);
        function control(id,label,choices){
          if(!choices.some(v=>v.value===draft[id]))draft[id]=choices[0]?.value||"";
          if(choices.length)detail.controls.push({id,label,options:choices,value:draft[id]});
        }
        control("mission","任務",sameLabels(spyMissionNames(unit)));
        const sites=(target?[target]:state.players.filter(p=>p.id!==owner.id)).flatMap(p=>spyDestinations(owner,p).map(v=>({p,v,key:JSON.stringify([p.id,v.id])})));
        const site=sites.find(s=>s.key===draft.site);
        detail.facts.push({label:"対象拠点",value:site?site.p.label+"　"+site.v.name+" ("+site.v.x+","+site.v.y+")":"未選択"});
        const pickReason=!sites.length?"他勢力の拠点を発見すると選択できます。":
          (state.activeWorldId||"surface")!=="surface"?"地上のフィールドで対象拠点を選べます。":"";
        action("pick-site","フィールドで選ぶ",()=>pickTarget(sites,draft),pickReason);
        control("subject","調査・工作対象",site?options(spySubjectOptions(state,owner,site.p,site.v,draft.mission)):[]);
        control("after","完了後",sameLabels(["帰還","現地滞在"]));
        action("dispatch","任務を指示",(s,p)=>dispatchSpy(s,p,{unitId:unit.id,targetId:site.p.id,settlementId:site.v.id,
          mission:draft.mission,subject:draft.subject,after:draft.after}),!site?(sites.length?"フィールドで対象拠点を選んでください。":pickReason):
          draft.mission==="破壊工作"&&!draft.subject?"工作できる施設が判明していません。":"");
      }
      const mission=(!agent||agent.stage==="現地滞在")?orders.get(unit.id)?.mission:agent.mission;
      if(missionDescriptions[mission])detail.sections.unshift({label:"任務の効果",lines:[missionDescriptions[mission]]});
      if(agent?.stage==="任務中")action("work","残APで任務を進める",(s,p)=>continueSpy(s,p,unit.id),ap(unit)>0?"":"任務を進めるAPがありません。");
      if(agent&&agent.stage!=="帰還")action("recall","帰還を指示",(_,p)=>recallSpy(p.factionState,unit.id));
    }
    actions.unshift({id:"back",label:"戻る",destination:targetId?"interaction":"faction-info"});
    updateV39RetainedMarkup(host,renderV39ItemListScreen1({title:target?.label||"諜報",titleId:"v39-spy-title",tabs,activeTab:tab,rows,detail,actions,footerNotes:notes,status:message}));
  }
  host.addEventListener("close",()=>{if(!host.open&&!mapSelection)host.remove();});
  host.addEventListener("change",event=>{
    if(!(event.target instanceof HTMLSelectElement))return;
    const choice=readV39ItemListAction(event.target),draft=orders.get(selection[tab]);
    if(!choice||!draft)return;
    draft[choice.id]=choice.value;message="";render();
  });
  host.addEventListener("toggle",event=>{
    const fold=event.target;
    if(!fold.isConnected||!fold.dataset?.settlementFold)return;
    if(fold.open)openSettlementSections.add(fold.dataset.settlementFold);
    else openSettlementSections.delete(fold.dataset.settlementFold);
  },true);
  host.addEventListener("cancel",event=>{
    if(tab!=="概要"||!surveyedStorageId)return;
    event.preventDefault();
    surveyedStorageId=undefined;
    render();
  });
  host.addEventListener("click",event=>{
    if(tab==="概要"){
      const rosterButton=event.target.closest("[data-v39-surveyed-roster-unit]");
      if(rosterButton){
        surveyedUnitId=rosterButton.dataset.v39SurveyedRosterUnit;
        render();return;
      }
      const unitButton=event.target.closest("[data-surveyed-unit]");
      if(unitButton){
        storedUnitIndex=Number(unitButton.dataset.surveyedUnit);
        render();return;
      }
      const storageButton=event.target.closest("[data-surveyed-storage],[data-surveyed-storage-back]");
      if(storageButton){
        surveyedStorageId=storageButton.dataset.surveyedStorage;
        storedUnitIndex=0;
        render();
        host.querySelector(surveyedStorageId?"[data-surveyed-storage-back]":"[data-surveyed-storage]")?.focus();
        return;
      }
      const button=event.target.closest("[data-settlement-id],[data-settlement-page-select],[data-settlement-facility]");
      if(button){
        if(button.dataset.settlementId){selection[tab]=button.dataset.settlementId;surveyedFacilityId=undefined;surveyedUnitId=undefined;}
        if(button.dataset.settlementPageSelect)settlementPage=button.dataset.settlementPageSelect;
        if(button.dataset.settlementFacility)surveyedFacilityId=button.dataset.settlementFacility;
        render();return;
      }
    }
    if(event.target.closest("select"))return;
    const choice=readV39ItemListAction(event.target);if(!choice)return;
    const {id,value}=choice;message="";
    if(id==="close"||id==="back"){host.close();if(id==="back")onBack?.();return;}
    if(id==="locate"){
      const state=read();
      const sight=state.players.find(p=>p.id===ownerId)?.factionState.factionSightings?.[targetId];
      if(sight&&state.activePlayerId===ownerId&&focusV39MapTile(sight,{worldId:sight.worldId||"surface",select:true})){
        host.close();
      }else{message="現在のマップでは位置を表示できません。";render();}
      return;
    }
    if(id==="tab"){tab=value;surveyedStorageId=undefined;}
    else if(id==="candidate")selection[tab]=value;
    else {
      const command=commands.get(id);
      if(!command)return;
      const state=read(),owner=state.players.find(p=>p.id===ownerId);
      const canAct=owner&&state.activePlayerId===ownerId&&state.timeline?.phase==="player";
      if(id==="pick-site"&&canAct&&!window.isV39MapInputLocked?.()){
        command();return;
      }
      if(id!=="pick-site"&&canAct&&command(state,owner)){
        window.setV39GameState({players:state.players,diplomacyRelations:state.diplomacyRelations},{reason:"spy-order"});
      }else message="現在の状態では実行できません。";
    }
    render();
  });
  render();host.showModal();
}
