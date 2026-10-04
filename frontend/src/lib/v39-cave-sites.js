import { getHexNeighborCoords } from "./hex-grid.js";
import { V39_CAVE_BALANCE as balance } from "./v39-gameplay-balance.js";

// 通常ゲームの資源データには書き込まない、洞窟探索テスト用の地点定義。
export const CAVE_SITE_TYPES = [
  {kind:"herb",name:"薬草群生地",icon:"🌿",count:"herbSites",reserve:"recoveryUses",wall:false},
  {kind:"mushroom",name:"キノコ群生地",icon:"🍄‍🟫",count:"mushroomSites",reserve:"recoveryUses",wall:false},
  {kind:"ore",name:"鉱石",icon:"⛏️",count:"oreSites",reserve:"oreDeposit",wall:true},
  {kind:"gem",name:"宝石",icon:"💎",count:"gemSites",reserve:"gemDeposit",wall:true},
];

function score(text) {
  let hash=2166136261;
  for(const char of text) hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return hash>>>0;
}

export function createCaveSites(map,enemies) {
  const occupied=new Set([...enemies,...map.entrances].map(tile=>`${tile.x},${tile.y}`));
  const sites=[];
  for(const type of CAVE_SITE_TYPES) {
    const candidates=[];
    for(let y=1;y<map.h-1;y++)for(let x=1;x<map.w-1;x++) {
      const key=`${x},${y}`;
      if(occupied.has(key))continue;
      if(type.wall) {
        if(map.grid[y][x]!=="岩壁"||!getHexNeighborCoords(map.w,map.h,x,y).some(tile=>map.grid[tile.y][tile.x]==="洞窟"))continue;
      } else if(map.grid[y][x]!=="洞窟")continue;
      candidates.push({x,y,key,score:score(`${map.seed}:${type.kind}:${key}`)});
    }
    candidates.sort((a,b)=>a.score-b.score);
    for(const tile of candidates.slice(0,balance[type.count])) {
      occupied.add(tile.key);
      sites.push({...tile,id:`${map.id}-${type.kind}-${sites.length}`,kind:type.kind,name:type.name,icon:type.icon,wall:type.wall,remaining:balance[type.reserve],discovered:false,lastUseTurn:0});
    }
  }
  return sites;
}

export function caveSiteVisible(game,site) {
  return site.wall
    ?getHexNeighborCoords(game.map.w,game.map.h,site.x,site.y).some(tile=>game.visible.includes(tile.key))
    :game.visible.includes(site.key);
}
