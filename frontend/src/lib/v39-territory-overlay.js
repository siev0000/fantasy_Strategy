import {resolveV39PlayerColor} from './v39-player-colors.js';
import {getHexNeighborCoords} from './hex-grid.js';

export const V39_TERRITORY_OVERLAY_STYLE=Object.freeze({fillAlpha:0.18,borderAlpha:0.95,borderWidth:2,depth:9.5,borderDepth:15.5});

export function buildV39TerritoryOverlayGroups(state,map,{testMode=false,explored=new Set(),activePlayerId=state.activePlayerId,colors}={}){
  const players=state.players||[],villages=state.neutralVillages||[],groups=new Map();
  const roster={players:[...players,...villages.filter(village=>!players.some(player=>player.id===village.id)).map(village=>({id:village.id}))]};
  const valid=key=>{
    const [x,y]=key.split(',').map(Number);
    return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<map.w&&y<map.h&&!!map.grid?.[y]?.[x];
  };
  const add=(id,name,kind,key)=>{
    if(!valid(key)||!testMode&&id!==activePlayerId&&!explored.has(key))return;
    if(!groups.has(id))groups.set(id,{id,name,kind,color:resolveV39PlayerColor(roster,id,colors),tileKeys:new Set()});
    groups.get(id).tileKeys.add(key);
  };
  for(const [key,id] of Object.entries(state.territoryOwnerByTile||{})){
    const player=players.find(player=>player.id===id);
    if(player)add(id,player.label||id,'faction',key);
  }
  for(const village of villages){
    const center=`${village.x},${village.y}`;
    if(!testMode&&!explored.has(center))continue;
    const keys=village.territoryTileKeys?.length?village.territoryTileKeys:[center,...getHexNeighborCoords(map.w,map.h,village.x,village.y,map.worldWrapEnabled===true).map(tile=>tile.key)];
    for(const key of keys){
      const owner=state.territoryOwnerByTile?.[key];
      if(owner&&owner!==village.id)continue;
      add(village.id,village.name||village.id,'village',key);
    }
  }
  return [...groups.values()].map(group=>({...group,tileKeys:[...group.tileKeys].sort()}));
}
