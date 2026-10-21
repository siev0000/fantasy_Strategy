// 専用テストの村にも使う、契約・休息強襲の状態遷移。乱数は呼び出し側から渡せる。
const alive = unit => Number(unit.hp ?? unit.currentHp) > 0 && unit.state !== '死亡';
const clamp = value => Math.max(-100, Math.min(100, Number(value) || 0));
const key = unit => `${unit.x},${unit.y}`;
const fail = (state, reason) => ({ok:false,state,reason});
export function replaceIncidentVillage(state, village) {
  return {...state,neutralVillages:state.neutralVillages.map(row=>row.id===village.id?village:row),
    settlements:(state.settlements||[]).map(row=>row.id===village.id?village:row)};
}
export function villageIncidentMode(village, balance) {
  if (!village.sacrificeContract?.active) return 'none';
  const relation=clamp(village.relationsByPlayerId?.[village.sacrificeContract.playerId]);
  return relation>=balance.supplyThreshold?'supply':relation<=balance.rescueThreshold?'rescue':'none';
}
export function villageAmbushPower(population, count, balance) {
  return count>0?balance.basePower*Math.sqrt(Math.max(0,population)/count/balance.populationDivisor):0;
}
export function villageRestParty(state, playerId, villageId) {
  const village=state.neutralVillages?.find(row=>row.id===villageId);
  const faction=state.players?.find(row=>row.id===playerId)?.factionState;
  const actor=faction?.units?.find(row=>row.id===faction.selectedUnitId);
  if(!village||!actor||!alive(actor))return [];
  const squad=faction.squads?.find(row=>row.id!=='solo'&&row.unitIds?.includes(actor.id));
  return (faction.units||[]).filter(unit=>(squad?squad.unitIds.includes(unit.id):unit.id===actor.id)&&alive(unit)
    && !unit.villageAmbushBattle && (unit.worldId||'surface')==='surface');
}
function holdTargets(state, village, playerId, held, remainingUnits) {
  held=held.map(row=>row.kind!=='captive'?row:{...row,unit:{...row.unit,hp:1,currentHp:1,state:'拘束',ap:0,currentAp:0,deadExpireTurn:null,deathTurn:null}});
  const ids=new Set(held.map(row=>row.unit.id));
  const players=state.players.map(player=>player.id!==playerId?player:{...player,factionState:{...player.factionState,
    units:remainingUnits,squads:(player.factionState.squads||[]).map(squad=>({...squad,unitIds:(squad.unitIds||[]).filter(id=>!ids.has(id))})),
    selectedUnitId:ids.has(player.factionState.selectedUnitId)?remainingUnits.find(alive)?.id||'':player.factionState.selectedUnitId}});
  return replaceIncidentVillage({...state,players},{...village,heldUnits:[...(village.heldUnits||[]),...held]});
}
export function restAtIncidentVillage(state, playerId, villageId, balance, random=Math.random) {
  if((state.activeWorldId||'surface')!=='surface'||state.timeline?.phase!=='player')return fail(state,'地上の操作ターンで休息してください');
  const village=state.neutralVillages?.find(row=>row.id===villageId),party=villageRestParty(state,playerId,villageId);
  if(village?.abandoned)return fail(state,'廃村では休息できません');
  if(!village||!party.length)return fail(state,'休息する部隊を選択してください');
  if(village.incidentByPlayerId?.[playerId]?.status==='choice'||village.incidentByPlayerId?.[playerId]?.status==='battle')return fail(state,'進行中の強襲に対応してください');
  if(party.some(unit=>!village.territoryTileKeys?.includes(key(unit))))return fail(state,'部隊全員が村の領域内にいる必要があります');
  if(party.some(unit=>Number(unit.ap??unit.currentAp)<balance.restApCost))return fail(state,'部隊全員に休息APが必要です');
  const turn=Number(state.timeline.turnNumber)||1,restKey=`${playerId}:${turn}:${party.map(u=>u.id).sort().join(',')}`;
  if(village.lastRestKeyByPlayerId?.[playerId]===restKey)return fail(state,'このターンは休息済みです');
  const owner=village.sacrificeContract?.playerId;
  const allied=owner===playerId||village.sacrificeContract?.alliedPlayerIds?.includes(playerId);
  const mode=allied?'none':villageIncidentMode(village,balance);
  const ambush=mode==='supply'&&random()<balance.ambushChance;
  const power=villageAmbushPower(village.population,party.length,balance);
  const ids=new Set(party.map(u=>u.id)),held=[],outcomes=[];
  const player=state.players.find(row=>row.id===playerId);
  const units=player.factionState.units.flatMap(unit=>{
    if(!ids.has(unit.id))return [unit];
    const hp=Number(unit.hp??unit.currentHp),ap=Math.max(0,Number(unit.ap??unit.currentAp)-balance.restApCost);
    // 強襲の防御係数は試作用。通常スキルのダメージ式とは区別する。
    const damage=ambush?Math.max(0,Math.floor(power-Number(unit.status?.防御||0))):0;
    if(ambush&&damage>=hp){held.push({ownerPlayerId:playerId,kind:'captive',unit:structuredClone(unit),heldTurn:turn});outcomes.push({id:unit.id,name:unit.name,damage,captured:true});return [];}
    const nextHp=ambush?hp-damage:Math.min(Number(unit.maxHp)||hp,hp+Math.ceil((Number(unit.maxHp)||hp)*balance.restHealRate));
    outcomes.push({id:unit.id,name:unit.name,damage,captured:false});
    return [{...unit,hp:nextHp,currentHp:nextHp,ap,currentAp:ap,lastActionTurn:turn}];
  });
  const incident={status:ambush?'choice':mode==='rescue'?'rescue':'rested',turn,unitIds:outcomes.filter(row=>!row.captured).map(row=>row.id),outcomes};
  const nextVillage={...village,lastRestKeyByPlayerId:{...village.lastRestKeyByPlayerId,[playerId]:restKey},incidentByPlayerId:{...village.incidentByPlayerId,[playerId]:incident}};
  const next=holdTargets(state,nextVillage,playerId,held,units);
  return {ok:true,state:next,message:ambush?`村の強襲 / ${outcomes.map(row=>`${row.name}: ${row.captured?'拘束':`${row.damage}ダメージ`}`).join(' / ')}`:mode==='rescue'?'村人が契約からの救援を求めています':'部隊で休息しました'};
}
export function startVillageIncidentBattle(state, playerId, villageId, guards) {
  const village=state.neutralVillages?.find(row=>row.id===villageId),incident=village?.incidentByPlayerId?.[playerId];
  if(incident?.status!=='choice'||!guards.length)return fail(state,'反撃できる強襲・守備兵がありません');
  if(!incident.unitIds.length)return fail(state,'全員が拘束されています');
  const battleId=`${villageId}:${playerId}:${incident.turn}`;
  const enemies=guards.map(unit=>({...unit,neutral:false,isNeutralVillageGuard:false,worldId:'surface',aggressive:true,neverFlee:true,
    villageIncidentBattleId:battleId,villageIncidentTargetPlayerId:playerId}));
  const ids=new Set(enemies.map(row=>row.id));
  const players=state.players.map(player=>player.id!==playerId?player:{...player,factionState:{...player.factionState,
    units:player.factionState.units.map(unit=>incident.unitIds.includes(unit.id)?{...unit,villageAmbushBattle:battleId}:unit)}});
  return {ok:true,state:replaceIncidentVillage({...state,players,enemies:[...state.enemies.filter(row=>!ids.has(row.id)),...enemies]},
    {...village,defenseUnits:[],incidentByPlayerId:{...village.incidentByPlayerId,[playerId]:{...incident,status:'battle',battleId,guardIds:[...ids]}}}),message:'村の守備兵との戦闘開始。通常の行動で戦ってください'};
}
export function resolveVillageIncidentCasualties(state, balance, random=Math.random) {
  let next=state;
  for(const village of state.neutralVillages||[])for(const [playerId,incident] of Object.entries(village.incidentByPlayerId||{})) {
    if(incident.status!=='battle')continue;
    const player=next.players.find(row=>row.id===playerId);if(!player)continue;
    const defeated=player.factionState.units.filter(unit=>unit.villageAmbushBattle===incident.battleId&&!alive(unit));
    if(!defeated.length)continue;
    const current=next.neutralVillages.find(row=>row.id===village.id);
    const held=defeated.map(unit=>({ownerPlayerId:playerId,kind:random()<balance.deathChance?'corpse':'captive',
      unit:{...structuredClone(unit),equipment:(unit.equipment||[]).map(row=>({...row}))},heldTurn:state.timeline.turnNumber}));
    const ids=new Set(defeated.map(row=>row.id));
    next=holdTargets(next,current,playerId,held,player.factionState.units.filter(row=>!ids.has(row.id)));
  }
  return next;
}
export function finishVillageIncidentBattle(state, playerId, villageId) {
  const village=state.neutralVillages?.find(row=>row.id===villageId),incident=village?.incidentByPlayerId?.[playerId];
  if(incident?.status!=='battle')return fail(state,'村との戦闘中ではありません');
  if(state.enemies.some(row=>incident.guardIds.includes(row.id)&&alive(row)))return fail(state,'村の戦闘ユニットが残っています');
  return releaseVillageCaptives(state,playerId,villageId,'victory');
}
export function releaseVillageCaptives(state, playerId, villageId, status='rescued') {
  const village=state.neutralVillages.find(row=>row.id===villageId),player=state.players.find(row=>row.id===playerId);
  if(!village||!player)return fail(state,'村またはプレイヤーがありません');
  const freed=(village.heldUnits||[]).filter(row=>row.ownerPlayerId===playerId&&row.kind==='captive');
  const occupied=new Set([...(state.players||[]).flatMap(row=>row.factionState.units||[]),...(state.enemies||[]),
    ...(state.neutralVillages||[]).flatMap(row=>row.defenseUnits||[])].filter(alive).map(key));
  const freedUnits=[];
  for(const row of freed) {
    const tile=[key(row.unit),...(village.territoryTileKeys||[])].find(tile=>!occupied.has(tile));
    if(!tile)return fail(state,'解放したユニットを配置できる空きマスがありません');
    occupied.add(tile);const [x,y]=tile.split(',').map(Number);
    freedUnits.push({...row.unit,x,y,position:[x,y],hp:1,currentHp:1,state:'生存',ap:0,currentAp:0,deadExpireTurn:null,deathTurn:null,villageAmbushBattle:null,squadId:'solo'});
  }
  const battleId=village.incidentByPlayerId?.[playerId]?.battleId;
  const players=state.players.map(row=>row.id!==playerId?row:{...row,factionState:{...row.factionState,
    units:[...row.factionState.units.map(unit=>unit.villageAmbushBattle===battleId?{...unit,villageAmbushBattle:null}:unit),...freedUnits],
    squads:row.factionState.squads.map(squad=>squad.id==='solo'?{...squad,unitIds:[...new Set([...squad.unitIds,...freedUnits.map(u=>u.id)])]}:squad)}});
  const updated={...village,heldUnits:(village.heldUnits||[]).filter(row=>!freed.includes(row)),
    incidentByPlayerId:{...village.incidentByPlayerId,[player.id]:{...village.incidentByPlayerId?.[player.id],status}}};
  return {ok:true,state:replaceIncidentVillage({...state,players},updated),message:`解放 ${freed.length}体 / 装備を本人へ返却`};
}
