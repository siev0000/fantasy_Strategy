import {currentDevelopmentOccupiedTiles} from '../../lib/v39-economy-rules.js';
import {getFactionSettlements} from '../../lib/settlement-state.js';

export function findV39LandSettlement(state,tile) {
  const world=state.activeWorldId||'surface',key=`${tile.x},${tile.y}`;
  const candidates=[...(state.players||[]).flatMap(player=>getFactionSettlements(player.factionState)),...(state.settlements||[])];
  return candidates.find(row=>row.placed!==false && (row.worldId||'surface')===world
    && currentDevelopmentOccupiedTiles({...row,placed:true}).includes(key)) || null;
}

export function summarizeV39LandDefenses(structures,tile,turn,{visible=true}={}) {
  if(!visible)return '結界 / 壁 未確認';
  const groups=new Map();
  for(const row of structures||[]){
    if(!(row.hp>0)||(row.expiresAtTurn&&row.expiresAtTurn<=turn))continue;
    const tiles=row.edge?[row.edge.from,row.edge.to]:row.tiles;
    if(!tiles?.some(p=>p.x===tile.x&&p.y===tile.y))continue;
    const name=row.name||row.kind||'壁';
    const group=groups.get(name)||{name,hp:0,maxHp:0,edges:0,count:0};
    group.hp+=Math.ceil(row.hp);group.maxHp+=Math.ceil(row.maxHp);group.count++;
    if(row.edge)group.edges++;
    groups.set(name,group);
  }
  return [...groups.values()].map(row=>`${row.name}${row.edges?` ${row.edges}辺`:row.count>1?` ${row.count}個`:''} HP ${row.hp}/${row.maxHp}`).join(' / ');
}
