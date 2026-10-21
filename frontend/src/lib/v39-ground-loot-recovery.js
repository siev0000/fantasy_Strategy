import { addV39CargoToFactionUnit, isV39CargoEmpty, normalizeV39Cargo } from './v39-logistics-state.js';

// Both the UI and NPCs consume the same discovered loot and put it in real squad cargo.
export function recoverV39GroundLootState(state, playerId, unitId, key) {
  const player = state.players?.find(row => row.id === playerId);
  const unit = player?.factionState?.units?.find(row => row.id === unitId);
  const loot = state.groundLootByTile?.[key];
  const fail = reason => ({ ok:false, state, reason });
  if (!unit || Number(unit.hp ?? unit.currentHp) <= 0 || unit.state === '死亡') return fail('回収するキャラクターがいません');
  if ((unit.worldId || 'surface') !== (state.activeWorldId || 'surface') || `${unit.x},${unit.y}` !== key) return fail('残留品と同じマスで実行してください');
  if (!loot || isV39CargoEmpty(loot.cargo)) return fail('残留品がありません');
  if (!loot.discoveredByPlayerIds?.includes(playerId)) return fail('先に残留品を調査してください');
  const result = addV39CargoToFactionUnit(player.factionState, unitId, loot.cargo);
  if (!result.ok) return fail('所属部隊が見つかりません');
  const groundLootByTile = { ...state.groundLootByTile };
  delete groundLootByTile[key];
  return { ok:true, state:{ ...state, groundLootByTile,
    players:state.players.map(row => row.id === playerId ? { ...row, factionState:result.faction } : row) },
    report:{ playerId, unitId, squadId:result.squadId, key, recovered:normalizeV39Cargo(loot.cargo) } };
}
