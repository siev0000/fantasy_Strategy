// 通信実装前でも、参加者と操作対象の勢力を同じ形で保存するための共通処理。
export const V39_LOCAL_SESSION_PLAYER_LIMIT = Object.freeze({
  // 現行のゲーム開始画面・仕様書と合わせた、ローカル勢力数の範囲。
  min: 1,
  max: 8
});

const text = value => String(value ?? "").trim();

function uniquePlayerIds(players) {
  const ids = new Set();
  return (Array.isArray(players) ? players : [])
    .map(player => text(player?.id))
    .filter(id => id && !ids.has(id) && (ids.add(id) || true));
}

export function normalizeV39SessionParticipants(value, players) {
  const playerIds = uniquePlayerIds(players);
  const source = Array.isArray(value) ? value.filter(row => row && typeof row === "object") : [];
  const knownParticipantIds = new Set();
  const participants = source.map((row, index) => {
    const participantId = text(row?.participantId) || `local-${index + 1}`;
    if (knownParticipantIds.has(participantId)) return null;
    knownParticipantIds.add(participantId);
    return {
      participantId,
      name:text(row?.name) || `参加者${index + 1}`,
      // 通信実装前はlocalだけを扱う。将来のremote値は保存したまま扱える。
      controlMode:text(row?.controlMode) || "local",
      assignedPlayerIds:Array.isArray(row?.assignedPlayerIds)
        ? row.assignedPlayerIds.map(text).filter(id => playerIds.includes(id))
        : []
    };
  }).filter(Boolean);
  return participants.length
    ? participants
    : [{ participantId:"local-1", name:"参加者1", controlMode:"local", assignedPlayerIds:[...playerIds] }];
}

export function normalizeV39SessionPlayers(players, participantSource) {
  const sourcePlayers = Array.isArray(players) ? players : [];
  const participants = normalizeV39SessionParticipants(participantSource, sourcePlayers);
  const assignedControllerByPlayerId = new Map();
  for (const participant of participants) {
    for (const playerId of participant.assignedPlayerIds) {
      if (!assignedControllerByPlayerId.has(playerId)) {
        assignedControllerByPlayerId.set(playerId, participant.participantId);
      }
    }
  }
  const defaultParticipantId = participants[0]?.participantId || "local-1";
  const normalizedPlayers = sourcePlayers.map(player => {
    const id = text(player?.id);
    const requested = text(player?.controllerParticipantId);
    const controllerParticipantId = participants.some(row => row.participantId === requested)
      ? requested
      : (assignedControllerByPlayerId.get(id) || defaultParticipantId);
    return { ...player, controllerParticipantId };
  });
  const normalizedParticipants = participants.map(participant => ({
    ...participant,
    assignedPlayerIds:normalizedPlayers
      .filter(player => player.controllerParticipantId === participant.participantId)
      .map(player => text(player.id))
  }));
  return { players:normalizedPlayers, sessionParticipants:normalizedParticipants };
}

export function normalizeV39PlayerTurnTimeline(value, players, fallbackActivePlayerId = "") {
  const validPlayerIds = uniquePlayerIds(players);
  const requestedOrder = Array.isArray(value?.playerTurnOrder)
    ? value.playerTurnOrder.map(text).filter(id => validPlayerIds.includes(id))
    : [];
  const playerTurnOrder = [...new Set([...requestedOrder, ...validPlayerIds])];
  const requestedActive = text(value?.activeTurnPlayerId);
  const fallbackActive = text(fallbackActivePlayerId);
  const activeTurnPlayerId = playerTurnOrder.includes(requestedActive)
    ? requestedActive
    : (playerTurnOrder.includes(fallbackActive) ? fallbackActive : (playerTurnOrder[0] || ""));
  const endedPlayerIds = [...new Set(Array.isArray(value?.endedPlayerIds)
    ? value.endedPlayerIds.map(text).filter(id => playerTurnOrder.includes(id))
    : [])].filter(id => id !== activeTurnPlayerId);
  return { playerTurnOrder, activeTurnPlayerId, endedPlayerIds };
}

export function normalizeV39LocalPlayerCount(value, fallback = V39_LOCAL_SESSION_PLAYER_LIMIT.min) {
  const parsed = Math.floor(Number(value));
  const base = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(V39_LOCAL_SESSION_PLAYER_LIMIT.max, Math.max(V39_LOCAL_SESSION_PLAYER_LIMIT.min, base));
}

export function normalizeV39LocalParticipantCount(value, playerCount, fallback = V39_LOCAL_SESSION_PLAYER_LIMIT.min) {
  const maximum = normalizeV39LocalPlayerCount(playerCount, V39_LOCAL_SESSION_PLAYER_LIMIT.min);
  const parsed = Math.floor(Number(value));
  const base = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(maximum, Math.max(V39_LOCAL_SESSION_PLAYER_LIMIT.min, base));
}
