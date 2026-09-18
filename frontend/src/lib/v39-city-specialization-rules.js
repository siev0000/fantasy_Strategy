import { cityData } from "./game-data-registry.js";
import { V39_CITY_SPECIALIZATION_BALANCE } from "./v39-gameplay-balance.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function hash(value) {
  let result = 0;
  for (const char of text(value)) result = Math.imul(result ^ char.charCodeAt(0), 2654435761) >>> 0;
  return result;
}

export function getV39CitySpecializationDefinitions() {
  return cityData.filter(row => text(row?.レア度) === "通常" && text(row?.影響タイプ) === "都市補正");
}

export function resolveV39CityTraits(settlement) {
  const current = [...new Set((Array.isArray(settlement?.cityTraits) ? settlement.cityTraits : []).map(text).filter(Boolean))];
  if (current.length || number(settlement?.scaleLevel) < V39_CITY_SPECIALIZATION_BALANCE.minimumScaleLevel) return current;
  const candidates = cityData.filter(row => text(row?.レア度) === "レア" && !text(row?.条件));
  if (!candidates.length) return current;
  const id = text(settlement?.settlementId || settlement?.id || `${settlement?.x},${settlement?.y}`);
  if ((hash(`${id}:city-trait`) % 10000) >= V39_CITY_SPECIALIZATION_BALANCE.rareTraitChance * 10000) return current;
  return [text(candidates[hash(`${id}:city-trait-kind`) % candidates.length]?.項目名)].filter(Boolean);
}

function conditionResult(condition, context) {
  if (!condition) return { met:true, detail:"条件なし" };
  const match = text(condition).match(/^(.+?):(.+?)(以上|以下)?$/);
  if (!match) return { met:false, detail:`未対応条件: ${condition}` };
  const [, key, rawValue, comparator] = match;
  const required = number(rawValue.replace(/[^0-9.-]/g, ""));
  const settlement = context.settlement || {};
  const player = context.player || {};
  const levels = settlement.cityLevels || settlement.researchLevels || {};
  let actual = null;
  if (key === "防衛Lv") actual = number(levels.軍事Lv);
  else if (key.endsWith("Lv")) actual = number(levels[key]);
  else if (key === "キャラ数") actual = (player?.factionState?.units || []).filter(unit => number(unit?.hp ?? unit?.currentHp) > 0).length;
  else if (key === "開拓完了数") actual = number(context.territoryCount);
  else if (key === "工場") actual = number(settlement.industrialTileRate) * 100;
  else if (key === "農地") actual = number(settlement.farmTileRate) * 100;
  else if (key === "都市技能") actual = number(settlement.citySkills?.[rawValue.replace(/Lv.*$/, "")]);
  else if (key === "地形") return { met:text(settlement.terrain) === rawValue, detail:`${text(settlement.terrain) || "不明"} / 必要 ${rawValue}` };
  else if (key === "都市特性") return { met:(settlement.cityTraits || []).includes(rawValue), detail:`必要 ${rawValue}` };
  else if (key === "メイン種族") {
    const race = Object.entries(settlement.populationByRace || {}).sort((a, b) => number(b[1])-number(a[1]))[0]?.[0] || player.race;
    return { met:text(race).includes(rawValue), detail:`${race || "不明"} / 必要 ${rawValue}` };
  }
  if (actual === null) return { met:false, detail:`未対応条件: ${condition}` };
  const met = comparator === "以下" ? actual <= required : actual >= required;
  return { met, detail:`${actual} / 必要 ${required}${comparator || ""}` };
}

export function inspectV39CitySpecializations(state, player, settlement) {
  const territoryCount = Object.entries(state?.territoryOwnerByTile || {}).filter(([, owner]) => text(owner) === text(player?.id)).length;
  const cityReady = number(settlement?.scaleLevel) >= V39_CITY_SPECIALIZATION_BALANCE.minimumScaleLevel;
  return getV39CitySpecializationDefinitions().map(definition => {
    const condition = conditionResult(definition?.条件, { state, player, settlement, territoryCount });
    return {
      id:text(definition?.項目名), name:text(definition?.項目名), condition:text(definition?.条件),
      effectTargets:text(definition?.影響先パラメータ).split("|").filter(Boolean),
      available:cityReady && condition.met,
      reason:cityReady ? condition.detail : `都市以上で選択可能（現在 ${settlement?.type || "村"}）`,
      definition
    };
  });
}

export function resolveV39CitySpecializationModifiers(settlement) {
  const name = text(settlement?.citySpecializationId);
  const balance = V39_CITY_SPECIALIZATION_BALANCE;
  const result = { foodMultiplier:1, materialMultiplier:1, defenseBonus:0, civicBonus:0 };
  const traits = resolveV39CityTraits(settlement);
  if (traits.length) {
    result.foodMultiplier *= V39_CITY_SPECIALIZATION_BALANCE.rareTraitResourceMultiplier;
    result.materialMultiplier *= V39_CITY_SPECIALIZATION_BALANCE.rareTraitResourceMultiplier;
  }
  if (!name) return result;
  if (name === "農業都市") result.foodMultiplier *= balance.foodMultiplier;
  else if (name === "産業都市") result.materialMultiplier *= balance.materialMultiplier;
  else if (name === "交易都市") { result.foodMultiplier *= balance.tradeMultiplier; result.materialMultiplier *= balance.tradeMultiplier; }
  else if (["軍事都市", "城塞都市"].includes(name)) result.defenseBonus = balance.defenseBonus;
  else if (["信仰都市", "学術都市", "魔法都市"].includes(name)) result.civicBonus = balance.civicBonus;
  else { result.foodMultiplier *= balance.defaultResourceMultiplier; result.materialMultiplier *= balance.defaultResourceMultiplier; }
  return result;
}

export function selectV39CitySpecialization(state, playerId, settlementId, specializationId) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const settlements = player?.factionState?.settlements || [];
  const settlement = settlements.find(row => text(row?.settlementId || row?.id) === text(settlementId));
  const candidate = inspectV39CitySpecializations(state, player, settlement).find(row => row.id === text(specializationId));
  if (!candidate?.available) return { ok:false, reason:candidate?.reason || "選択できない都市特性です", state };
  const players = state.players.map(row => row.id !== player.id ? row : {
    ...row,
    factionState:{
      ...row.factionState,
      settlements:settlements.map(city => text(city?.settlementId || city?.id) === text(settlementId)
        ? { ...city, citySpecializationId:candidate.id, citySpecializationSelectedTurn:number(state?.timeline?.turnNumber, 1) }
        : city)
    }
  });
  return { ok:true, state:{ ...state, players }, specialization:candidate };
}
