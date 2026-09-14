import {
  classData,
  factionData,
  getGameDataRecordId,
  governmentData,
  diplomacyStanceData,
  organizationData
} from "./game-data-registry.js";

export const WAR_DECLARATION_DIPLOMACY_PENALTY = -20;
export const WAR_DECLARATION_PENALTY_TURNS = 20;

const POLICY_META_FIELDS = new Set([
  "項目カテゴリ", "項目名", "影響タイプ", "影響先パラメータ", "備考"
]);

const asText = value => String(value ?? "").trim();

export function createV39FactionPairKey(firstPlayerId, secondPlayerId) {
  return [asText(firstPlayerId), asText(secondPlayerId)].filter(Boolean).sort().join("|");
}

export function resolveV39RaceCategory(raceName) {
  const race = asText(raceName);
  if (!race) return "";
  const faction = factionData.find(row => [row?.種族, row?.カナ].some(value => asText(value) === race));
  const className = asText(faction?.カナ || race);
  return asText(classData.find(row => asText(row?.名前) === className)?.種類);
}

export function isV39DemonPlayer(player) {
  return resolveV39RaceCategory(player?.race) === "魔族";
}

export function isV39DemonFactionPair(firstPlayer, secondPlayer) {
  return isV39DemonPlayer(firstPlayer) && isV39DemonPlayer(secondPlayer);
}

export function getV39DiplomacyRelation(state, firstPlayerId, secondPlayerId) {
  const pairKey = createV39FactionPairKey(firstPlayerId, secondPlayerId);
  const relation = state?.diplomacyRelations?.[pairKey];
  return relation && typeof relation === "object"
    ? { pairKey, status:"peace", diplomacyPenalty:0, ...relation }
    : { pairKey, status:"peace", diplomacyPenalty:0 };
}

export function canV39FactionAttack(state, attackerPlayerId, targetPlayerId) {
  const attackerId = asText(attackerPlayerId);
  const targetId = asText(targetPlayerId);
  if (!attackerId || !targetId || attackerId === targetId) return true;
  const players = Array.isArray(state?.players) ? state.players : [];
  const attacker = players.find(player => player.id === attackerId);
  const target = players.find(player => player.id === targetId);
  if (!attacker || !target) return false;
  if (isV39DemonFactionPair(attacker, target)) return true;
  return getV39DiplomacyRelation(state, attackerId, targetId).status === "war";
}

export function declareV39War(state, attackerPlayerId, targetPlayerId, turnNumber) {
  const pairKey = createV39FactionPairKey(attackerPlayerId, targetPlayerId);
  if (!pairKey || asText(attackerPlayerId) === asText(targetPlayerId)) return state;
  const players = Array.isArray(state?.players) ? state.players : [];
  const attacker = players.find(player => player.id === asText(attackerPlayerId));
  const target = players.find(player => player.id === asText(targetPlayerId));
  if (!attacker || !target) return state;
  const turn = Math.max(1, Math.floor(Number(turnNumber) || Number(state?.timeline?.turnNumber) || 1));
  const exempt = isV39DemonFactionPair(attacker, target);
  const previous = getV39DiplomacyRelation(state, attackerPlayerId, targetPlayerId);
  const relation = {
    ...previous,
    pairKey,
    status:"war",
    declaredAtTurn:turn,
    declaredBy:asText(attackerPlayerId),
    endedAtTurn:null,
    diplomacyPenalty:exempt ? 0 : WAR_DECLARATION_DIPLOMACY_PENALTY,
    penaltyUntilTurn:exempt ? turn : turn + WAR_DECLARATION_PENALTY_TURNS
  };
  return {
    ...state,
    diplomacyRelations:{ ...(state?.diplomacyRelations || {}), [pairKey]:relation }
  };
}

export function endV39War(state, firstPlayerId, secondPlayerId, turnNumber) {
  const relation = getV39DiplomacyRelation(state, firstPlayerId, secondPlayerId);
  if (!relation.pairKey) return state;
  const turn = Math.max(1, Math.floor(Number(turnNumber) || Number(state?.timeline?.turnNumber) || 1));
  return {
    ...state,
    diplomacyRelations:{
      ...(state?.diplomacyRelations || {}),
      [relation.pairKey]:{ ...relation, status:"peace", endedAtTurn:turn }
    }
  };
}

export function advanceV39DiplomacyTurn(state, turnNumber) {
  const turn = Math.max(1, Math.floor(Number(turnNumber) || Number(state?.timeline?.turnNumber) || 1));
  const relations = Object.fromEntries(Object.entries(state?.diplomacyRelations || {}).map(([key, relation]) => {
    const expired = Number(relation?.penaltyUntilTurn) <= turn;
    return [key, expired ? { ...relation, diplomacyPenalty:0 } : { ...relation }];
  }));
  return { ...state, diplomacyRelations:relations };
}

function addNumericModifiers(target, row) {
  for (const [key, value] of Object.entries(row || {})) {
    if (POLICY_META_FIELDS.has(key) || value === null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) target[key] = (Number(target[key]) || 0) + number;
  }
}

export function calculateV39NationPolicyModifiers(policy = {}) {
  const modifiers = {};
  const governmentIds = Object.values(policy?.governmentSelections || {});
  const selectedRows = governmentData.filter(row => governmentIds.includes(getGameDataRecordId("体制", row)));
  const stance = diplomacyStanceData.find(row => getGameDataRecordId("外交姿勢", row) === policy?.diplomacyStanceId);
  const organizations = organizationData.filter(row => (policy?.organizationIds || []).includes(getGameDataRecordId("組織", row)));
  [...selectedRows, stance, ...organizations].filter(Boolean).forEach(row => addNumericModifiers(modifiers, row));
  return modifiers;
}

export function getV39NationPolicyOptions() {
  const governmentByCategory = Object.groupBy
    ? Object.groupBy(governmentData, row => asText(row?.項目カテゴリ) || "その他")
    : governmentData.reduce((groups, row) => {
      const category = asText(row?.項目カテゴリ) || "その他";
      (groups[category] ||= []).push(row);
      return groups;
    }, {});
  return { governmentByCategory, diplomacyStances:diplomacyStanceData, organizations:organizationData };
}
