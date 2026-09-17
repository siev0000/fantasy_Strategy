// 仕様未確定の調整値はここへ集約し、確定後に処理本体を変えず差し替える。
export const V39_HIT_RATE_MIN = 0.05;
export const V39_HIT_RATE_MAX = 0.95;

export const V39_CIVIC_BALANCE = Object.freeze({
  targetBase:50,
  initialHappiness:50,
  initialDissatisfaction:50,
  initialSecurity:50,
  changePerTurn:5,
  starvationHappinessPerStage:5,
  starvationDissatisfactionPerStage:5,
  starvationSecurityPerStage:3,
  securityFromHappinessDivisor:10,
  mixedRacePenaltyPerAdditionalRace:2,
  disasterPenaltyScale:1,
  occupationPenaltyDefault:15,
  guardSecurityBonusCap:30,
  productionPenaltyStart:50,
  productionPenaltyMax:0.3,
  civicOutflowDissatisfactionThreshold:65,
  civicOutflowSecurityThreshold:40,
  civicOutflowPopulationRate:0.02,
  civicOutflowMinimum:1,
  // 反乱の発生数値は未確定。確定後はこの4項目だけを差し替える。
  rebellionDissatisfactionThreshold:75,
  rebellionSecurityThreshold:25,
  rebellionPopulationRate:0.1,
  rebellionCooldownTurns:3
});
