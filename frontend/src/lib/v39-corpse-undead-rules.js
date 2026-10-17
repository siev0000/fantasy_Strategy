import { V39_FOG_BALANCE, V39_UNDEAD_SPAWN_BALANCE } from "./v39-gameplay-balance.js";
import { isV39DeathFogTile, isV39DeathFogSource } from "./v39-fog-rules.js";
import { resolveV39TerrainNameAt } from "./v39-terrain-location.js";
import { getHexNeighborCoords } from "./hex-grid.js";
import {buildV39UndeadInheritance} from './v39-undead-inheritance.js';

const keyOf = unit => `${unit.x},${unit.y}`;
const dead = unit => unit?.state === "死亡" || Number(unit?.hp ?? unit?.currentHp) <= 0;
const corpseAmount = loot => Math.max(0, Number((loot?.cargo || loot)?.resourcesByType?.死体) || 0);

// 回収・蘇生・期限切れの処理後に呼ぶ。生成できた場合だけ元の死体を取り除く。
export function convertV39CorpsesInDeathFog(state, mapData, turn, { createEnemy, random = Math.random, corpseIds=null, undeadClass=null } = {}) {
  const magic=corpseIds instanceof Set;
  if (!mapData?.grid || !createEnemy || (!magic&&state.worldEnvironment?.lastCorpseConversionTurn >= turn)) return null;
  const candidates = V39_UNDEAD_SPAWN_BALANCE.candidates.filter(row => ["ゾンビ", "スケルトン"].includes(row.race));
  const weight = candidates.reduce((sum, row) => sum + row.weight, 0);
  const playerUnits = (state.players || []).flatMap(player => player.factionState?.units || []);
  const guards = (state.neutralVillages || []).flatMap(village => village.defenseUnits || []);
  const fieldUnits = [...playerUnits, ...(state.enemies || []), ...guards]
    .filter(unit => (unit.worldId || "surface") === (state.activeWorldId || "surface"));
  const occupied = new Set(fieldUnits.filter(unit => !dead(unit)).map(keyOf));
  const removed = new Set(), spawned = [];
  const spawnHistory={...state.worldEnvironment?.undeadSpawnHistoryByTile};
  const alreadySpawned=state.worldEnvironment?.undeadSpawnCountTurn===turn?Number(state.worldEnvironment?.undeadSpawnCount)||0:0;
  let eventSpawned=0;
  const eventKeys=new Set((mapData.unholyUndeadOrigins || []).map(row=>row.key));
  const groundLootByTile = { ...(state.groundLootByTile || {}) };
  const transform = (x, y, original = null) => {
    const tileKey=`${x},${y}`;
    if(!magic&&mapData.fogMap?.[y]?.[x]?.createdAtTurn===turn)return false;
    const event=!magic&&eventKeys.has(tileKey);
    if(event&&(alreadySpawned+eventSpawned>=V39_UNDEAD_SPAWN_BALANCE.maximumSpawnCountPerTurn
      ||turn-(spawnHistory[tileKey] ?? -Infinity)<V39_UNDEAD_SPAWN_BALANCE.sameTileCooldownTurns))return false;
    if(!magic&&Number(mapData.purificationByTile?.[tileKey] ?? 0)>V39_UNDEAD_SPAWN_BALANCE.purificationThreshold)return false;
    if ((!magic&&!isV39DeathFogTile(mapData, x, y)&&!eventKeys.has(tileKey)) || !weight) return false;
    const source = isV39DeathFogSource(mapData, x, y);
    const chance = eventKeys.has(tileKey)?1:source ? V39_UNDEAD_SPAWN_BALANCE.corpseMistSourceChance : V39_UNDEAD_SPAWN_BALANCE.corpseMistOtherChance;
    if (!magic&&random() >= chance) return false;
    // 同じマスの複数死体は隣接する霧内の空きマスへ。空きがなければ死体を保持する。
    const position = [{ x, y }, ...getHexNeighborCoords(mapData.w, mapData.h, x, y, mapData.worldWrapEnabled === true)]
      .find(tile => !occupied.has(keyOf(tile)) && (magic||eventKeys.has(tileKey)&&keyOf(tile)===tileKey||isV39DeathFogTile(mapData, tile.x, tile.y))
        && !["海", "湖", "火山", "溶岩", "壁", "岩壁"].includes(resolveV39TerrainNameAt(mapData, tile.x, tile.y))
        && !["海", "湖", "火山", "溶岩", "壁", "岩壁"].includes(mapData.grid?.[tile.y]?.[tile.x])
        && !mapData.wallMap?.[tile.y]?.[tile.x]);
    if (!position) return false;
    let cursor = random() * weight;
    const candidate = undeadClass?{race:undeadClass,className:undeadClass}:candidates.find(row => (cursor -= row.weight) < 0) || candidates.at(-1);
    const baseLevel = original ? Math.max(1, Number(original.level ?? original.lv) || 1)
      : candidate.levelMin + Math.floor(random() * (candidate.levelMax - candidate.levelMin + 1));
    const level = baseLevel + (source ? V39_UNDEAD_SPAWN_BALANCE.corpseMistSourceLevelBonus : 0);
    const inheritance=original?buildV39UndeadInheritance(original,candidate.className):null;
    if(original&&!inheritance)return false;
    const enemy = createEnemy({ id:magic?`raised-${original.id}-${turn}`:`corpse-undead-${turn}-${x}-${y}-${spawned.length}`, name:original?`${inheritance.race}・${candidate.className}`:candidate.className,
      race:candidate.race, className:candidate.className, level, x:position.x, y:position.y,
      ...inheritance,testOnly:original?.testOnly===true,
      metadata:{ spawnType:"死体アンデッド化", naturalSource:magic?"魔法":source ? "死の霧発生源" : "死の霧", naturalSpawnTurn:turn, isUndead:true, aggressive:true } });
    if (!enemy) return false;
    enemy.worldId = original?.worldId || state.activeWorldId || "surface";
    spawned.push({ enemy, origin:{ x, y, key:`${x},${y}`, source, corpseId:original?.id || null } });
    occupied.add(keyOf(position));
    if(event){spawnHistory[tileKey]=turn;eventSpawned++;}
    return true;
  };
  for (const unit of fieldUnits) {
    if (unit.soulCollected||(magic&&!corpseIds.has(unit.id))||!dead(unit) || (unit.deadExpireTurn && unit.deadExpireTurn <= turn)
      || !Number.isInteger(unit.x) || !Number.isInteger(unit.y) || removed.has(unit.id)) continue;
    if (!transform(unit.x, unit.y, unit)) continue;
    removed.add(unit.id);
    const key = keyOf(unit), loot = groundLootByTile[key] || {}, cargo = loot.cargo || loot;
    const resourcesByType = { ...(cargo.resourcesByType || {}) };
    for (const [name, amount] of Object.entries(unit.corpseCargo?.resourcesByType || {})) {
      resourcesByType[name] = (resourcesByType[name] || 0) + amount;
    }
    groundLootByTile[key] = { ...loot, cargo:{ ...cargo, resourcesByType,
      equipmentInventory:[...(cargo.equipmentInventory || []), ...(unit.corpseCargo?.equipmentInventory || [])] } };
  }
  // 開始時の資源死体だけを抽選する。ユニットから落ちた荷物は次ターン以降の対象。
  for (const [key, loot] of Object.entries(magic?{}:state.groundLootByTile || {})) {
    const [x, y] = key.split(",").map(Number);
    const count = Math.floor(corpseAmount(loot) / V39_FOG_BALANCE.corpseResourcePerBody);
    if (!isV39DeathFogTile(mapData, x, y)&&!eventKeys.has(key)) continue;
    let consumed = 0;
    for (let index = 0; index < count; index++) if (transform(x, y)) consumed += V39_FOG_BALANCE.corpseResourcePerBody;
    if (!consumed) continue;
    const current = groundLootByTile[key], cargo = current.cargo || current;
    const resourcesByType = { ...cargo.resourcesByType, 死体:corpseAmount(current) - consumed };
    if (resourcesByType.死体 <= 0) delete resourcesByType.死体;
    groundLootByTile[key] = { ...current, cargo:{ ...cargo, resourcesByType } };
  }
  const filterSquads = squads => (squads || []).map(squad => ({ ...squad,
    unitIds:(squad.unitIds || []).filter(id => !removed.has(id)),
    memberIds:Array.isArray(squad.memberIds) ? squad.memberIds.filter(id => !removed.has(id)) : squad.memberIds }));
  const players = (state.players || []).map(player => {
    const faction = player.factionState;
    if (!faction) return player;
    const units = (faction.units || []).filter(unit => !removed.has(unit.id));
    return { ...player, factionState:{ ...faction, units, squads:filterSquads(faction.squads),
      selectedUnitId:removed.has(faction.selectedUnitId) ? units.find(unit => !dead(unit))?.id || "" : faction.selectedUnitId } };
  });
  const neutralVillages = (state.neutralVillages || []).map(village => ({ ...village,
    defenseUnits:(village.defenseUnits || []).filter(unit => !removed.has(unit.id)) }));
  const villageById = new Map(neutralVillages.map(village => [village.id, village]));
  return { players, neutralVillages, settlements:(state.settlements || []).map(row => villageById.get(row.id) || row),
    enemies:[...(state.enemies || []).filter(unit => !removed.has(unit.id)), ...spawned.map(row => row.enemy)],
    enemySquads:[...filterSquads(state.enemySquads), ...spawned.map(({ enemy }) => ({ id:`enemy-squad-${enemy.id}`, unitIds:[enemy.id], nestId:"", cargo:{ resourcesByType:{}, equipmentInventory:[] } }))],
    enemyNests:(state.enemyNests || []).map(nest => ({ ...nest, unitIds:(nest.unitIds || []).filter(id => !removed.has(id)) })),
    groundLootByTile, worldEnvironment:{ ...state.worldEnvironment, lastCorpseConversionTurn:magic?state.worldEnvironment?.lastCorpseConversionTurn:turn,
      undeadSpawnHistoryByTile:spawnHistory,undeadSpawnCountTurn:turn,undeadSpawnCount:alreadySpawned+eventSpawned }, spawned };
}
