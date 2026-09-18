import {
  classData,
  factionData,
  getGameDataRecordId,
  governmentData,
  diplomacyStanceData,
  organizationData
} from "./game-data-registry.js";
import { V39_DIPLOMACY_BALANCE } from "./v39-gameplay-balance.js";
import { getSelectedSettlement, replaceFactionSettlement } from "./settlement-state.js";

export const WAR_DECLARATION_DIPLOMACY_PENALTY = -20;
export const WAR_DECLARATION_PENALTY_TURNS = 20;
export const V39_TREATY_TYPES = Object.freeze({
  nonAggression:{ label:"不可侵条約", relationRequired:V39_DIPLOMACY_BALANCE.nonAggressionThreshold },
  trade:{ label:"交易協定", relationRequired:V39_DIPLOMACY_BALANCE.tradeThreshold },
  alliance:{ label:"同盟", relationRequired:V39_DIPLOMACY_BALANCE.allianceThreshold }
});

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
    ? { pairKey, status:"peace", relationValue:0, diplomacyPenalty:0, treaties:{}, ...relation }
    : { pairKey, status:"peace", relationValue:0, diplomacyPenalty:0, treaties:{} };
}

export function getV39DiplomacyRelationLabel(value) {
  const relation = Number(value) || 0;
  if (relation >= V39_DIPLOMACY_BALANCE.friendlyThreshold) return "友好";
  if (relation <= V39_DIPLOMACY_BALANCE.hostileThreshold) return "敵対";
  return "中立";
}

function clampRelation(value) {
  return Math.max(V39_DIPLOMACY_BALANCE.relationMin, Math.min(V39_DIPLOMACY_BALANCE.relationMax, Math.round(Number(value) || 0)));
}

function activeTreaty(relation, type, turnNumber) {
  const treaty = relation?.treaties?.[type];
  return treaty?.active === true && Number(treaty.expiresAtTurn) > Number(turnNumber);
}

export function hasV39ActiveTreaty(state, firstPlayerId, secondPlayerId, type, turnNumber = state?.timeline?.turnNumber) {
  return activeTreaty(getV39DiplomacyRelation(state, firstPlayerId, secondPlayerId), type, turnNumber);
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
  if (activeTreaty(previous, "nonAggression", turn) || activeTreaty(previous, "alliance", turn)) return state;
  const relation = {
    ...previous,
    pairKey,
    status:"war",
    relationValue:clampRelation(Number(previous.relationValue) - V39_DIPLOMACY_BALANCE.warRelationLoss),
    treaties:{},
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
      [relation.pairKey]:{ ...relation, status:"peace", relationValue:clampRelation(Number(relation.relationValue) + V39_DIPLOMACY_BALANCE.peaceRelationGain), endedAtTurn:turn }
    }
  };
}

export function signV39Treaty(state, firstPlayerId, secondPlayerId, type, turnNumber) {
  const definition = V39_TREATY_TYPES[type];
  const relation = getV39DiplomacyRelation(state, firstPlayerId, secondPlayerId);
  if (!definition || !relation.pairKey) return { ok:false, reason:"条約種別が不正です", state };
  if (relation.status === "war") return { ok:false, reason:"戦争中は条約を締結できません", state };
  if (Number(relation.relationValue) < definition.relationRequired) return { ok:false, reason:`友好度${definition.relationRequired}以上が必要です`, state };
  const turn = Math.max(1, Math.floor(Number(turnNumber) || Number(state?.timeline?.turnNumber) || 1));
  const treaty = { type, label:definition.label, active:true, startedAtTurn:turn, expiresAtTurn:turn + V39_DIPLOMACY_BALANCE.treatyDurationTurns };
  const nextRelation = {
    ...relation,
    relationValue:clampRelation(Number(relation.relationValue) + 5),
    treaties:{ ...(relation.treaties || {}), [type]:treaty }
  };
  return { ok:true, treaty, state:{ ...state, diplomacyRelations:{ ...(state.diplomacyRelations || {}), [relation.pairKey]:nextRelation } } };
}

export function cancelV39Treaty(state, firstPlayerId, secondPlayerId, type, turnNumber) {
  const relation = getV39DiplomacyRelation(state, firstPlayerId, secondPlayerId);
  if (!activeTreaty(relation, type, turnNumber)) return { ok:false, reason:"有効な条約がありません", state };
  const treaties = { ...(relation.treaties || {}), [type]:{ ...relation.treaties[type], active:false, endedAtTurn:Number(turnNumber) || 1 } };
  const nextRelation = { ...relation, relationValue:clampRelation(Number(relation.relationValue) - 10), treaties };
  return { ok:true, state:{ ...state, diplomacyRelations:{ ...(state.diplomacyRelations || {}), [relation.pairKey]:nextRelation } } };
}

export function improveV39DiplomacyRelation(state, firstPlayerId, secondPlayerId, turnNumber) {
  const relation = getV39DiplomacyRelation(state, firstPlayerId, secondPlayerId);
  const turn = Math.max(1, Math.floor(Number(turnNumber) || Number(state?.timeline?.turnNumber) || 1));
  if (!relation.pairKey || relation.status === "war") return { ok:false, reason:"戦争中は親善を行えません", state };
  if (Number(relation.lastFriendlyActionTurn) === turn) return { ok:false, reason:"親善は1ターン1回です", state };
  const next = { ...relation, relationValue:clampRelation(Number(relation.relationValue) + 10), lastFriendlyActionTurn:turn, lastFriendlyActionBy:firstPlayerId };
  return { ok:true, state:{ ...state, diplomacyRelations:{ ...(state.diplomacyRelations || {}), [relation.pairKey]:next } } };
}

function addTradeIncome(state, playerId, amount) {
  const player = state.players?.find(row => row.id === playerId);
  const settlement = getSelectedSettlement(player?.factionState);
  if (!player || !settlement) return state;
  const materialStockByType = { ...(settlement.materialStockByType || {}), 金:(Number(settlement.materialStockByType?.金) || 0) + amount };
  const nextSettlement = { ...settlement, materialStockByType };
  return {
    ...state,
    players:state.players.map(row => row.id !== playerId ? row : {
      ...row,
      factionState:replaceFactionSettlement(row.factionState, nextSettlement, { ownerPlayerId:row.id, select:false })
    })
  };
}

function relationPlayerIds(pairKey) {
  return String(pairKey || "").split("|").filter(Boolean);
}

export function advanceV39DiplomacyTurn(state, turnNumber) {
  const turn = Math.max(1, Math.floor(Number(turnNumber) || Number(state?.timeline?.turnNumber) || 1));
  let working = { ...state };
  const reports = [];
  const relations = Object.fromEntries(Object.entries(state?.diplomacyRelations || {}).map(([key, source]) => {
    const relation = getV39DiplomacyRelation(state, ...relationPlayerIds(key));
    if (Number(relation.lastProcessedTurn) >= turn) return [key, { ...relation }];
    const expired = Number(relation?.penaltyUntilTurn) <= turn;
    const treaties = Object.fromEntries(Object.entries(relation.treaties || {}).map(([type, treaty]) => [type,
      treaty?.active && Number(treaty.expiresAtTurn) <= turn ? { ...treaty, active:false, endedAtTurn:turn } : { ...treaty }
    ]));
    let relationValue = Number(relation.relationValue) || 0;
    if (relation.status !== "war") relationValue += relationValue > 0 ? -V39_DIPLOMACY_BALANCE.relationDriftPerTurn : relationValue < 0 ? V39_DIPLOMACY_BALANCE.relationDriftPerTurn : 0;
    if (activeTreaty({ ...relation, treaties }, "trade", turn)) {
      for (const playerId of relationPlayerIds(key)) working = addTradeIncome(working, playerId, V39_DIPLOMACY_BALANCE.tradeIncomePerTurn);
      relationValue += V39_DIPLOMACY_BALANCE.tradeRelationPerTurn;
      reports.push({ type:"trade-income", pairKey:key, amount:V39_DIPLOMACY_BALANCE.tradeIncomePerTurn });
    }
    return [key, { ...source, ...relation, treaties, relationValue:clampRelation(relationValue), lastProcessedTurn:turn, ...(expired ? { diplomacyPenalty:0 } : {}) }];
  }));
  working = { ...working, diplomacyRelations:relations };

  // 人間操作ではない勢力だけをAI判断対象にする。
  for (const ai of working.players || []) {
    if (ai?.isPlayer !== false) continue;
    for (const target of working.players || []) {
      if (target.id === ai.id) continue;
      let relation = getV39DiplomacyRelation(working, ai.id, target.id);
      if (relation.status !== "war" && Number(relation.relationValue) <= V39_DIPLOMACY_BALANCE.hostileThreshold && !activeTreaty(relation, "nonAggression", turn) && !activeTreaty(relation, "alliance", turn)) {
        working = declareV39War(working, ai.id, target.id, turn);
        reports.push({ type:"ai-war", playerId:ai.id, targetPlayerId:target.id });
        continue;
      }
      const treatyType = Number(relation.relationValue) >= V39_DIPLOMACY_BALANCE.allianceThreshold ? "alliance"
        : Number(relation.relationValue) >= V39_DIPLOMACY_BALANCE.tradeThreshold ? "trade"
          : Number(relation.relationValue) >= V39_DIPLOMACY_BALANCE.nonAggressionThreshold ? "nonAggression" : "";
      if (treatyType && !activeTreaty(relation, treatyType, turn)) {
        const signed = signV39Treaty(working, ai.id, target.id, treatyType, turn);
        if (signed.ok) {
          working = signed.state;
          reports.push({ type:"ai-treaty", playerId:ai.id, targetPlayerId:target.id, treatyType });
        }
      }
    }
  }
  return { ...working, reports };
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
