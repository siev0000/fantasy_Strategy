import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
await page.waitForFunction(() => typeof window.startV39LocalSession === "function" && typeof window.generateV39TestFieldWithSeed === "function");

const report = await page.evaluate(async () => {
  const assignedSession = window.startV39LocalSession(3, {
    playMode:"single-test",
    participantCount:2,
    playerParticipantAssignments:{ "player-1":"local-1", "player-2":"local-2", "player-3":"local-2" }
  });
  const assignedSessionCheck = {
    participantCount:assignedSession.sessionParticipants.length,
    assignments:Object.fromEntries(assignedSession.players.map(player => [player.id, player.controllerParticipantId]))
  };
  const maximumSession = window.startV39LocalSession(8, { playMode:"single-test" });
  const maximumSessionCheck = {
    playerCount:maximumSession.players.length,
    assignedPlayerCount:maximumSession.sessionParticipants[0]?.assignedPlayerIds?.length || 0,
    uniqueUnitIds:new Set(maximumSession.players.flatMap(player => player.factionState.units.map(unit => unit.id))).size,
    unitCount:maximumSession.players.flatMap(player => player.factionState.units).length
  };
  const normalSession = window.startV39LocalSession(2, { playMode:"single-normal" });
  const normalSessionCheck = {
    playerCount:normalSession.players.length,
    unitCount:normalSession.players.flatMap(player => player.factionState.units).length,
    settlementCount:normalSession.players.flatMap(player => player.factionState.settlements).length,
    races:normalSession.players.map(player => player.race)
  };
  const source = window.startV39LocalSession(2, { playMode:"single-test" });
  const field = window.generateV39TestFieldWithSeed({ w:36, h:36, patternId:"realistic" }, "local-session-check");
  window.closeFieldSettingsModal?.();
  const placedPlayerIds = [];
  let attempts = 0;
  while (window.getV39GameState().players.some(player => player.factionState.villagePlacementMode)) {
    if (attempts++ > 8) throw new Error("初期配置の勢力切替が完了しません");
    const before = window.getV39GameState();
    const activeId = before.activePlayerId;
    let candidate = null;
    for (let y = 3; y < field.h - 3 && !candidate; y += 1) for (let x = 3; x < field.w - 3; x += 1) {
      const tile = { x, y, terrain:field.grid[y][x] };
      if (window.canPlaceV39InitialBase(tile)) { candidate = tile; break; }
    }
    if (!candidate || !window.placeV39InitialBase(candidate)) throw new Error(`初期拠点を配置できません: ${activeId}`);
    if (window.getV39GameState().activePlayerId !== activeId) placedPlayerIds.push(activeId);
  }
  const beforeTurn = window.getV39GameState();
  let enemyTurnCalls = 0;
  const originalEnemyTurn = window.runV39EnemyTurn;
  window.runV39EnemyTurn = async () => { enemyTurnCalls += 1; };
  await window.advanceV39Turn();
  const afterFirstEnd = window.getV39GameState();
  const firstEndEnemyTurnCalls = enemyTurnCalls;
  await window.advanceV39Turn();
  const afterRoundEnd = window.getV39GameState();
  window.runV39EnemyTurn = originalEnemyTurn;
  window.openFieldSettingsModal?.();
  const participantInput = document.getElementById("v39-field-local-participant-count");
  participantInput.value = "2";
  participantInput.dispatchEvent(new Event("change", { bubbles:true }));
  const assignmentInputs = [...document.querySelectorAll("[data-v39-player-assignment]")];
  const fieldSettingsPlayerCount = document.getElementById("v39-field-local-player-count")?.value || "";
  const save = window.createV39SaveData();
  const legacyGameState = structuredClone(save.gameState);
  delete legacyGameState.sessionParticipants;
  for (const player of legacyGameState.players) delete player.controllerParticipantId;
  delete legacyGameState.timeline.playerTurnOrder;
  delete legacyGameState.timeline.activeTurnPlayerId;
  delete legacyGameState.timeline.endedPlayerIds;
  const migratedLegacy = window.migrateV39SaveData({
    format:"fantasy-strategy-v39",
    version:3,
    savedAt:new Date().toISOString(),
    gameState:legacyGameState,
    field:null,
    view:null
  }).save;
  assignmentInputs[1].value = "local-2";
  document.getElementById("v39-field-generate").click();
  const generatedAssignments = Object.fromEntries(window.getV39GameState().players.map(player => [player.id, player.controllerParticipantId]));
  const generatedParticipantCount = window.getV39GameState().sessionParticipants.length;
  window.openFieldSettingsModal?.();
  document.querySelector(".v39-field-settings-body")?.scrollTo({ top:0 });
  return {
    assignedSessionCheck,
    maximumSessionCheck,
    normalSessionCheck,
    sourcePlayers:source.players.length,
    sessionParticipants:source.sessionParticipants,
    uniqueUnitIds:new Set(source.players.flatMap(player => player.factionState.units.map(unit => unit.id))).size,
    unitCount:source.players.flatMap(player => player.factionState.units).length,
    placedPlayerIds,
    placementComplete:beforeTurn.players.every(player => player.factionState.settlements.length > 0 && !player.factionState.villagePlacementMode),
    firstEnd:{
      turnNumber:afterFirstEnd.timeline.turnNumber,
      activePlayerId:afterFirstEnd.activePlayerId,
      activeTurnPlayerId:afterFirstEnd.timeline.activeTurnPlayerId,
      endedPlayerIds:afterFirstEnd.timeline.endedPlayerIds,
      enemyTurnCalls:firstEndEnemyTurnCalls
    },
    roundEnd:{
      turnNumber:afterRoundEnd.timeline.turnNumber,
      activePlayerId:afterRoundEnd.activePlayerId,
      activeTurnPlayerId:afterRoundEnd.timeline.activeTurnPlayerId,
      endedPlayerIds:afterRoundEnd.timeline.endedPlayerIds,
      enemyTurnCalls
    },
    fieldSettingsPlayerCount,
    fieldSettingsParticipantCount:participantInput.value,
    fieldSettingsAssignmentCount:assignmentInputs.length,
    fieldSettingsAssignmentBox:document.getElementById("v39-field-player-assignments")?.getBoundingClientRect().toJSON() || null,
    fieldSettingsAssignmentRow:document.getElementById("v39-field-player-assignments")?.parentElement?.getBoundingClientRect().toJSON() || null,
    fieldSettingsGameSection:document.getElementById("v39-start-game-section")?.getBoundingClientRect().toJSON() || null,
    generatedParticipantCount,
    generatedAssignments,
    fieldSettings:window.getV39FieldSettings?.() || null,
    fieldSettingsModalMode:document.getElementById("v39-field-settings-modal")?.dataset?.v39FinalSettings || "",
    save:{ version:save.version, participantCount:save.gameState.sessionParticipants.length, turnOrder:save.gameState.timeline.playerTurnOrder },
    legacyMigration:{
      version:migratedLegacy.version,
      participantCount:migratedLegacy.gameState.sessionParticipants?.length || 0,
      assignedPlayerCount:migratedLegacy.gameState.sessionParticipants?.[0]?.assignedPlayerIds?.length || 0,
      turnOrder:migratedLegacy.gameState.timeline?.playerTurnOrder || []
    }
  };
});

await page.screenshot({ path:"artifacts/v39-local-session.png", fullPage:true });
await browser.close();
const result = { report, errors };
console.log(JSON.stringify(result, null, 2));

const firstPlayerId = report?.sessionParticipants?.[0]?.assignedPlayerIds?.[0] || "";
const secondPlayerId = report?.sessionParticipants?.[0]?.assignedPlayerIds?.[1] || "";
if (errors.length
  || report.assignedSessionCheck.participantCount !== 2
  || report.assignedSessionCheck.assignments["player-1"] !== "local-1"
  || report.assignedSessionCheck.assignments["player-2"] !== "local-2"
  || report.assignedSessionCheck.assignments["player-3"] !== "local-2"
  || report.maximumSessionCheck.playerCount !== 8
  || report.maximumSessionCheck.assignedPlayerCount !== 8
  || report.maximumSessionCheck.uniqueUnitIds !== report.maximumSessionCheck.unitCount
  || report.normalSessionCheck.playerCount !== 2
  || report.normalSessionCheck.unitCount !== 0
  || report.normalSessionCheck.settlementCount !== 0
  || report.normalSessionCheck.races.some(Boolean)
  || report.sourcePlayers !== 2
  || report.sessionParticipants.length !== 1
  || report.sessionParticipants[0]?.assignedPlayerIds?.length !== 2
  || report.uniqueUnitIds !== report.unitCount
  || !report.placementComplete
  || report.firstEnd.turnNumber !== 1
  || report.firstEnd.activePlayerId !== secondPlayerId
  || report.firstEnd.activeTurnPlayerId !== secondPlayerId
  || report.firstEnd.enemyTurnCalls !== 0
  || report.roundEnd.turnNumber !== 2
  || report.roundEnd.activePlayerId !== firstPlayerId
  || report.roundEnd.activeTurnPlayerId !== firstPlayerId
  || report.roundEnd.endedPlayerIds.length !== 0
  || report.roundEnd.enemyTurnCalls !== 1
  || report.fieldSettingsPlayerCount !== "2"
  || report.fieldSettingsParticipantCount !== "2"
  || report.fieldSettingsAssignmentCount !== 2
  || report.generatedParticipantCount !== 2
  || report.generatedAssignments["player-1"] !== "local-1"
  || report.generatedAssignments["player-2"] !== "local-2"
  || report.save.version !== 4
  || report.save.participantCount !== 1
  || report.save.turnOrder.length !== 2
  || report.legacyMigration.version !== 4
  || report.legacyMigration.participantCount !== 1
  || report.legacyMigration.assignedPlayerCount !== 2
  || report.legacyMigration.turnOrder.length !== 2) process.exitCode = 1;
