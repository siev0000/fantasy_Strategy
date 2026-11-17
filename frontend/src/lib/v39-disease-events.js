import {getV39ConditionEventRules,getV39ConditionEffect,countV39SettlementConditions} from './v39-condition-event-rules.js';
import {getFactionSettlements,replaceFactionSettlement} from './settlement-state.js';
import {rescaleV39PopulationGrowthForPopulationChange} from './v39-population-economy.js';
import {reducePopulationByRatio} from './v39-rebellion-rules.js';
import {getHexDistance} from './hex-grid.js';

const number=value=>Number.isFinite(Number(value))?Number(value):0;
const key=(x,y)=>`${Math.floor(number(x))},${Math.floor(number(y))}`;
const DISEASE_ID='疫病';

function roll(value){
  let hash=2166136261;
  for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return (hash>>>0)/4294967296;
}

function exposedTiles(base){return [...new Set(base.territoryTileKeys?.length?base.territoryTileKeys:[key(base.x,base.y)])];}

export function advanceV39DiseaseConditions(state,map,events,turn,previous={},random=roll){
  const rules=getV39ConditionEventRules().filter(rule=>!getV39ConditionEffect(rule,'spawnRebels')),
    exposure={...previous},created=[];
  if(!rules.length||map?.isUnderground)return {exposure,events:created};
  const bases=[...(state.players||[]).flatMap(player=>getFactionSettlements(player.factionState)
    .map(base=>({base,ownerKey:`player:${player.id}:${base.settlementId||base.id}`}))),
    ...(state.neutralVillages||[]).map(base=>({base,ownerKey:`neutral:${base.id}`}))];
  const corpses=Object.entries(state.groundLootByTile||{}).filter(([,loot])=>
    number(loot?.cargo?.resourcesByType?.死体??loot?.resourcesByType?.死体)>=100)
    .map(([tile])=>{const [x,y]=tile.split(',').map(Number);return {x,y};});
  for(const {base,ownerKey} of bases){
    if(!base?.placed||(base.worldId||'surface')!==(state.activeWorldId||'surface'))continue;
    const tiles=exposedTiles(base);
    const food=Object.values(base.populationGrowthByRace||{}).some(row=>number(row?.starvationStage)>=1);
    const crowded=number(base.overcrowdingHappinessPenalty)<0;
    const contamination=(events||[]).some(event=>event.disasterId==='瘴気'&&
      (event.tileKeys||[]).some(tile=>tiles.includes(tile)))||corpses.some(corpse=>tiles.some(tile=>{
        const [x,y]=tile.split(',').map(Number);return getHexDistance({x,y},corpse)<=1;
      }));
    for(const rule of rules){
    const conditionCount=countV39SettlementConditions(rule,base,{food,crowded,contamination});
    const exposureKey=rule.id===DISEASE_ID?ownerKey:`${rule.id}:${ownerKey}`;
    const old=exposure[exposureKey]||{};
    const streak=old.lastCheckedTurn===turn?old.streak:conditionCount>=rule.details.conditionEvent.minimumMatches?number(old.streak)+1:0;
    exposure[exposureKey]={streak,lastCheckedTurn:turn,conditionCount};
    if(streak<Math.max(1,rule.requiredConditionTurns)||old.lastCheckedTurn===turn||!tiles.length)continue;
    if((events||[]).some(event=>event.disasterId===rule.id&&
      (event.diseaseOwnerKey===ownerKey||!event.diseaseOwnerKey&&event.tileKeys?.some(tile=>tiles.includes(tile)))))continue;
    if((state.worldEnvironment?.lastDisasterEvents||[]).some(event=>event.disasterId===rule.id
      &&(event.diseaseOwnerKey===ownerKey||!event.diseaseOwnerKey&&event.tileKeys?.some(tile=>tiles.includes(tile)))
      &&number(event.turn)>turn-rule.cooldown))continue;
    if(random(`${rule.id}:${ownerKey}:${turn}`)>=rule.chance)continue;
    const anchor=tiles[0],[x,y]=anchor.split(',').map(Number);
    created.push({id:`disaster:${rule.id}:${turn}:${ownerKey}`,disasterId:rule.id,
      name:rule.name,description:rule.description,icon:rule.icon,imageFile:rule.imageFile,imageSlot:rule.imageSlot,
      x,y,anchorKey:anchor,tileKeys:tiles,radius:0,turn,startsAtTurn:turn,
      expiresAtTurn:turn+rule.duration-1,lastTickTurn:turn-1,origin:'condition-event',
      diseaseOwnerKey:ownerKey,yieldMultiplier:rule.yieldMultiplier,securityLoss:rule.securityLoss,
      damageElement:rule.damageElement,damagePower:rule.damagePower,details:structuredClone(rule.details)});
    }
  }
  return {exposure,events:created};
}

export function applyV39DiseasePopulation(state,events,turn){
  return applyPopulationLoss(state,events,turn,false);
}

export function applyV39FixedDisasterPopulation(state,events,turn){
  return applyPopulationLoss(state,events,turn,true);
}

function applyPopulationLoss(state,events,turn,fixed){
  const baseline=event=>event.populationLossBase||0;
  const rules=getV39ConditionEventRules('populationLoss');
  const active=(events||[]).filter(event=>(fixed?baseline(event)>0:rules.some(rule=>rule.id===event.disasterId))&&number(event.lastTickTurn)<turn);
  if(!active.length)return {players:state.players,neutralVillages:state.neutralVillages,entries:[]};
  const entries=[];
  function damageBase(base,ownerKey){
    if(fixed&&(base.disasterPopulationCheckedTurn===turn||base.placed===false||(base.worldId||'surface')!==(state.activeWorldId||'surface')))return base;
    const tiles=exposedTiles(base);
    let current=base;
    const affected=active.filter(event=>fixed
      ?event.damageTileKeys?.some(tile=>tiles.includes(tile))
      :event.diseaseOwnerKey===ownerKey||!event.diseaseOwnerKey&&event.tileKeys?.some(tile=>tiles.includes(tile)));
    if(fixed)affected.sort((a,b)=>baseline(b)-baseline(a)||String(a.id).localeCompare(String(b.id)));
    if(fixed&&affected.length)current={...current,disasterPopulationCheckedTurn:turn};
    for(const event of fixed?affected.slice(0,1):affected){
      const rule=rules.find(rule=>rule.id===event.disasterId);
      const rate=getV39ConditionEffect(rule,'populationLoss')?.rate||0;
      const population=Math.max(0,Math.floor(number(current.population)||Object.values(current.populationByRace||{}).reduce((sum,n)=>sum+number(n),0)));
      if(!population||(!fixed&&!rate))continue;
      const requestedLoss=Math.min(population,fixed
        ?Math.max(0,baseline(event)+Math.floor(roll(`${event.id}:${ownerKey}:${turn}:population`)*3)-1)
        :Math.max(1,Math.ceil(population*rate)));
      const races=reducePopulationByRatio(current.populationByRace,requestedLoss);
      const loss=Object.keys(current.populationByRace||{}).length?races.loss:requestedLoss;
      if(!loss)continue;
      entries.push({targetType:'population',name:current.name||'拠点',settlementId:current.settlementId||current.id,
        damage:loss,source:event.name||rule?.name||event.disasterId,disasterId:event.disasterId,x:current.x,y:current.y});
      current={...current,population:population-loss,
        populationByRace:Object.keys(current.populationByRace||{}).length?races.populationByRace:current.populationByRace,
        populationGrowthByRace:Object.keys(current.populationByRace||{}).length
          ?rescaleV39PopulationGrowthForPopulationChange(races.populationByRace,current.populationGrowthByRace):current.populationGrowthByRace,
        ...(fixed?{disasterState:{turn,populationLoss:loss}}:{diseaseState:{turn,populationLoss:loss}})};
    }
    return current;
  }
  const players=(state.players||[]).map(player=>{
    let factionState=player.factionState;
    for(const base of getFactionSettlements(factionState)){
      const next=damageBase(base,`player:${player.id}:${base.settlementId||base.id}`);
      if(next!==base)factionState=replaceFactionSettlement(factionState,next,{select:false,ownerPlayerId:player.id});
    }
    return factionState===player.factionState?player:{...player,factionState};
  });
  const neutralVillages=(state.neutralVillages||[]).map(base=>damageBase(base,`neutral:${base.id}`));
  return {players,neutralVillages,entries};
}
