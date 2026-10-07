import templates from "../../../data/manual/洞窟テンプレート.json";
import { getHexNeighborCoords } from "./hex-grid.js";
import { V39_CAVE_BALANCE } from "./v39-gameplay-balance.js";
import { createV39CaveLayout, isV39CaveRoomFloor } from "./v39-cave-layout.js";

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
  const source = templateId === "random" ? templates[Math.floor(random() * templates.length)] : templates.find(row => row.id === templateId);
  if (!source) throw new Error(`洞窟テンプレートがありません: ${templateId}`);
  const template=createV39CaveLayout(source,random);
  const count = surfaceEntrances.length || Number(entranceCount);
  if (!Number.isInteger(count) || count < 2 || count > template.出入口.length) throw new Error("洞窟の出入口は2〜4か所で指定してください");
  const { 幅:w, 高さ:h } = template;
  const grid = Array.from({ length:h }, () => Array(w).fill("岩壁"));
  const carve = (x,y) => { if (x>0 && x<w-1 && y>0 && y<h-1) grid[y][x] = "洞窟"; };
  template.部屋.forEach((room,index)=>{
    const [cx,cy,rx,ry]=room,outline=template.部屋輪郭?.[index];
    for(let y=cy-ry-1;y<=cy+ry+1;y++)for(let x=cx-rx-1;x<=cx+rx+1;x++) {
      if(outline?isV39CaveRoomFloor(x,y,room,outline):Math.abs(x-cx)<=rx&&Math.abs(y-cy)<=ry)carve(x,y);
    }
  });
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
  // 輪郭を変えても全接続口と部屋中心を床でつなぎ、入口・出口の到達性を保つ。
  if(template.部屋輪郭)template.部屋.forEach((room,index)=>{
    for(const port of Object.values(template.部屋接続口[index]))connect(room.slice(0,2),port,1);
  });
  for (const corridor of template.通路) for (let i=1; i<corridor.経路.length; i++) {
    const from=corridor.経路[i-1],to=corridor.経路[i],a=resolvePoint(from),b=resolvePoint(to);
    if(template.部屋輪郭&&Math.hypot(b[0]-a[0],b[1]-a[1])>6&&random()<V39_CAVE_BALANCE.corridorBendRate) {
      const jitter=()=>Math.round((random()*2-1)*V39_CAVE_BALANCE.roomPositionJitter);
      const middle=[Math.max(1,Math.min(w-2,Math.round((a[0]+b[0])/2)+jitter())),
        Math.max(1,Math.min(h-2,Math.round((a[1]+b[1])/2)+jitter()))];
      connect(from,middle,corridor.幅);connect(middle,to,corridor.幅);
    } else connect(from,to,corridor.幅);
  }
  const entrances = template.出入口.slice(0,count).map(([x,y],index) => {
    connect([x,y],template.入口接続[index],template.入口通路幅[index]);
    return { id:`entrance-${index+1}`,x,y,key:`${x},${y}`,surfaceEntrance:surfaceEntrances[index] || null };
  });
  return { id:`cave-${seed}-${template.id}`,seed:String(seed),templateId:template.id,templateName:template.名前,w,h,grid,entrances,corridors,
    rooms:template.部屋,roomOutlines:template.部屋輪郭||[],generationVersion:2,worldWrapEnabled:false };
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
  const available = new Map(floor.map(tile=>[`${tile.x},${tile.y}`,tile]));
  const enemies=[];
  let encounterIndex=0;
  while(enemies.length<count && available.size) {
    let choice = random()*total;
    const definition = definitions.find((_,i)=>(choice-=weights[i])<0) || definitions.at(-1);
    const spawnForm=["単独","小集団","群れ"].includes(definition.row.出現形態)?definition.row.出現形態:"単独";
    const minimum=spawnForm==="単独"?1:Math.max(1,Math.floor(Number(definition.row.集団数_Min)||1));
    const maximum=spawnForm==="単独"?1:Math.max(minimum,Math.floor(Number(definition.row.集団数_Max)||minimum));
    const size=minimum+Math.floor(random()*(maximum-minimum+1));
    const clusterAt=anchor=>{
      const queue=[{...anchor,distance:0}],seen=new Set([`${anchor.x},${anchor.y}`]),positions=[];
      for(let cursor=0;cursor<queue.length&&positions.length<size;cursor++) {
        const tile=queue[cursor],tileKey=`${tile.x},${tile.y}`;
        if(available.has(tileKey))positions.push(tile);
        if(tile.distance>=V39_CAVE_BALANCE.encounterGroupRadius)continue;
        for(const next of getHexNeighborCoords(map.w,map.h,tile.x,tile.y)) {
          if(seen.has(next.key)||!available.has(next.key))continue;
          seen.add(next.key);queue.push({...next,distance:tile.distance+1});
        }
      }
      return positions;
    };
    let positions=[];
    for(const anchor of available.values()) {
      const cluster=clusterAt(anchor);
      if(cluster.length>positions.length)positions=cluster;
      if(positions.length>=size)break;
    }
    const groupId=`${map.id}-group-${encounterIndex++}`;
    for(const tile of positions) {
      available.delete(`${tile.x},${tile.y}`);
      const level = Math.min(V39_CAVE_BALANCE.maxTestLevel,definition.minLevel+Math.floor(random()*(definition.maxLevel-definition.minLevel+1)));
      const enemy = createEnemy({ id:`${map.id}-enemy-${enemies.length}`,name:definition.name,race:definition.race,className:definition.className,level,x:tile.x,y:tile.y,
        metadata:{ spawnTerrain:"洞窟",sourceDefinitionId:definition.definitionId,image:definition.row.画像,aggressive:definition.row.好戦的===true,
          groupId,spawnForm,encounterGroupSize:positions.length } });
      if (!enemy) throw new Error(`洞窟の敵生成に失敗しました: ${definition.name}`);
      enemies.push(enemy);
    }
  }
  return enemies;
}
