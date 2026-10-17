import {V39_SQUAD_MOVEMENT_BALANCE as balance} from "./v39-gameplay-balance.js";
import {getV39SquadUnitIds, isV39CargoEmpty, mergeV39Cargo} from "./v39-logistics-state.js";
import {resolveV39CaveFormation} from "./v39-cave-formation-rules.js";
import {inspectV39SquadAssembly} from './v39-squad-coordination.js';

const solo = id => !id || id === "solo" || id === "単独";
const world = unit => unit.worldId || "surface";
export function getV39EditableSquads(faction) {
  const rows=(faction.squads || []).map(row=>({...row,id:String(row.id || row.squadId),unitIds:getV39SquadUnitIds(row)}));
  const assigned=new Set(rows.flatMap(row=>row.unitIds));
  for(const unit of faction.units || []) {
    if(assigned.has(unit.id)) continue;
    const id=solo(unit.squadId)?"solo":unit.squadId;
    let row=rows.find(row=>row.id===id);
    if(!row){row={id,label:id==="solo"?"単独":id,unitIds:[]};rows.push(row);}
    row.unitIds.push(unit.id);assigned.add(unit.id);
  }
  return rows;
}

export function getV39SquadMemberRestriction(faction,unit,worldId) {
  if(!(Number(unit.hp ?? unit.currentHp)>0) || unit.state==="死亡") return "死亡";
  if(world(unit)!==worldId) return "別マップ";
  if(unit.tradeAssignment || unit.transportAssignment || unit.caveDuty || [...Object.values(faction.recruitInstructorByTile || {}),
    ...Object.values(faction.recruitInstructorTransfers || {})].some(row=>row.unitId===unit.id)) return "自動任務中（先に解除）";
  return "";
}

export function editV39Squad(state,playerId,request,map=null,{joiningByMagic=false}={}) {
  const fail=reason=>({ok:false,state,reason});
  const player=state.players?.find(row=>row.id===playerId);
  if(!player || state.activePlayerId && state.activePlayerId!==playerId) return fail("操作中の勢力を選んでください");
  const faction=player.factionState,rows=getV39EditableSquads(faction);
  const existing=rows.find(row=>row.id===request.squadId && !solo(row.id));
  if(request.squadId && !existing) return fail("部隊が見つかりません");
  if(request.disband && !existing) return fail("解散する部隊を選んでください");
  const ids=[...new Set(request.disband?[]:request.unitIds || [])];
  if(!request.disband && !ids.length) return fail('部隊のメンバーを選んでください');
  const members=ids.map(id=>faction.units.find(unit=>unit.id===id));
  if(members.some(unit=>!unit)) return fail("ユニットが見つかりません");
  if(members.filter(unit=>!unit.summon).length>balance.maxMembers)return fail(`通常の部隊員は${balance.maxMembers}体まで（召喚ユニットは別枠）`);
  const worldId=state.activeWorldId || "surface";
  const original=getV39SquadUnitIds(existing);
  for(const unit of members) {
    if(joiningByMagic&&original.includes(unit.id))continue;
    const reason=getV39SquadMemberRestriction(faction,unit,worldId);
    if(reason) return fail(`${unit.name || unit.id}：${reason}`);
  }
  const changed=ids.length!==original.length || ids.some(id=>!original.includes(id));
  const joining=ids.some(id=>!original.includes(id));
  const rallyStarted=joining&&!joiningByMagic;
  if(rallyStarted){const check=inspectV39SquadAssembly(state,playerId,members,map);if(!check.ok)return fail(check.reason);}
  // 共有荷物は分割先が未指定。移籍時に消失・複製しないよう荷下ろしを先に行う。
  if(changed && rows.some(row=>!isV39CargoEmpty(row.cargo) && (row===existing || row.unitIds.some(id=>ids.includes(id)&&row.id!==existing?.id))))
    return fail("編制を変える部隊の運搬品を先に荷下ろししてください");
  // LANのHTTPではrandomUUIDが使えない。現在の部隊と衝突しないIDを補完する。
  const baseId=existing?.id||`squad-${globalThis.crypto?.randomUUID?.()||`${playerId}-${Date.now()}`}`;
  let id=existing?.id||baseId,suffix=0;
  while(!existing&&rows.some(row=>row.id===id))id=`${baseId}-${++suffix}`;
  const leader=ids.includes(request.movementLeaderId)?request.movementLeaderId:ids.includes(existing?.movementLeaderId)?existing.movementLeaderId:ids[0];
  const departing=new Set([...original.filter(unitId=>!ids.includes(unitId)),...ids]);
  const units=faction.units.map(unit=>{
    if(!departing.has(unit.id)) return unit;
    const next={...unit,squadId:ids.includes(unit.id)?id:"solo",solo:false,isSolo:false,
      ...(!ids.includes(unit.id)?{squadMoveMode:'independent',squadGather:null}:rallyStarted?{squadMoveMode:'gather',squadGather:{status:'moving',reason:'',lastProcessedTurn:0}}:{})};
    delete next.squadLeaderId;delete next.squads;
    return next;
  });
  let personal={},cargo=existing?.cargo;
  for(const row of rows) for(const unitId of ids) {
    if(row.cargoByUnitId?.[unitId]){cargo=mergeV39Cargo(cargo,row.cargoByUnitId[unitId]);personal[unitId]=true;}
  }
  const squads=rows.filter(row=>row.id!==existing?.id).map(row=>{
    const cargoByUnitId={...row.cargoByUnitId};
    for(const unitId of ids) if(personal[unitId]) delete cargoByUnitId[unitId];
    return {...row,unitIds:row.unitIds.filter(unitId=>!departing.has(unitId)),cargoByUnitId};
  });
  if(ids.length) squads.push({...existing,id,label:String(request.label || existing?.label || "新部隊").trim() || "新部隊",
    unitIds:ids,movementLeaderId:leader,...resolveV39CaveFormation({formationType:request.formationType || existing?.formationType},[leader,...ids.filter(id=>id!==leader)]),
    ...(rallyStarted?{rallyPoint:{x:members.find(unit=>unit.id===leader).x,y:members.find(unit=>unit.id===leader).y,worldId}}:{}),cargo,cargoByUnitId:{}});
  let single=squads.find(row=>row.id==="solo");
  if(!single){single={id:"solo",label:"単独",unitIds:[]};squads.push(single);}
  single.cargoByUnitId={...single.cargoByUnitId};
  for(const unitId of original.filter(unitId=>!ids.includes(unitId))) {
    if(existing?.cargoByUnitId?.[unitId]) single.cargoByUnitId[unitId]=mergeV39Cargo(single.cargoByUnitId[unitId],existing.cargoByUnitId[unitId]);
  }
  single.unitIds.push(...original.filter(unitId=>!ids.includes(unitId)));
  // 未登録の旧データを補完し、空の元部隊は残さない。
  const assigned=new Set(squads.flatMap(row=>row.unitIds));
  single.unitIds.push(...units.filter(unit=>!assigned.has(unit.id)).map(unit=>unit.id));
  const next={...faction,units,squads:squads.filter(row=>row.id==="solo"||row.unitIds.length),selectedUnitId:ids[0] || faction.selectedUnitId};
  return {ok:true,rallyStarted,squadId:ids.length?id:"solo",state:{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:next}:row)}};
}
