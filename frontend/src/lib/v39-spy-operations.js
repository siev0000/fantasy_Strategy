import {captureV39SettlementIntel,getV39SettlementIntelUnits} from "./v39-settlement-intel.js";
import {resolveV39MovementTiles} from "./v39-gameplay-balance.js";
import {resolveV39AutomaticRoute} from "./v39-transport-rules.js";
import {resolveV39UnitMovementStepCost,resolveV39TileTerrainName} from "./v39-terrain-traversal.js";
import {applyV39DisasterMovementDamage} from "./v39-disaster-damage.js";
import missions from "../../../config/v39-spy-missions.json";
import {advanceSpyProgress, qualifiesForSpyMission, spyAvoidancePercent, spyEscapePercent} from "./v39-spy-rules.js";
import {getHexDistance} from "./hex-grid.js";
import {damageV39FacilityHealth} from "./v39-facility-health.js";
import {factionOpinion,getV39DiplomacyRelation} from "./v39-diplomacy-rules.js";
import {isDetectedByScout, resolveDetectionScoutValue, resolveV39UnitVisionRange} from "./v39-detection-rules.js";
import {addResearchExperience,findResearchItem,inspectResearchUnlock,isResearchCompleted,normalizeResearchState,requiredResearchExp,researchExperiencePerTurn} from "./research-progress.js";

export const spyBalance = {referenceTiles:7, minimumAreaRate:0.5, maximumAreaRate:2, baseDifficulty:100, theftSkillPerItem:20, masterThiefItems:2, alertAp:100};
export const spySubjects = {
  偵察:["ユニット","施設","領土"], 内政調査:["人口・幸福度","資源・備蓄","施設・生産"],
  技術調査:["研究中","習得済み","研究施設"], 情報網構築:[], 破壊工作:[], 物資妨害:[], 扇動:["住民"],
  物資窃盗:[], 装備窃盗:[], 複数装備窃盗:[], 希少品窃盗:[], 軍隊潜入:[]
};
const turnOf = state => Number(state.timeline?.turnNumber)||1;
const key = pos => pos.x+","+pos.y;
const skill = (u,k) => Number(u?.skillLevels?.[k]??u?.status?.[k])||0;
const speed = u => Number(u?.status?.移動??u?.movement)||1;
const travel = (u,a,b) => Math.ceil(getHexDistance(a,b)/resolveV39MovementTiles(speed(u)));
const ap = u => Math.max(0,Number(u.ap??u.currentAp)||0);
const setAp = (u,value) => {u.ap=u.currentAp=u.actionPoint=value;};
const living = u => Number(u.hp??u.currentHp)>0 && u.state!=="死亡";
const surface = u => (u.worldId||"surface")==="surface" && Number.isInteger(u.x)&&Number.isInteger(u.y);
const members = squad => squad.unitIds||[];
const localUnits = (target,village) => target.factionState.units.filter(u=>living(u)&&surface(u)&&(u.settlementId===village.id||key(u)===key(village)));
const ops = f => f.spyOperations ||= {agents:[],intel:[],networks:[],alerts:{}};
const home = (f,pos) => f.settlements.filter(surface).sort((a,b)=>getHexDistance(a,pos)-getHexDistance(b,pos))[0];
const stationed = (f,id) => ops(f).agents.find(a=>a.unit.id===id);
const visibleSettlement = (f,v) => f.factionSightings?.[v.ownerPlayerId] && (f.visibility?.exploredTileKeys||[]).includes(key(v));
export function spyDestinations(owner,target) {
  const f=owner.factionState, sight=f.factionSightings?.[target.id];
  if(!sight)return [];
  return target.factionState.settlements.filter(v=>surface(v)&&(visibleSettlement(f,v)||ops(f).intel.some(i=>i.settlementId===v.id)||(sight.worldId||"surface")==="surface"&&key(v)===key(sight)));
}
export function availableSpy(u) {
  return qualifiesForSpyMission(u)&&surface(u)&&!u.spyRetreat&&!u.boardingPilot&&!u.tradeAssignment&&!u.transportAssignment&&!u.caveDuty&&!u.pendingTeleport;
}
function record(f,a,turn,settlementName,message) {
  const list=ops(f).intel;
  list.push({turn,message,mission:a.mission,settlementName,settlementId:a.settlementId,targetId:a.targetId});
}
function changeRelation(state,a,b,amount) {
  const r=getV39DiplomacyRelation(state,a,b);
  const updated=Math.max(-100,Math.min(100,factionOpinion(r,a)+amount));
  state.diplomacyRelations={...state.diplomacyRelations,[r.pairKey]:{...r,opinionAdjustments:{...r.opinionAdjustments,[a]:updated-r.relationValue}}};
}
export function publicizeSpy(state,owner,unitId) {
  const row=owner.factionState.villagePrisoners?.find(p=>p.unit.id===unitId&&p.spyCapture&&!p.publicized);
  if(!row)return false;
  row.publicized=true;
  for(const other of state.players)if(other.id!==row.ownerPlayerId)changeRelation(state,other.id,row.ownerPlayerId,-5);
  return true;
}
function dropAgent(f,a) {ops(f).agents=ops(f).agents.filter(row=>row!==a);}
function emerge(f,a,pos) {
  Object.assign(a.unit,{x:pos.x,y:pos.y,position:[pos.x,pos.y],worldId:"surface"});
  const squad=f.squads.find(s=>s.id===a.unit.squadId)||f.squads.find(s=>s.id==="solo");
  a.unit.squadId=squad?.id||"solo";
  if(squad)squad.unitIds=[...new Set([...members(squad),a.unit.id])];
  f.units.push(a.unit);
  dropAgent(f,a);
}
function returnHome(f,a) {
  const dest=home(f,a);
  if(!dest){emerge(f,a,a);return;}
  a.stage="帰還";a.home={x:dest.x,y:dest.y};a.remaining=travel(a.unit,a,dest);
  if(!a.remaining)emerge(f,a,dest);
}
export function recallSpy(f,id) {
  const a=stationed(f,id);
  if(!a||a.stage==="帰還")return false;
  returnHome(f,a);return true;
}
const thief = u => u?.className==="怪盗" || Number(u?.derivedCharacter?.prerequisiteClassLevels?.怪盗??u?.prerequisiteClassLevels?.怪盗)>0;
export function spyMissionNames(unit){
  return Object.keys(spySubjects).filter(name=>!["複数装備窃盗","希少品窃盗"].includes(name)||thief(unit));
}
function facilityDamage(v,a,turn) {
  const [tile,name]=JSON.parse(a.subject);
  const health=v.facilityStateByTile?.[tile]?.[name];
  if(!health)return false;
  const scale=a.progress>=100?1:a.progress>=90?0.5:a.progress>=50?0.25:0;
  if(scale)v.facilityStateByTile[tile][name]=damageV39FacilityHealth(health,health.maxHp*scale,turn,"破壊工作").health;
  return true;
}
const bagText = bag => Object.entries(bag||{}).map(([k,v])=>k+" "+v).join("、")||"なし";
function finish(state,owner,target,v,a,turn,map,economyTurn) {
  const f=owner.factionState,tf=target.factionState,u=a.unit, subject=a.subject;
  const facilities=Object.entries(v.facilityStateByTile||{}).flatMap(([pos,rows])=>Object.entries(rows).map(([name,h])=>name+" ("+pos+") "+h.status+" HP"+h.hp+"/"+h.maxHp));
  const research=tf.research||{};
  const destination=home(f,a);
  let result="";
  switch(a.mission){
    case "偵察":
      result=subject==="施設"?facilities.join("、"):subject==="領土"?(v.territoryTileKeys||[key(v)]).map(tile=>{const [x,y]=tile.split(",").map(Number);return tile+" "+resolveV39TileTerrainName(map,x,y)+" "+(state.territoryStateByTile?.[tile]?.hp??"");}).join("、"):getV39SettlementIntelUnits(target,v).map(unit=>unit.name+" ("+key(unit)+") "+(unit.className||"")+" Lv"+unit.level+" "+bagText(unit.status)).join("／");break;
    case "内政調査":
      result=subject==="人口・幸福度"?"人口 "+v.population+"　幸福度 "+(v.civicState?.happiness??v.happiness):subject==="資源・備蓄"?bagText({...v.foodStockByType,...v.materialStockByType}):facilities.join("、")+"　産出 "+bagText(v.lastEconomyDelta?.productionByType);break;
    case "技術調査": {
      const learned=research.progress?.completedByCategoryLevel||{};
      result=subject==="研究施設"?facilities.filter(s=>/研究/.test(s)).join("、"):subject==="習得済み"?Object.entries(learned).flatMap(([category,levels])=>Object.entries(levels).map(([lv,ids])=>category+" Lv"+lv+" "+ids.join("、"))).join("／"):bagText(research.selection)+"　"+bagText(research.progress?.targetExpMap);
      const ids=subject==="研究中"?Object.values(research.selection||{}):subject==="習得済み"?Object.values(learned).flatMap(levels=>Object.values(levels).flat()):[];
      const current=normalizeResearchState(f.research);
      const id=ids.find(id=>{const item=findResearchItem(id);return item&&!isResearchCompleted(current,item.categoryKey,item.level,id);});
      if(id){
        const {categoryKey:category,item,level}=findResearchItem(id);
        const amount=2*researchExperiencePerTurn(u,category,undefined,item);
        if(!inspectResearchUnlock(current,id).unlocked){
          current.progress.targetExpMap[id]=Math.min(requiredResearchExp(level),(current.progress.targetExpMap[id]||0)+amount);
          f.research=current;
        }else{
          const previous=current.selection[category];
          current.selection[category]=id;
          const gain=addResearchExperience(current,category,amount);
          if(previous&&previous!==id)gain.state.selection[category]=previous;
          else if(!previous)delete gain.state.selection[category];
          f.research=gain.state;
        }
        result+="　"+(item.name||id)+" 研究経験値＋"+amount;
      }
      break;
    }
    case "情報網構築":if(!ops(f).networks.includes(v.id))ops(f).networks.push(v.id);result="発見回避＋2%";break;
    case "破壊工作":result=facilityDamage(v,a,turn)?"施設を損壊":"対象施設は現存しません";break;
    case "物資妨害":v.spySupplyStart=economyTurn+1;v.spySupplyEnd=v.spySupplyStart+2;result="次の3ターンの産出半減";break;
    case "扇動":
      if(subject==="住民"){const civic=v.civicState||={};civic.happiness=Math.max(0,(civic.happiness??v.happiness??50)-10);result="幸福度−10";}
      else {changeRelation(state,target.id,subject,-10);result="友好度−10";}break;
    case "物資窃盗":{
      const bucket=Object.hasOwn(v.foodStockByType||{},subject)?"foodStockByType":"materialStockByType";
      const n=destination?Math.min(Number(v[bucket]?.[subject])||0,Math.max(1,Math.floor(skill(u,"早業")/spyBalance.theftSkillPerItem))):0;
      if(n){v[bucket][subject]-=n;destination[bucket][subject]=(destination[bucket][subject]||0)+n;}result=subject+" "+n;break;
    }
    case "複数装備窃盗":case "希少品窃盗":case "装備窃盗":{
      const list=(v.equipmentInventory||[]).filter(e=>e.count>0&&(["rare","epic","legendary","レア","エピック","レジェンダリー"].includes(e.quality||e.item?.quality)===(a.mission==="希少品窃盗")));
      const loot=[];
      if(destination)for(let i=0;i<(a.mission==="複数装備窃盗"?spyBalance.masterThiefItems:1);i++){
        const stack=list.find(e=>e.count>0);
        if(!stack)break;
        stack.count--;destination.equipmentInventory.push({...structuredClone(stack),count:1});loot.push(stack.name||stack.item?.name);
      }
      result=loot.join("、");break;
    }
  }
  record(f,a,turn,v.name,v.name+"　"+a.mission+"　"+(result||"該当なし"));
  const entry=ops(f).intel.at(-1);
  const parts=a.mission==="偵察"?{
    ユニット:["units"],施設:["facilities"],領土:["territory"]
  }[subject]:a.mission==="内政調査"?{
    "人口・幸福度":["population"],"資源・備蓄":["stocks"],"施設・生産":["facilities","production","operations"]
  }[subject]:null;
  if(parts)entry.settlementIntel=captureV39SettlementIntel(state,target,v,parts,map);
  if((a.mission==="偵察"&&subject==="施設")||(a.mission==="内政調査"&&subject==="施設・生産"))ops(f).intel.at(-1).facilities=structuredClone(v.tileFacilityMap||{});
  if(a.after==="帰還")returnHome(f,a);else a.stage="現地滞在";
}
function exposed(state,owner,target,v,a,turn,random) {
  const f=owner.factionState,tf=target.factionState;
  if(a.mission==="破壊工作"&&a.stage==="任務中")facilityDamage(v,a,turn);
  const chance=spyEscapePercent({spy:a.unit,location:a,enemies:tf.units.filter(surface),isArmyMember:u=>tf.squads.some(s=>s.id!=="solo"&&members(s).includes(u.id)),movementSpeed:speed,hasDisguisePassive:thief(a.unit)&&(a.unit.techniques||[]).some(t=>{const row=t.source||t;return row.行動==="P"&&[row.効果,row.スキル名,t.name].includes("変装");})});
  if(random()*100<chance){record(f,a,turn,v.name,a.unit.name+" は発見され、現地で逃走。自領へ撤退");emerge(f,a,a);a.unit.spyRetreat=true;}
  else {record(f,a,turn,v.name,a.unit.name+" が捕縛された");(tf.villagePrisoners||=[]).push({unit:a.unit,ownerPlayerId:owner.id,receivedTurn:turn,spyCapture:true});dropAgent(f,a);}
}
function work(state,owner,target,v,a,turn,random,map=globalThis.window?.__v39FieldRuntime?.mapData,economyTurn=turn) {
  if(ap(a.unit)<=0)return;
  const def=missions[a.mission],guard=def.concealment==="隠密"?"索敵":"看破";
  const locals=localUnits(target,v);
  const defense=Math.max(0,...locals.map(u=>skill(u,guard)))+((ops(target.factionState).alerts[key(a)]||0)>=turn?100:0);
  if(a.checkedTurn!==turn){
    a.checkedTurn=turn;
    if(random()*100>=spyAvoidancePercent(skill(a.unit,def.concealment)-defense,ops(owner.factionState).networks.includes(v.id))){exposed(state,owner,target,v,a,turn,random);return;}
  }
  const size=v.territoryTileKeys?.length||1;
  const governor=locals.find(u=>u.isSovereign);
  const difficulty=a.mission==="偵察"&&a.subject==="ユニット"&&locals.length?Math.max(...locals.map(u=>(skill(u,"隠密")+skill(u,"変装"))/2)):governor?skill(governor,"統治"):spyBalance.baseDifficulty;
  const p=advanceSpyProgress({mission:a.mission,spy:a.unit,difficulty,areaMultiplier:Math.max(spyBalance.minimumAreaRate,Math.min(spyBalance.maximumAreaRate,Math.sqrt(spyBalance.referenceTiles/size))),progress:a.progress,availableAp:ap(a.unit)});
  a.progress=p.progress;setAp(a.unit,ap(a.unit)-p.spent);
  if(p.progress>=100)finish(state,owner,target,v,a,turn,map,economyTurn);
}
export function spySubjectOptions(state,owner,target,v,mission){
  if(mission==="破壊工作"){
    const known={...(ops(owner.factionState).intel.findLast(entry=>entry.settlementId===v.id&&entry.facilities)?.facilities||{})};
    for(const tile of owner.factionState.visibility?.visibleTileKeys||[]){
      if(v.tileFacilityMap?.[tile])known[tile]=v.tileFacilityMap[tile];else delete known[tile];
    }
    return Object.entries(known).flatMap(([k,names])=>names.map(name=>[JSON.stringify([k,name]),name+" ("+k+")"]));
  }
  if(mission==="物資窃盗")return Object.keys({...v.foodStockByType,...v.materialStockByType}).map(k=>[k,k]);
  if(mission==="扇動")return [["住民","住民"],...state.players.filter(p=>p.id!==target.id).map(p=>[p.id,p.label])];
  return (spySubjects[mission]||[]).map(k=>[k,k]);
}
export function dispatchSpy(state,owner,{unitId,targetId,settlementId,mission,subject,after},random=Math.random){
  const f=owner.factionState,target=state.players.find(p=>p.id===targetId&&p.id!==owner.id);
  if(!target||!Object.hasOwn(spySubjects,mission)||!["帰還","現地滞在"].includes(after))return false;
  const v=spyDestinations(owner,target).find(v=>v.id===settlementId);
  if(!v)return false;
  const options=spySubjectOptions(state,owner,target,v,mission);
  if((options.length||mission==="破壊工作")&&!options.some(([id])=>id===subject))return false;
  let a=stationed(f,unitId);
  if(a&&(!spyMissionNames(a.unit).includes(mission)||a.stage!=="現地滞在"))return false;
  if(!a){
    const unit=f.units.find(u=>u.id===unitId&&availableSpy(u));if(!unit)return false;
    if(!spyMissionNames(unit).includes(mission))return false;
    a={unit,x:unit.x,y:unit.y,worldId:"surface"};ops(f).agents.push(a);
    f.units=f.units.filter(u=>u!==unit);
    f.squads=f.squads.map(s=>members(s).includes(unit.id)?{...s,unitIds:members(s).filter(id=>id!==unit.id)}:s);
    if(f.selectedUnitId===unit.id)f.selectedUnitId=f.units[0]?.id||"";
  }
  let destination={x:v.x,y:v.y};
  if(mission==="破壊工作"){
    const [x,y]=JSON.parse(subject)[0].split(",").map(Number);
    destination={x,y};
  }
  Object.assign(a,{targetId,settlementId,mission,subject,after,destination,progress:0,remaining:travel(a.unit,a,destination),stage:"移動中",armyReport:""});
  if(!a.remaining){Object.assign(a,destination);a.stage=mission==="軍隊潜入"?"編成待ち":"任務中";
    a.knownSquads=target.factionState.squads.map(s=>s.id);
    if(a.stage==="任務中")work(state,owner,target,v,a,turnOf(state),random);}
  return true;
}
export function continueSpy(state,owner,id){
  const a=stationed(owner.factionState,id);
  if(!a||a.stage!=="任務中"||ap(a.unit)<=0)return false;
  const target=state.players.find(p=>p.id===a.targetId);
  const village=target?.factionState.settlements.find(v=>v.id===a.settlementId);
  if(!village)return false;
  work(state,owner,target,village,a,turnOf(state),Math.random);return true;
}
export function searchForSpies(state,defender,turn,map,random=Math.random){
  const f=defender.factionState;
  if(ops(f).lastSearchTurn===turn)return false;
  const searchers=f.units.filter(u=>u.spySearch&&living(u)&&surface(u)&&ap(u)>=100);
  if(!searchers.length)return false;
  ops(f).lastSearchTurn=turn;
  for(const u of searchers){
    setAp(u,ap(u)-100);
    const visionRange=resolveV39UnitVisionRange(u,map);
    const candidates=state.players.flatMap(owner=>(owner.factionState.spyOperations?.agents||[]).filter(a=>
      a.targetId===defender.id&&["現地滞在","編成待ち","任務中"].includes(a.stage)&&getHexDistance(u,a)<=visionRange
    ).map(agent=>({owner,agent}))).sort((a,b)=>getHexDistance(u,a.agent)-getHexDistance(u,b.agent));
    const selected=candidates[0];
    if(!selected)continue;
    const {owner,agent}=selected,v=f.settlements.find(v=>v.id===agent.settlementId);
    if(v&&isDetectedByScout({scout:resolveDetectionScoutValue(u,map),stealth:skill(agent.unit,"隠密"),
      distance:getHexDistance(u,agent),inRange:true,mapData:map,from:u,to:agent,visionRange,gameSettings:state.gameSettings})){
      exposed(state,owner,defender,v,agent,turn,random);
    }
  }
  return true;
}
export function advanceSpyOperations(state,turn,map,random=Math.random){

  for(const player of state.players){
    const f=player.factionState;
    if(f.spyOperations?.lastTurn===turn)continue;
    for(const unit of f.units.filter(u=>u.spyRetreat&&living(u)&&surface(u))){
      const territory=state.territoryOwnerByTile||{};
      const goals=Object.entries(territory).filter(([,id])=>id===player.id).map(([tile])=>{
        const [x,y]=tile.split(",").map(Number);return {x,y};
      }).sort((a,b)=>getHexDistance(a,unit)-getHexDistance(b,unit));
      if(map&&territory[key(unit)]!==player.id){
        for(const goal of goals){
          const path=resolveV39AutomaticRoute(state,map,player.id,unit,goal,false);
          if(!path?.length)continue;
          for(const step of path){
            if(state.players.some(p=>p.factionState.units.some(u=>u!==unit&&surface(u)&&living(u)&&key(u)===key(step))))break;
            const cost=resolveV39UnitMovementStepCost(map,unit.x,unit.y,step.x,step.y,unit,state);
            if(!Number.isFinite(cost)||ap(unit)<cost)break;
            setAp(unit,ap(unit)-cost);
            Object.assign(unit,applyV39DisasterMovementDamage(unit,[step],state).unit);
            if(!living(unit)||territory[key(unit)]===player.id)break;
          }
          break;
        }
      }
      if(territory[key(unit)]===player.id)delete unit.spyRetreat;
    }
    if(player.isPlayer===false)searchForSpies(state,player,turn-1,map,random);
  }
  for(const owner of state.players){
    const f=owner.factionState;
    if(!f.spyOperations||f.spyOperations.lastTurn===turn)continue;
    f.spyOperations.lastTurn=turn;
    for(const a of [...ops(f).agents]){
      if(a.stage==="帰還"){if(--a.remaining<=0)emerge(f,a,a.home);continue;}
      const target=state.players.find(p=>p.id===a.targetId),v=target?.factionState.settlements.find(v=>v.id===a.settlementId);
      if(!v){returnHome(f,a);continue;}
      if(a.stage==="移動中"){
        if(--a.remaining>0)continue;
        Object.assign(a,a.destination||{x:v.x,y:v.y});a.stage=a.mission==="軍隊潜入"?"編成待ち":"任務中";a.knownSquads=target.factionState.squads.map(s=>s.id);continue;
      }
      const squads=target.factionState.squads.filter(s=>s.id!=="solo");
      if(a.stage==="潜入中"||a.stage==="編成待ち"){
        const group=a.stage==="潜入中"?squads.find(s=>s.id===a.squadId):squads.find(s=>!a.knownSquads.includes(s.id)&&target.factionState.units.some(u=>members(s).includes(u.id)&&surface(u)&&key(u)===key(a)));
        if(a.stage==="潜入中"&&!group){emerge(f,a,a);continue;}
        a.knownSquads=squads.map(s=>s.id);
        if(!group)continue;
        const units=target.factionState.units.filter(u=>members(group).includes(u.id));
        if(a.stage==="編成待ち"&&random()*100>=spyAvoidancePercent(skill(a.unit,"変装")-150-Math.max(0,...units.map(u=>skill(u,"看破"))))){exposed(state,owner,target,v,a,turn,random);continue;}
        a.squadId=group.id;a.stage="潜入中";if(units[0]){a.x=units[0].x;a.y=units[0].y;}
        a.armyReport=units.map(u=>u.name+" Lv"+u.level+" "+bagText(u.status)).join("／");continue;
      }
      if(a.stage==="任務中")work(state,owner,target,v,a,turn-1,random,map,turn);
    }
  }
}

