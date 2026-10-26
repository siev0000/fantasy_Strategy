import balance from '../../../config/v39-npc-faction-ai.json';
import {getFactionSettlements} from './settlement-state.js';
import {inspectV39NeutralVillageEconomy} from './v39-economy-rules.js';
import {getV39LandExpansionCandidates,getV39SettlementTerritoryKeys,startV39LandExpansion} from './v39-land-expansion-rules.js';
import {collectV39FactionVision} from './v39-faction-intelligence-rules.js';
import {inspectV39NpcFoodBalance,scoreV39NpcFoodIncome} from './v39-npc-food-priority.js';
import {resolveV39SpecialResourceHarvestRule,isV39HarvestResource} from './v39-specialty-rules.js';
import {getHexDistance} from './hex-grid.js';

const n=value=>Number(value)||0;
const round=value=>Math.round(value*100)/100;
export function inspectV39NpcResourceExpansion(state,player,map,goals,cfg=balance.resourceExpansion,{foodBalances:providedFoodBalances}={}){
  if(player?.isPlayer!==false||!map?.grid)return [];
  const known=new Set(player.factionState.visibility?.exploredTileKeys||collectV39FactionVision(state,player.id,map).visible);
  const foodBalances=providedFoodBalances||((goals||[]).some(row=>n(row.priority)>=2)?inspectV39NpcFoodBalance(state,player,map):[]);
  return getFactionSettlements(player.factionState).filter(base=>base.placed&&(base.worldId||'surface')===(state.activeWorldId||'surface')).map(base=>{
    const settlementId=base.settlementId||base.id,needs=new Map();
    const food=foodBalances.find(row=>row.settlementId===settlementId&&row.active),priorities=new Map();
    for(const goal of goals||[]){
      if(goal.settlementId&&goal.settlementId!==settlementId||n(goal.missing)<=0)continue;
      needs.set(goal.name,Math.max(n(needs.get(goal.name)),n(goal.missing)));
      priorities.set(goal.name,Math.max(n(priorities.get(goal.name)),n(goal.priority)));
    }
    if(food)for(const [name,deficit] of Object.entries(food.deficit))if(deficit>0){
      needs.set(name,Math.max(n(needs.get(name)),deficit*balance.resourceTeams.stockReserveTurns));priorities.set(name,2);
    }
    const summary={settlementId,name:base.name,needs:Object.fromEntries(needs)};
    const pending=base.landExpansionProjects?.[0];
    if(pending)return {...summary,status:pending.paused?'paused':'building',tileKey:pending.tileKey,remainingTurns:pending.remainingTurns,reason:pending.reason||''};
    if(!cfg.enabled)return {...summary,status:'disabled',reason:'資源目的の開拓OFF'};
    if(!needs.size)return {...summary,status:'idle',reason:'不足資源なし'};
    const owned=getV39SettlementTerritoryKeys(state,player.id,base);
    const economyBase={...base,id:player.id,race:player.race,territoryTileKeys:[...owned]};
    const before=inspectV39NeutralVillageEconomy(economyBase,map,state);
    const candidates=getV39LandExpansionCandidates(state,player.id,settlementId,map).map(tile=>({...tile,key:`${tile.x},${tile.y}`}))
      .filter(tile=>known.has(tile.key)).sort((a,b)=>a.key.localeCompare(b.key));
    const choices=[];
    for(const tile of candidates.slice(0,cfg.candidateLimit)){
      const key=tile.key,projected={...economyBase,territoryTileKeys:[...owned,key],territoryTileModeMap:{...base.territoryTileModeMap,[key]:'resource'}};
      const after=inspectV39NeutralVillageEconomy(projected,map,{...state,territoryOwnerByTile:{...state.territoryOwnerByTile,[key]:player.id}});
      const gains=Object.fromEntries([...needs.keys()].map(name=>[name,round(n(after.income.food[name]??after.income.material[name])-n(before.income.food[name]??before.income.material[name]))]));
      const site=player.factionState.exploration?.discoveredSpecialtiesByTile?.[key];
      if(site&&needs.has(site.name)&&isV39HarvestResource(site)){
        const harvest=resolveV39SpecialResourceHarvestRule(site,player.factionState.research);
        gains[site.name]=round(n(gains[site.name])+harvest.amount*harvest.speed/harvest.turns);
      }
      const score=[...needs].reduce((sum,[name,missing])=>sum+n(gains[name])*Math.min(missing,cfg.deficitWeightCap),0);
      const foodGain=food?scoreV39NpcFoodIncome(before.income.food,after.income.food,food.maintenance):0;
      const priority=Math.max(0,...[...priorities].filter(([name])=>n(gains[name])>0).map(([,value])=>value));
      const foodConstruction=!!food&&[...priorities].some(([name,value])=>value===1&&n(gains[name])>0);
      if((score>0||foodGain>0||foodConstruction)&&(!food||foodGain>0||priority>0))choices.push({tile,tileKey:key,gains,score:round(score),foodGain,priority,foodConstruction});
    }
    if(!choices.length&&!food){
      const sites=Object.entries(player.factionState.exploration?.discoveredSpecialtiesByTile||{})
        .filter(([key,site])=>needs.has(site.name)&&isV39HarvestResource(site)&&!state.territoryOwnerByTile?.[key])
        .map(([key,site])=>({...site,key})).filter(site=>getHexDistance(base,site)<=cfg.rareResourceApproachRange)
        .sort((a,b)=>getHexDistance(base,a)-getHexDistance(base,b)||a.key.localeCompare(b.key));
      for(const site of sites){
        const distance=Math.min(...[...owned].map(key=>{const [x,y]=key.split(',').map(Number);return getHexDistance({x,y},site);}));
        const step=candidates.filter(tile=>getHexDistance(tile,site)<distance).sort((a,b)=>getHexDistance(a,site)-getHexDistance(b,site)||a.key.localeCompare(b.key))[0];
        if(step){choices.push({tile:step,tileKey:step.key,gains:{},score:0,priority:0,foodGain:0,approachResource:site.name});break;}
      }
    }
    choices.sort((a,b)=>Number(b.foodConstruction)-Number(a.foodConstruction)||Number(b.foodGain>0)-Number(a.foodGain>0)||b.foodGain-a.foodGain||b.priority-a.priority||b.score-a.score||a.tileKey.localeCompare(b.tileKey));
    return choices.length?{...summary,...choices[0],status:'ready',reason:choices[0].approachResource?`${choices[0].approachResource}の発見地へ領土を接続`:choices[0].foodConstruction?'食料施設用の不足資材を先に確保':food?'食料収支改善・食料施設の資材を優先':'不足資源の実増産を優先'}
      :{...summary,status:'blocked',reason:candidates.length?'不足資源が増産できる候補なし':'探索・人口・地形・所有条件を満たす隣接地なし'};
  });
}

export function startV39NpcResourceExpansion(state,playerId,map,goals,options={}){
  const player=state.players?.find(row=>row.id===playerId);
  const plans=inspectV39NpcResourceExpansion(state,player,map,goals,undefined,options);
  const plan=plans.filter(row=>row.status==='ready').sort((a,b)=>Number(b.foodConstruction)-Number(a.foodConstruction)||Number(b.foodGain>0)-Number(a.foodGain>0)||n(b.foodGain)-n(a.foodGain)||n(b.priority)-n(a.priority)||b.score-a.score||a.settlementId.localeCompare(b.settlementId))[0];
  if(!plan)return {state,plans,commands:[]};
  const result=startV39LandExpansion(state,playerId,plan.settlementId,plan.tile,map);
  return result.ok?{state:result.state,plans,commands:[`資源地開拓:${plan.tileKey} / ${plan.approachResource?`${plan.approachResource}への領土接続`:Object.entries(plan.gains).filter(([,gain])=>gain>0).map(([name,gain])=>`${name}+${gain}/T`).join('・')}`]}
    :{state,plans,commands:[]};
}
