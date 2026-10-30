import provisionalDefinitions from "../../../data/manual/特産品仮.json";
import { getGameDataRows } from "./game-data-registry.js";
import { V39_SPECIALTY_BALANCE } from "./v39-gameplay-balance.js";
import { resolveV39ResourceIcon } from "./resource-icon-glyphs.js";
import { resolveCompletedResearchLevel } from "./research-progress.js";
import { getHexNeighborCoords } from "./hex-grid.js";
import {createV39ClimateLookup,matchesV39ClimateConditions} from './v39-climate-conditions.js';

const text = value => String(value ?? "").trim();
const terrainAliases = new Map(getGameDataRows("地形").flatMap(row => {
  const name = text(row.地形);
  const aliases = Array.isArray(row.別名) ? row.別名 : text(row.別名).split(/[、,]/);
  return [name, ...aliases.map(text).filter(Boolean)].map(alias => [alias, name]);
}));

export function parseV39SpecialtyTerrainConditions(value) {
  const entries = Array.isArray(value) ? value : text(value).split(/[、,，/:]/);
  return entries.map(text).filter(Boolean).map(entry => {
    const match = entry.match(/^(.+)_(-?\d+)(?:[~〜～](-?\d+))?$/);
    const terrain = match ? text(match[1]) : entry;
    const min = match ? Number(match[2]) : -Infinity;
    const max = match ? Number(match[3] ?? match[2]) : Infinity;
    if (min > max) throw new Error(`[特産品] 高度範囲の上下限が逆です: ${entry}`);
    return { terrain:terrainAliases.get(terrain) || terrain, min, max };
  });
}

// シートの正式データがある場合は仮データを混ぜない。
export function v39SpecialtyDefinitions() {
  const rows = getGameDataRows("特産品");
  return (rows.length ? rows : provisionalDefinitions).filter(row => text(row?.名前));
}

export function resolveV39SpecialtyFoodAt(state,playerId,x,y){
  const key=`${x},${y}`,site=state?.specialtiesByTile?.[key];
  const discovered=state?.players?.find(p=>p.id===playerId)?.factionState?.exploration?.discoveredSpecialtiesByTile?.[key];
  const name=text(site?.name||site?.名前||site);
  if(!name||text(discovered?.name)!==name)return null;
  const definition=v39SpecialtyDefinitions().find(row=>text(row.名前)===name);
  return definition?.収穫資源?{name,key,resource:text(definition.収穫資源),amount:Math.max(0,Number(definition.収穫量加算)||0)}:null;
}

function hash(value) {
  let n = 2166136261;
  for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

export function generateV39Specialties(map, {
  seed = "v39", reservedTileKeys = [], definitions = v39SpecialtyDefinitions(), playerCount = 1,
  minimumResourceSites = V39_SPECIALTY_BALANCE.minimumResourceSites,
  minimumResourceRegionTiles = V39_SPECIALTY_BALANCE.minimumResourceRegionTiles,
} = {}) {
  const reserved = new Set(reservedTileKeys);
  const climateAt=createV39ClimateLookup(map);
  const candidates = definitions.map(row => ({ row, conditions:parseV39SpecialtyTerrainConditions(row.出現地形) }));
  const result = {};
  const resourceCandidates = new Map(candidates.filter(({row}) => text(row.分類) === "特殊資源" && Number(row.出現重み ?? 1) > 0).map(({row}) => [row, []]));
  for (let y = 0; y < map?.h; y++) for (let x = 0; x < map?.w; x++) {
    const key = `${x},${y}`;
    if (reserved.has(key) || map?.lavaMap?.[y]?.[x]) continue;
    const terrains = [text(map?.grid?.[y]?.[x]), text(map?.specialMap?.[y]?.[x])].map(name => terrainAliases.get(name) || name);
    const height = Number(map?.heightLevelMap?.[y]?.[x]) || 0;
    const climate=climateAt(x,y);
    const eligible = candidates.filter(({ row, conditions }) => {
      return conditions.some(condition => terrains.includes(condition.terrain) && height >= condition.min && height <= condition.max)
        && (!text(row.最低高度) || height >= Number(row.最低高度))
        && (!text(row.最高高度) || height <= Number(row.最高高度))
        && Number(row.出現重み ?? 1) > 0 && matchesV39ClimateConditions(row,climate);
    }).map(({ row }) => row);
    for (const row of eligible) resourceCandidates.get(row)?.push({ key, x, y });
    if (!eligible.length || hash(`${seed}:${key}:place`) / 4294967296 >= V39_SPECIALTY_BALANCE.placementRate) continue;
    // 地形・高度を満たす候補の重みで選択する。配置率とは別の相対値。
    let choice = hash(`${seed}:${key}:type`) / 4294967296 * eligible.reduce((sum, row) => sum + Number(row.出現重み ?? 1), 0);
    const definition = eligible.find(row => (choice -= Number(row.出現重み ?? 1)) < 0) || eligible.at(-1);
    result[key] = { key, x, y, name:text(definition.名前), category:text(definition.分類) };
  }
  // 補充も地形・高度・気候を満たした候補内に限る。
  const minimum = Math.max(0, Math.floor(Number(minimumResourceSites) || 0), Math.floor(Number(playerCount) || 0));
  const regionSize = Math.max(0, Math.floor(Number(minimumResourceRegionTiles) || 0));
  for (const [row, tiles] of [...resourceCandidates].sort((a,b) => a[1].length - b[1].length)) {
    const supplement = (area, target) => {
      const count = area.filter(tile => result[tile.key]?.name === text(row.名前)).length;
      const available = area.filter(tile => !result[tile.key]).sort((a,b) => hash(`${seed}:${row.名前}:${a.key}:ensure`) - hash(`${seed}:${row.名前}:${b.key}:ensure`));
      for (const tile of available.slice(0, Math.max(0, target - count))) {
        result[tile.key] = { ...tile, name:text(row.名前), category:text(row.分類) };
      }
      return count + Math.min(available.length, Math.max(0, target - count));
    };
    // 素材ごとの適正マスを六角形の隣接関係でまとめ、広い地域の欠落を補う。
    if (regionSize > 0) {
      const remaining = new Map(tiles.map(tile => [tile.key, tile]));
      for (const tile of tiles) {
        if (!remaining.delete(tile.key)) continue;
        const region = [tile];
        for (let index = 0; index < region.length; index++) {
          const current = region[index];
          for (const neighbor of getHexNeighborCoords(map.w, map.h, current.x, current.y, map.worldWrapEnabled)) {
            const next = remaining.get(neighbor.key);
            if (next) { remaining.delete(neighbor.key); region.push(next); }
          }
        }
        if (region.length >= regionSize) supplement(region, 1);
      }
    }
    if (supplement(tiles, minimum) < minimum) console.warn(`[特産品配置] ${row.名前}: 最低${minimum}地点に必要な適正マスが不足しています`);
  }
  return result;
}

export function getV39SpecialtyEntries(state, playerId, { settlementId = "", ownedOnly = false } = {}) {
  const player = state?.players?.find(row => row.id === playerId);
  const discovered = player?.factionState?.exploration?.discoveredSpecialtiesByTile || {};
  return Object.entries(discovered).filter(([key]) => {
    if (!ownedOnly) return true;
    if (state?.territoryOwnerByTile?.[key] !== playerId) return false;
    const territory = state?.territoryStateByTile?.[key];
    if (territory?.raided || territory?.status === "襲撃中" || territory?.hp <= 0) return false;
    return !settlementId || territory?.settlementId === settlementId;
  }).map(([key, record]) => ({ ...record, key, owned:state?.territoryOwnerByTile?.[key] === playerId,
    ...resolveV39ResourceIcon(record.name) }));
}

export function resolveV39SpecialtyHappiness(entries = []) {
  const names = [...new Set(entries.filter(row => !isV39HarvestResource(row)).map(row => text(row?.name)).filter(Boolean))];
  return { names, bonus:Math.min(V39_SPECIALTY_BALANCE.happinessCap, names.length * V39_SPECIALTY_BALANCE.happinessPerType) };
}

export function isV39HarvestResource(entry) {
  const definition = v39SpecialtyDefinitions().find(row => text(row.名前) === text(entry?.name));
  return text(definition?.分類 || entry?.category) === "特殊資源";
}

export function summarizeV39Specialties(entries = []) {
  const groups = new Map();
  for (const entry of entries.filter(row => !isV39HarvestResource(row))) {
    const group = groups.get(entry.name) || { ...entry, count:0 };
    group.count++;
    groups.set(entry.name, group);
  }
  return [...groups.values()];
}

export function getV39SpecialtyAccess(state,playerId,{settlementId='',includeBorrowed=true}={}) {
  const village=(state.neutralVillages||[]).find(row=>row.id===playerId);
  const entries=village?(village.territoryTileKeys||[]).map(key=>state.specialtiesByTile?.[key]).filter(Boolean):getV39SpecialtyEntries(state,playerId,{settlementId,ownedOnly:true});
  const groups=new Map(summarizeV39Specialties(entries).map(row=>[row.name,{...row}]));
  const turn=Number(state.timeline?.turnNumber)||1;
  for(const contract of (state.players||[]).flatMap(player=>player.factionState.tradeContracts||[]))for(const loan of contract.specialtyLoans||[]) {
    if(turn<loan.startTurn||turn>=loan.endTurn)continue;
    const from=contract.sides[loan.from],to=contract.sides[1-loan.from];
    if(from.partyId===playerId&&(!settlementId||from.settlementId===settlementId)){const row=groups.get(loan.name);if(row)row.count=Math.max(0,row.count-loan.count);}
    if(includeBorrowed&&to.partyId===playerId&&(!settlementId||to.settlementId===settlementId)){const row=groups.get(loan.name)||{name:loan.name,count:0,...resolveV39ResourceIcon(loan.name)};row.count+=loan.count;groups.set(loan.name,row);}
  }
  return [...groups.values()].filter(row=>row.count>0);
}

export function resolveV39SpecialResourceHarvestRule(entry, research) {
  const definition = v39SpecialtyDefinitions().find(row => text(row.名前) === text(entry?.name)) || {};
  const turns = Math.max(1, Number(definition.採取周期) || V39_SPECIALTY_BALANCE.harvestTurns);
  const amount = Math.max(0, Number(definition.採取量 ?? V39_SPECIALTY_BALANCE.harvestAmount) || 0);
  const category = text(definition.研究区分);
  const level = category ? resolveCompletedResearchLevel(research, category) : 0;
  const speed = 1 + level * Math.max(0, Number(definition.研究速度補正 ?? V39_SPECIALTY_BALANCE.researchSpeedPerLevel) || 0);
  return { turns, amount, speed, category, level };
}

export function resolveV39SpecialtyFoodBonuses(state,playerId,settlementId=''){
  const definitions=new Map(v39SpecialtyDefinitions().map(row=>[row.名前,row]));
  const village=(state.neutralVillages||[]).find(row=>row.id===playerId);
  const entries=village?(village.territoryTileKeys||[]).map(key=>({...state.specialtiesByTile?.[key],key})).filter(row=>row.name)
    :getV39SpecialtyEntries(state,playerId,{settlementId,ownedOnly:true});
  const available=new Map(getV39SpecialtyAccess(state,playerId,{settlementId,includeBorrowed:false}).map(row=>[row.name,row.count]));
  const byTile={},fixedIncome={},sites=[];
  for(const entry of [...entries].sort((a,b)=>a.key.localeCompare(b.key))){
    const definition=definitions.get(entry.name),resource=definition?.収穫資源;
    if(!resource||!(available.get(entry.name)>0)||state.territoryStateByTile?.[entry.key]?.raided)continue;
    available.set(entry.name,available.get(entry.name)-1);
    byTile[entry.key]={[resource]:Math.max(0,Number(definition.収穫量加算)||0)};
    sites.push({key:entry.key,name:entry.name,resource,baseBonus:byTile[entry.key][resource]});
  }
  for(const entry of getV39SpecialtyAccess(state,playerId,{settlementId})){
    const definition=definitions.get(entry.name),resource=definition?.収穫資源;
    if(resource)fixedIncome[resource]=(fixedIncome[resource]||0)+Math.max(0,Number(definition.固定収入)||0)*entry.count;
  }
  return {byTile,fixedIncome,sites};
}

// 拠点ごと・マスごとの進捗。領土喪失時は破棄、襲撃中は保持して停止する。
export function advanceV39SpecialResourceHarvest(state, player, village, turn, mapData) {
  const settlementId = text(village.settlementId || village.id);
  const progressByTile = {};
  for (const [key, progress] of Object.entries(village.specialResourceHarvestByTile || {})) {
    if (state.territoryOwnerByTile?.[key] === player.id && state.territoryStateByTile?.[key]?.settlementId === settlementId) progressByTile[key] = { ...progress };
  }
  const income = {};
  const eligible = getV39SpecialtyEntries(state, player.id, { settlementId, ownedOnly:true }).filter(isV39HarvestResource);
  for (const entry of eligible) {
    if (mapData?.lavaMap?.[entry.y]?.[entry.x]) continue;
    const old = progressByTile[entry.key];
    if (Number(old?.lastTurn) >= turn) continue;
    const rule = resolveV39SpecialResourceHarvestRule(entry, player.factionState?.research);
    const progress = Math.max(0, Number(old?.name === entry.name ? old.progress : 0) || 0) + rule.speed;
    const cycles = Math.floor((progress + 1e-9) / rule.turns);
    income[entry.name] = (income[entry.name] || 0) + cycles * rule.amount;
    progressByTile[entry.key] = { name:entry.name, progress:Math.max(0, progress - cycles * rule.turns), lastTurn:turn };
  }
  return { income, progressByTile };
}
