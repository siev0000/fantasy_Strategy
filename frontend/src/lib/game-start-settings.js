import playerConfigOptions from "../../../config/player_config_options.json";

const progressConfig = playerConfigOptions?.["ゲーム進行設定"] || {};
const turnModeConfig = progressConfig?.["ターン進行方式"] || {};
const combatTurnConfig = progressConfig?.["最大戦闘ターン数"] || {};

const rawTurnModeOptions = Array.isArray(turnModeConfig?.["選択肢"])
  ? turnModeConfig["選択肢"]
  : [];

const GAME_START_TURN_MODE_OPTIONS = Object.freeze(
  rawTurnModeOptions
    .map(row => ({
      value: String(row?.["値"] || "").trim(),
      label: String(row?.["表示名"] || row?.["値"] || "").trim(),
      description: String(row?.["説明"] || "").trim()
    }))
    .filter(row => row.value && row.label)
);

const turnModeValues = new Set(GAME_START_TURN_MODE_OPTIONS.map(row => row.value));
const firstTurnModeValue = GAME_START_TURN_MODE_OPTIONS[0]?.value || "standard";
const configuredDefaultTurnMode = String(turnModeConfig?.["デフォルト"] || "").trim();

const GAME_START_DEFAULT_TURN_MODE = turnModeValues.has(configuredDefaultTurnMode)
  ? configuredDefaultTurnMode
  : firstTurnModeValue;

const rawMinCombatTurns = Math.floor(Number(combatTurnConfig?.["最小"]));
const rawMaxCombatTurns = Math.floor(Number(combatTurnConfig?.["最大"]));
const GAME_START_MAX_COMBAT_TURNS_MIN = Number.isFinite(rawMinCombatTurns)
  ? Math.max(1, rawMinCombatTurns)
  : 1;
const GAME_START_MAX_COMBAT_TURNS_MAX = Number.isFinite(rawMaxCombatTurns)
  ? Math.max(GAME_START_MAX_COMBAT_TURNS_MIN, rawMaxCombatTurns)
  : 99;

function normalizeCombatTurnCount(value) {
  const raw = Math.floor(Number(value));
  const fallbackRaw = Math.floor(Number(combatTurnConfig?.["デフォルト"]));
  const fallback = Number.isFinite(fallbackRaw)
    ? fallbackRaw
    : GAME_START_MAX_COMBAT_TURNS_MIN;
  const base = Number.isFinite(raw) ? raw : fallback;
  return Math.min(
    GAME_START_MAX_COMBAT_TURNS_MAX,
    Math.max(GAME_START_MAX_COMBAT_TURNS_MIN, base)
  );
}

const GAME_START_DEFAULT_MAX_COMBAT_TURNS = normalizeCombatTurnCount(
  combatTurnConfig?.["デフォルト"]
);

function normalizeGameStartSettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const requestedMode = String(source.turnProgressionMode || "").trim();
  return {
    turnProgressionMode: turnModeValues.has(requestedMode)
      ? requestedMode
      : GAME_START_DEFAULT_TURN_MODE,
    maxCombatTurnsPerWorldTurn: normalizeCombatTurnCount(
      source.maxCombatTurnsPerWorldTurn
    )
  };
}

export {
  GAME_START_DEFAULT_MAX_COMBAT_TURNS,
  GAME_START_DEFAULT_TURN_MODE,
  GAME_START_MAX_COMBAT_TURNS_MAX,
  GAME_START_MAX_COMBAT_TURNS_MIN,
  GAME_START_TURN_MODE_OPTIONS,
  normalizeGameStartSettings
};
