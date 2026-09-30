import { resolveAttackApCost, resolveAttackPower } from "../../lib/v39-combat-engine.js";
import { canV39FactionAttack } from "../../lib/v39-diplomacy-rules.js";
import { normalizeTerritoryStateRecord } from "../../lib/settlement-state.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const keyFor = unit => `${Math.floor(number(unit?.x))},${Math.floor(number(unit?.y))}`;

// 他勢力への領土攻撃は、敵の略奪と同じ領土HP・略奪状態を使う。所有権の移転は勢力滅亡ルールの確定後に接続する。
export function executeV39FactionTerritoryAssault({ playerId, attackerId, tileKey, skillRow, turnNumber } = {}) {
  const state = window.getV39GameState?.();
  const attackerPlayer = state?.players?.find(player => text(player?.id) === text(playerId));
  const attacker = attackerPlayer?.factionState?.units?.find(unit => text(unit?.id) === text(attackerId));
  const key = text(tileKey || keyFor(attacker));
  const ownerPlayerId = text(state?.territoryOwnerByTile?.[key]);
  if (!state || !attackerPlayer || !attacker || !ownerPlayerId) return { ok:false, reason:"攻撃対象の領土がありません" };
  if (ownerPlayerId === text(playerId)) return { ok:false, reason:"自勢力の領土には攻撃できません" };
  if (!canV39FactionAttack(state, playerId, ownerPlayerId)) return { ok:false, reason:"宣戦布告していない勢力の領土には攻撃できません" };
  if (keyFor(attacker) !== key) return { ok:false, reason:"対象領土と同じマスにいません" };
  const territory = normalizeTerritoryStateRecord(state.territoryStateByTile?.[key]);
  if (territory.raided === true) return { ok:false, reason:"対象領土はすでに略奪されています", completed:true };
  const apCost = resolveAttackApCost(skillRow, attacker);
  if (number(attacker?.ap, attacker?.currentAp) < apCost) return { ok:false, reason:"APが不足しています" };
  const damage = Math.max(1, resolveAttackPower(skillRow, attacker));
  const hpBefore = Math.max(0, number(territory.hp, territory.maxHp || 100));
  const hp = Math.max(0, hpBefore - damage);
  const completed = hp <= 0;
  const players = state.players.map(player => player.id !== attackerPlayer.id ? player : ({
    ...player,
    factionState:{
      ...player.factionState,
      units:(player.factionState?.units || []).map(unit => unit.id !== attacker.id ? unit : ({
        ...unit,
        ap:Math.max(0, number(unit?.ap, unit?.currentAp) - apCost),
        currentAp:Math.max(0, number(unit?.ap, unit?.currentAp) - apCost),
        actionPoint:Math.max(0, number(unit?.ap, unit?.currentAp) - apCost)
      }))
    }
  }));
  const territoryStateByTile = {
    ...state.territoryStateByTile,
    [key]:{
      ...territory,
      hp,
      ...(completed ? {
        raided:true,
        raidedAtTurn:Math.max(1, Math.floor(number(turnNumber, state?.timeline?.turnNumber || 1))),
        raidedByPlayerId:text(playerId),
        raidedByUnitId:text(attacker.id)
      } : {})
    }
  };
  window.setV39GameState?.({ players, territoryStateByTile }, { reason:completed ? "faction-territory-raided" : "faction-territory-attacked" });
  const detail = { playerId:text(playerId), attackerId:text(attacker.id), ownerPlayerId, key, skillName:text(skillRow?.名前), apCost, damage, hpBefore, hp, completed };
  window.dispatchEvent(new CustomEvent("v39:faction-territory-attacked", { detail }));
  window.appendV39ActivityLog?.(playerId, "領土攻撃", `領土${key}へ${text(skillRow?.名前) || "攻撃"}`, detail);
  window.appendV39ActivityLog?.(ownerPlayerId, "領土", `領土${key}が${text(attacker.name, attacker.id)}に攻撃されました`, detail);
  return { ok:true, ...detail };
}

window.executeV39FactionTerritoryAssault = executeV39FactionTerritoryAssault;
