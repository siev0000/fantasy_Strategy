import templates from "../../../data/manual/洞窟テンプレート.json";
import { getHexNeighborCoords } from "./hex-grid.js";
import { V39_CAVE_BALANCE } from "./v39-gameplay-balance.js";

export const V39_CAVE_TEMPLATES = templates;

export function createV39CaveSeed() {
  const values=globalThis.crypto.getRandomValues(new Uint32Array(4));
  return `cave-${Array.from(values,value=>value.toString(16).padStart(8,"0")).join("-")}`;
}

function randomFor(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

export function findV39CavePath(map, from, to, blocked = []) {
  const start = `${from.x},${from.y}`, goal = `${to.x},${to.y}`;
  const blockedKeys = new Set(blocked);
  const queue = [from], previous = new Map([[start, null]]);
  if (map.grid?.[from.y]?.[from.x] !== "洞窟" || map.grid?.[to.y]?.[to.x] !== "洞窟" || blockedKeys.has(goal)) return [];
  for (let i = 0; i < queue.length && !previous.has(goal); i++) {
    const current = queue[i];
    for (const next of getHexNeighborCoords(map.w, map.h, current.x, current.y)) {
      if (map.grid[next.y][next.x] !== "洞窟" || previous.has(next.key) || blockedKeys.has(next.key)) continue;
      previous.set(next.key, `${current.x},${current.y}`);
      queue.push(next);
    }
  }
  if (!previous.has(goal)) return [];
  const path = [];
  for (let key = goal; key !== null; key = previous.get(key)) {
    const [x,y] = key.split(",").map(Number);
    path.push({ x,y,key });
  }
  return path.reverse();
}

export function generateV39CaveMap({ seed = "cave", templateId = "random", entranceCount = 2, surfaceEntrances = [] } = {}) {
  const random = randomFor(seed);
  const template = templateId === "random" ? templates[Math.floor(random() * templates.length)] : templates.find(row => row.id === templateId);
  if (!template) throw new Error(`洞窟テンプレートがありません: ${templateId}`);
  const count = surfaceEntrances.length || Number(entranceCount);
  if (!Number.isInteger(count) || count < 2 || count > template.出入口.length) throw new Error("洞窟の出入口は2〜4か所で指定してください");
  const { 幅:w, 高さ:h } = template;
  const grid = Array.from({ length:h }, () => Array(w).fill("岩壁"));
  const carve = (x,y) => { if (x>0 && x<w-1 && y>0 && y<h-1) grid[y][x] = "洞窟"; };
  for (const [cx,cy,rx,ry] of template.部屋) for (let y=cy-ry; y<=cy+ry; y++) for (let x=cx-rx; x<=cx+rx; x++) carve(x,y);
  // 全マス通行可の仮グリッド上で六角形の最短経路を求め、通路だけを掘る。
  const diggingMap = { w,h,grid:Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>x>0&&x<w-1&&y>0&&y<h-1?"洞窟":"岩壁")) };
  const resolvePoint = point => Array.isArray(point)?point:template.部屋接続口[point.部屋][point.接続口];
  const corridors=[];
  const connect = (from,to,width) => {
    const a=resolvePoint(from),b=resolvePoint(to);
    if(![1,2,3].includes(width)) throw new Error("洞窟の通路幅は1〜3マスで指定してください");
    const path=findV39CavePath(diggingMap,{x:a[0],y:a[1]},{x:b[0],y:b[1]});
    const tiles=new Set();
    const dig=tile=>{if(tile.x>0&&tile.x<w-1&&tile.y>0&&tile.y<h-1){carve(tile.x,tile.y);tiles.add(`${tile.x},${tile.y}`);}};
    for(let i=0;i<path.length;i++) {
      const tile=path[i];dig(tile);
      if(width===1)continue;
      // 六角形の進行方向に直交する両側を選ぶ。2幅は片側、3幅は両側に拡張。
      const previous=path[Math.max(0,i-1)],next=path[Math.min(path.length-1,i+1)];
      const dx=next.x+(next.y%2)/2-previous.x-(previous.y%2)/2,dy=(next.y-previous.y)*Math.sqrt(3)/2;
      const neighbors=getHexNeighborCoords(w,h,tile.x,tile.y);
      const score=neighbor=>-(neighbor.x+(neighbor.y%2)/2-tile.x-(tile.y%2)/2)*dy+(neighbor.y-tile.y)*Math.sqrt(3)/2*dx;
      neighbors.sort((left,right)=>score(left)-score(right));
      dig(neighbors.at(-1));if(width===3)dig(neighbors[0]);
    }
    corridors.push({from:a,to:b,width,path,tiles:[...tiles]});
  };
  for (const corridor of template.通路) for (let i=1; i<corridor.経路.length; i++) connect(corridor.経路[i-1],corridor.経路[i],corridor.幅);
  const entrances = template.出入口.slice(0,count).map(([x,y],index) => {
    connect([x,y],template.入口接続[index],template.入口通路幅[index]);
    return { id:`entrance-${index+1}`,x,y,key:`${x},${y}`,surfaceEntrance:surfaceEntrances[index] || null };
  });
  return { id:`cave-${seed}-${template.id}`,seed:String(seed),templateId:template.id,templateName:template.名前,w,h,grid,entrances,corridors,worldWrapEnabled:false };
}

export function populateV39CaveMonsters(map, definitions, createEnemy) {
  if (!definitions.length) throw new Error("出現敵.jsonに有効な洞窟の出現敵がありません");
  const random = randomFor(`${map.seed}:monsters`);
  const safe = new Set();
  for (const entry of map.entrances) {
    const queue = [{...entry,distance:0}];
    const seen = new Set([entry.key]);
    for (let i=0;i<queue.length;i++) {
      const tile = queue[i];
      safe.add(`${tile.x},${tile.y}`);
      if (tile.distance >= V39_CAVE_BALANCE.entranceSafeDistance) continue;
      for (const next of getHexNeighborCoords(map.w,map.h,tile.x,tile.y)) {
        if (map.grid[next.y][next.x] === "洞窟" && !seen.has(next.key)) { seen.add(next.key); queue.push({...next,distance:tile.distance+1}); }
      }
    }
  }
  const floor = [];
  for (let y=0;y<map.h;y++) for(let x=0;x<map.w;x++) {
    if (map.grid[y][x] !== "洞窟" || safe.has(`${x},${y}`)) continue;
    floor.push({x,y});
  }
  for (let i=floor.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [floor[i],floor[j]]=[floor[j],floor[i]]; }
  const count = Math.min(floor.length, Math.max(1, Math.ceil(floor.length / V39_CAVE_BALANCE.tilesPerMonster)));
  const weights = definitions.map(definition => definition.race === "ドレイク" ? V39_CAVE_BALANCE.drakeWeight : 1);
  const total = weights.reduce((sum,value)=>sum+value,0);
  return floor.slice(0,count).map((tile,index)=>{
    let choice = random()*total;
    const definition = definitions.find((_,i)=>(choice-=weights[i])<0) || definitions.at(-1);
    const level = Math.min(V39_CAVE_BALANCE.maxTestLevel,definition.minLevel+Math.floor(random()*(definition.maxLevel-definition.minLevel+1)));
    const enemy = createEnemy({ id:`${map.id}-enemy-${index}`,name:definition.name,race:definition.race,className:definition.className,level,...tile,
      metadata:{ spawnTerrain:"洞窟",sourceDefinitionId:definition.definitionId,image:definition.row.画像,aggressive:definition.row.好戦的===true } });
    if (!enemy) throw new Error(`洞窟の敵生成に失敗しました: ${definition.name}`);
    return enemy;
  });
}
