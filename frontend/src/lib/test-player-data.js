export const DEFAULT_TEST_PLAYER_ID = "player-1";
export const PRIMARY_TEST_PLAYER_LABEL = "プレイヤー1";
export const TEST_PLAYER_LABEL_PREFIX = "プレイヤー";
export const OTHER_FACTION_LABEL_PREFIX = "別勢力";

export function buildTestPlayerLabel(no) {
  const index = Math.max(1, Math.floor(Number(no) || 1));
  return `${TEST_PLAYER_LABEL_PREFIX}${index}`;
}

export function buildOtherFactionLabel(no) {
  const index = Math.max(1, Math.floor(Number(no) || 1));
  return `${OTHER_FACTION_LABEL_PREFIX}${index}`;
}
