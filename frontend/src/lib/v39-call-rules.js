import {replaceV39CastOnAction} from './v39-casting-rules.js';
import {getGameDataRows} from './game-data-registry.js';
import {getV39UnitTestTechniques} from './v39-test-skill-rules.js';
import {resolveV39SummonPlacements} from './v39-summon-rules.js';
import {resolveV39SkillCooldownTurns} from './v39-turn-timing.js';
import {editV39Squad,getV39EditableSquads} from './v39-squad-edit-rules.js';
import {v39SquadMoveMode} from './v39-squad-coordination.js';

const number=value=>Math.max(0,Number(value)||0);
const world=unit=>unit.worldId||'surface';
export function parseV39CallEffect(row) {
  const match=String(row?.効果||'').match(/^呼集_([^_]+)(?:_数([1-9]\d*))?$/);
  if(!match||!Number.isSafeInteger(Number(match[2]||1)))return null;
  return {target:match[1],count:Number(match[2]||1)};
}
export function getV39CallEntries(unit) {
  const rows=[...(unit?.techniques||[]),...getV39UnitTestTechniques(unit)].map(item=>item.source||item);
  const unique=new Map(rows.filter(row=>String(row.行動).toUpperCase()==='A'&&String(row.効果||'').startsWith('呼集_')).map(row=>[row.名前,row]));
  return [...unique.values()].map(row=>({row,spec:parseV39CallEffect(row)}));
}
function matches(unit,target) {
  const names=[unit.race,unit.raceName,unit.className,...Object.keys(unit.prerequisiteClassLevels||{})];
  if(names.includes(target))return true;
  return getGameDataRows('クラス').some(row=>names.includes(row.名前)&&row.種類===target);
}
function prepareCallSquad(state,playerId,caster,selectedIds) {
  const faction=state.players.find(player=>player.id===playerId)?.factionState;
  const existing=getV39EditableSquads(faction).find(row=>!['solo','単独'].includes(row.id)&&row.unitIds.includes(caster.id));
  return editV39Squad(state,playerId,{
    squadId:existing?.id,label:existing?.label||`${caster.name||'呼集者'}の部隊`,
    unitIds:[...new Set([...(existing?.unitIds||[caster.id]),...selectedIds])],
    movementLeaderId:existing?.movementLeaderId||caster.id,formationType:existing?.formationType||'column'
  },null,{joiningByMagic:true});
}
export function inspectV39Call(state,playerId,unitId,skillName,map,selectedIds=[]) {
  const faction=state.players.find(player=>player.id===playerId)?.factionState;
  const caster=faction?.units.find(unit=>unit.id===unitId);
  const entry=getV39CallEntries(caster).find(item=>item.row.名前===skillName);
  const turn=number(state.timeline?.turnNumber),cost=number(entry?.row.AP消費),hpCost=number(entry?.row.HP消費),reasons=[];
  if(!caster||playerId!==state.activePlayerId||state.timeline?.phase!=='player'||number(caster.hp??caster.currentHp)<=0||world(caster)!==(state.activeWorldId||'surface'))reasons.push('操作中の生存ユニットが必要');
  if(!entry?.spec)reasons.push('呼集の書式が不正');
  if(caster?.waitTurnNumber===turn)reasons.push('待機済みです');
  if(number(caster?.ap??caster?.currentAp)<cost)reasons.push('AP不足');
  if(number(caster?.hp??caster?.currentHp)<=hpCost)reasons.push('HP不足');
  if(faction?.combatRuntime?.pendingActionsByUnitId?.[unitId]&&!faction.combatRuntime.pendingActionsByUnitId[unitId].aimAfterCast)reasons.push('別の行動を発動待機中');
  if(number(faction?.combatRuntime?.cooldownsByUnitId?.[unitId]?.[skillName])>turn)reasons.push('使用済みまたはCT中');
  const candidates=(faction?.units||[]).filter(unit=>unit.id!==unitId&&entry?.spec&&matches(unit,entry.spec.target)).map(unit=>{
    const unavailable=[];
    if(number(unit.hp??unit.currentHp)<=0||unit.state==='死亡')unavailable.push('死亡');
    if(world(unit)!==(state.activeWorldId||'surface'))unavailable.push('別ワールド');
    if(state.territoryOwnerByTile?.[`${unit.x},${unit.y}`]!==playerId)unavailable.push('自領土外');
    const instructor=[...Object.values(faction.recruitInstructorByTile||{}),...Object.values(faction.recruitInstructorTransfers||{})].some(row=>row.unitId===unit.id);
    if(unit.tradeAssignment||unit.transportAssignment||unit.caveDuty||instructor)unavailable.push('自動任務中');
    if(faction.combatRuntime?.pendingActionsByUnitId?.[unit.id])unavailable.push('発動待機中');
    return {unit,available:!unavailable.length,reasons:unavailable};
  });
  const ids=new Set(selectedIds),selected=selectedIds.map(id=>candidates.find(item=>item.unit.id===id));
  if(!selectedIds.length)reasons.push('呼ぶユニットを選択してください');
  if(ids.size!==selectedIds.length||selectedIds.length>(entry?.spec?.count||0))reasons.push('選択数が不正');
  if(selected.some(item=>!item?.available))reasons.push('呼集できない対象が選択されています');
  const squad=caster&&selectedIds.length&&selected.every(item=>item?.available)?prepareCallSquad(state,playerId,caster,selectedIds):null;
  if(squad&&!squad.ok)reasons.push(squad.reason);
  // 地形適性が異なる複数対象でも、割り当て順だけで配置失敗しないよう全組合せを調べる。
  const choices=map&&caster&&selected.every(item=>item?.available)?selected.map(item=>resolveV39SummonPlacements(state,map,caster,item.unit,ids)):[];
  function assign(index,used,tiles) {
    if(index===selected.length)return tiles;
    for(const tile of choices[index]||[])if(!used.has(tile.key)) {
      const found=assign(index+1,new Set([...used,tile.key]),[...tiles,tile]);
      if(found)return found;
    }
    return null;
  }
  const tiles=selected.length&&selected.length<=6?assign(0,new Set(),[]):null;
  if(selected.length&&!tiles)reasons.push('全員を配置できる隣接マスがありません');
  return {available:!reasons.length,reasons,caster,entry,candidates,cost,hpCost,tiles,squad};
}
export function callV39Units(state,playerId,unitId,skillName,map,selectedIds=[]) {
  const check=inspectV39Call(state,playerId,unitId,skillName,map,selectedIds);
  if(!check.available)return {ok:false,state,reason:check.reasons.join(' / ')};
  const player=check.squad.state.players.find(row=>row.id===playerId),faction=player.factionState,turn=state.timeline.turnNumber;
  const locations=new Map(selectedIds.map((id,i)=>[id,check.tiles[i]]));
  const original=state.players.find(row=>row.id===playerId).factionState;
  const hadParty=getV39EditableSquads(original).some(row=>!['solo','単独'].includes(row.id)&&row.unitIds.includes(unitId));
  const mode=hadParty?v39SquadMoveMode(check.caster):'follow';
  const movement={squadMoveMode:mode,squadGather:mode==='gather'?{status:'moving',reason:'',lastProcessedTurn:0}:null};
  const ap=number(check.caster.ap??check.caster.currentAp)-check.cost,hp=number(check.caster.hp??check.caster.currentHp)-check.hpCost;
  const units=faction.units.map(unit=>{
    if(unit.id===unitId)return {...unit,...(!hadParty?movement:{}),ap,currentAp:ap,actionPoint:ap,hp,currentHp:hp,lastActionTurn:turn,lastUsedAttack:skillName};
    const tile=locations.get(unit.id);
    return tile?{...unit,...movement,x:tile.x,y:tile.y,position:[tile.x,tile.y]}:unit;
  });
  const runtime=replaceV39CastOnAction(faction.combatRuntime,unitId);
  const squads=faction.squads.map(row=>row.movementLeaderId&&!row.unitIds.includes(row.movementLeaderId)
    ?{...row,movementLeaderId:row.unitIds[0]||''}:row);
  const next={...faction,selectedUnitId:original.selectedUnitId,units,squads,combatRuntime:{...runtime,cooldownsByUnitId:{...runtime.cooldownsByUnitId,[unitId]:{...runtime.cooldownsByUnitId?.[unitId],[skillName]:turn+resolveV39SkillCooldownTurns(check.entry.row)}}}};
  return {ok:true,state:{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:next}:row)},moved:units.filter(unit=>locations.has(unit.id)),squadId:check.squad.squadId,message:`${selectedIds.length}ユニットを呼び寄せ、部隊へ加入しました`};
}
