import { spawn } from "node:child_process";
import { once } from "node:events";
import { io } from "socket.io-client";

const port = 32100 + Math.floor(Math.random() * 800);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.js"], {
  cwd:process.cwd(),
  env:{ ...process.env, PORT:String(port), HOST:"127.0.0.1", NODE_ENV:"production" },
  stdio:["ignore", "pipe", "pipe"]
});

function fail(message) {
  throw new Error(message);
}

function waitFor(predicate, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("待機がタイムアウトしました。")), timeoutMs);
    const check = value => {
      if (!predicate(value)) return;
      clearTimeout(timeout);
      resolve(value);
    };
    resolve.check = check;
  });
}

function nextEvent(socket, event, predicate = () => true, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`${event} の受信がタイムアウトしました。`));
    }, timeoutMs);
    const handler = payload => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

async function waitForServer() {
  let output = "";
  server.stdout.on("data", chunk => { output += String(chunk); });
  server.stderr.on("data", chunk => { output += String(chunk); });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (output.includes("Fantasy Strategy server listening")) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  fail(`サーバーを起動できませんでした: ${output}`);
}

function connectClient() {
  const client = io(baseUrl, { path:"/socket.io", transports:["websocket"] });
  return once(client, "connect").then(() => client);
}

try {
  await waitForServer();
  const host = await connectClient();
  const hostCreated = nextEvent(host, "room:created");
  host.emit("room:create", { playerName:"ホスト", roomName:"テスト用ルーム", mode:"v39-world", protocolVersion:"v39-room-v1" });
  const hostCredentials = await hostCreated;
  if (!hostCredentials.roomId || !hostCredentials.participantId || !hostCredentials.reconnectToken) fail("ホストの再接続情報が返りません。");
  if (!/^\d{8}$/.test(hostCredentials.roomId)) fail("ルームIDが8桁の数字ではありません。");
  if (hostCredentials.roomName !== "テスト用ルーム") fail("ルーム名が作成結果へ返りません。");
  const initialSnapshot = await nextEvent(host, "room:snapshot", snapshot => snapshot.roomId === hostCredentials.roomId);
  if (initialSnapshot.hostParticipantId !== hostCredentials.participantId || initialSnapshot.participants.length !== 1) fail("ホスト作成後のロビー状態が不正です。");
  if (initialSnapshot.roomName !== "テスト用ルーム") fail("ルーム名がロビースナップショットへ反映されません。");

  const invalidJoiner = await connectClient();
  const invalidRoomId = nextEvent(invalidJoiner, "room:error", payload => /8桁の数字/.test(String(payload?.message || "")));
  invalidJoiner.emit("room:join", { roomId:"ROOM-TEST", playerName:"形式確認", mode:"v39-world", protocolVersion:"v39-room-v1" });
  await invalidRoomId;
  invalidJoiner.close();

  const secondHost = await connectClient();
  const secondRoomCreated = nextEvent(secondHost, "room:created");
  secondHost.emit("room:create", { playerName:"別ホスト", roomName:"別ルーム", mode:"v39-world", protocolVersion:"v39-room-v1" });
  const secondCredentials = await secondRoomCreated;
  if (!/^\d{8}$/.test(secondCredentials.roomId)) fail("2件目のルームIDが8桁の数字ではありません。");
  if (secondCredentials.roomId === hostCredentials.roomId) fail("自動生成ルームIDが重複しました。");
  secondHost.close();

  const guest = await connectClient();
  const hostAfterJoin = nextEvent(host, "room:snapshot", snapshot => snapshot.participants.length === 2);
  const guestJoined = nextEvent(guest, "room:joined");
  guest.emit("room:join", { roomId:hostCredentials.roomId, playerName:"参加者", mode:"v39-world", protocolVersion:"v39-room-v1" });
  const guestCredentials = await guestJoined;
  const joinedSnapshot = await hostAfterJoin;
  if (joinedSnapshot.participants.some(participant => !participant.connected)) fail("参加者の接続状態が不正です。");
  if (joinedSnapshot.settings?.factionCount !== 2) fail("2人目参加時に操作勢力数が2へ自動増加しません。");
  if (joinedSnapshot.settings?.playerParticipantAssignments?.["player-1"] !== hostCredentials.participantId
    || joinedSnapshot.settings?.playerParticipantAssignments?.["player-2"] !== guestCredentials.participantId) {
    fail("参加人数に応じた担当勢力の自動割当が不正です。");
  }
  const guestEntry = joinedSnapshot.participants.find(participant => participant.participantId === guestCredentials.participantId);
  if (!guestEntry?.assignedPlayerIds.includes("player-2")) fail("自動追加された勢力が参加者へ反映されません。");

  const minimumFactionSnapshotPromise = nextEvent(host, "room:snapshot", snapshot =>
    snapshot.settings?.factionCount === 2
    && snapshot.settings?.playerParticipantAssignments?.["player-2"] === guestCredentials.participantId
  );
  host.emit("room:update-settings", {
    roomId:hostCredentials.roomId,
    settings:{ ...joinedSnapshot.settings, factionCount:1 }
  });
  const settingsSnapshot = await minimumFactionSnapshotPromise;
  if (settingsSnapshot.settings.factionCount !== 2) fail("操作勢力数を参加者数未満へ減らせてしまいます。");

  const sharedGameSetup = {
    mapSize:"36x36",
    patternId:"balanced",
    mountainMode:"mixed",
    enemySpawnTileDivisor:40,
    neutralVillageCount:2,
    gameSettings:{ turnProgressionMode:"standard", maxCombatTurnsPerWorldTurn:6 },
    islandCustomSettings:{ enabled:false, worldWrapEnabled:true }
  };
  const gameSetupSaved = nextEvent(host, "room:snapshot", snapshot => snapshot.settings?.gameSetup?.mapSize === "36x36");
  host.emit("room:update-settings", {
    roomId:hostCredentials.roomId,
    settings:{ ...settingsSnapshot.settings, gameSetup:sharedGameSetup }
  });
  const gameSetupSnapshot = await gameSetupSaved;
  if (gameSetupSnapshot.settings.gameSetup?.patternId !== "balanced") fail("共有ゲーム設定が保存されません。");

  const hostFactionSelected = nextEvent(host, "room:snapshot", snapshot => snapshot.settings?.playerFactionSelections?.["player-1"] === "只人");
  host.emit("room:select-faction", { roomId:hostCredentials.roomId, playerId:"player-1", raceKey:"只人" });
  await hostFactionSelected;
  const guestFactionSelected = nextEvent(host, "room:snapshot", snapshot => snapshot.settings?.playerFactionSelections?.["player-2"] === "オーガ");
  guest.emit("room:select-faction", { roomId:hostCredentials.roomId, playerId:"player-2", raceKey:"オーガ" });
  await guestFactionSelected;

  const rejected = nextEvent(guest, "room:error", payload => /ホスト/.test(String(payload?.message || "")));
  guest.emit("room:update-settings", { roomId:hostCredentials.roomId, settings:{ factionCount:1 } });
  await rejected;

  const bothReady = nextEvent(host, "room:snapshot", snapshot => snapshot.participants.length === 2 && snapshot.participants.every(participant => participant.ready));
  host.emit("room:ready", { roomId:hostCredentials.roomId, ready:true });
  guest.emit("room:ready", { roomId:hostCredentials.roomId, ready:true });
  const readySnapshot = await bothReady;

  const gameSetupChangedWithoutUnready = nextEvent(host, "room:snapshot", snapshot =>
    snapshot.settings?.gameSetup?.neutralVillageCount === 3
    && snapshot.participants.every(participant => participant.ready)
  );
  host.emit("room:update-settings", {
    roomId:hostCredentials.roomId,
    settings:{
      ...readySnapshot.settings,
      gameSetup:{ ...readySnapshot.settings.gameSetup, neutralVillageCount:3 }
    }
  });
  await gameSetupChangedWithoutUnready;

  const disconnected = nextEvent(host, "room:snapshot", snapshot => snapshot.participants.some(participant => participant.participantId === guestCredentials.participantId && !participant.connected));
  guest.close();
  await disconnected;

  const rejoinedGuest = await connectClient();
  const reconnected = nextEvent(host, "room:snapshot", snapshot => snapshot.participants.some(participant => participant.participantId === guestCredentials.participantId && participant.connected));
  const rejoinAccepted = nextEvent(rejoinedGuest, "room:joined");
  rejoinedGuest.emit("room:join", {
    roomId:hostCredentials.roomId,
    playerName:"参加者",
    mode:"v39-world",
    protocolVersion:"v39-room-v1",
    participantId:guestCredentials.participantId,
    reconnectToken:guestCredentials.reconnectToken
  });
  const rejoinedCredentials = await rejoinAccepted;
  await reconnected;
  if (rejoinedCredentials.participantId !== guestCredentials.participantId) fail("再接続時に参加者IDが変化しました。");

  const hostStartRequest = nextEvent(host, "game:start:host");
  const guestStarting = nextEvent(rejoinedGuest, "game:starting");
  host.emit("game:start", { roomId:hostCredentials.roomId });
  const startPayload = await hostStartRequest;
  await guestStarting;
  if (startPayload.settings?.factionCount !== 2 || startPayload.participants?.length !== 2) fail("ゲーム開始要求にロビー設定が含まれていません。");

  const setupSnapshotJson = JSON.stringify({
    format:"fantasy-strategy-v39",
    version:4,
    savedAt:new Date().toISOString(),
    gameState:{
      players:[
        { id:"player-1", race:"只人", controllerParticipantId:hostCredentials.participantId, factionState:{ units:[], settlements:[], villagePlacementMode:false } },
        { id:"player-2", race:"オーガ", controllerParticipantId:guestCredentials.participantId, factionState:{ units:[], settlements:[], villagePlacementMode:false } }
      ],
      sessionParticipants:[
        { participantId:hostCredentials.participantId, assignedPlayerIds:["player-1"] },
        { participantId:guestCredentials.participantId, assignedPlayerIds:["player-2"] }
      ]
    },
    field:{ settings:{ w:1, h:1 }, mapData:{ w:1, h:1, grid:[["平原"]] } },
    view:null
  });
  const guestSetupSnapshot = nextEvent(rejoinedGuest, "game:setup-snapshot");
  host.emit("game:snapshot", { roomId:hostCredentials.roomId, snapshotJson:setupSnapshotJson });
  const receivedSetupSnapshot = await guestSetupSnapshot;
  if (receivedSetupSnapshot.snapshotJson !== setupSnapshotJson) fail("初期設定スナップショットが参加者へ配信されません。");

  const profileForwarded = nextEvent(host, "game:setup-profile:host", payload => payload?.profile?.playerId === "player-2");
  rejoinedGuest.emit("game:setup-profile", {
    roomId:hostCredentials.roomId,
    playerId:"player-2",
    className:"ファイター",
    characterName:"ゲスト王",
    villageName:"ゲスト村"
  });
  const forwardedProfile = await profileForwarded;
  if (forwardedProfile.participantId !== guestCredentials.participantId) fail("統治者設定要求の参加者が一致しません。");

  const placementForwarded = nextEvent(host, "game:setup-place:host", payload => payload?.playerId === "player-2");
  rejoinedGuest.emit("game:setup-place", { roomId:hostCredentials.roomId, playerId:"player-2", x:0, y:0 });
  const forwardedPlacement = await placementForwarded;
  if (forwardedPlacement.x !== 0 || forwardedPlacement.y !== 0) fail("初期拠点配置要求がホストへ転送されません。");

  const snapshotJson = JSON.stringify({
    format:"fantasy-strategy-v39",
    version:4,
    savedAt:new Date().toISOString(),
    gameState:{
      players:[
        {
          id:"player-1", race:"只人", controllerParticipantId:hostCredentials.participantId,
          factionState:{ units:[{ id:"s1", isSovereign:true }], settlements:[{ id:"v1", placed:true }], villagePlacementMode:false }
        },
        {
          id:"player-2", race:"オーガ", controllerParticipantId:guestCredentials.participantId,
          factionState:{ units:[{ id:"s2", isSovereign:true }], settlements:[{ id:"v2", placed:true }], villagePlacementMode:false }
        }
      ],
      sessionParticipants:[
        { participantId:hostCredentials.participantId, assignedPlayerIds:["player-1"] },
        { participantId:guestCredentials.participantId, assignedPlayerIds:["player-2"] }
      ]
    },
    field:{ settings:{ w:1, h:1 }, mapData:{ w:1, h:1, grid:[["平原"]] } },
    view:null
  });
  const guestGameSnapshot = nextEvent(rejoinedGuest, "game:snapshot");
  const hostStarted = nextEvent(host, "game:started");
  const guestStarted = nextEvent(rejoinedGuest, "game:started");
  host.emit("game:setup-complete", { roomId:hostCredentials.roomId, snapshotJson });
  const receivedGameSnapshot = await guestGameSnapshot;
  await Promise.all([hostStarted, guestStarted]);
  if (receivedGameSnapshot.snapshotJson !== snapshotJson) fail("初期配置完了後のゲーム状態が参加者へ配信されません。");

  const lateJoiner = await connectClient();
  const lateJoinRejected = nextEvent(lateJoiner, "room:error", payload => /ゲーム開始後/.test(String(payload?.message || "")));
  lateJoiner.emit("room:join", {
    roomId:hostCredentials.roomId,
    playerName:"途中参加",
    mode:"v39-world",
    protocolVersion:"v39-room-v1"
  });
  await lateJoinRejected;
  lateJoiner.close();

  rejoinedGuest.close();
  const guestAfterStart = await connectClient();
  const reconnectAfterStartAccepted = nextEvent(guestAfterStart, "room:joined");
  const reconnectAfterStartSnapshot = nextEvent(guestAfterStart, "game:snapshot");
  guestAfterStart.emit("room:join", {
    roomId:hostCredentials.roomId,
    playerName:"参加者",
    mode:"v39-world",
    protocolVersion:"v39-room-v1",
    participantId:guestCredentials.participantId,
    reconnectToken:guestCredentials.reconnectToken
  });
  const afterStartCredentials = await reconnectAfterStartAccepted;
  const afterStartSnapshot = await reconnectAfterStartSnapshot;
  if (afterStartCredentials.participantId !== guestCredentials.participantId || afterStartSnapshot.snapshotJson !== snapshotJson) {
    fail("ゲーム開始後の再接続で元参加者・ゲーム状態へ復帰できません。");
  }

  const explicitLeaveNotice = nextEvent(guestAfterStart, "room:left");
  const explicitLeaveDisconnected = nextEvent(host, "room:snapshot", snapshot => snapshot.participants.some(
    participant => participant.participantId === guestCredentials.participantId && !participant.connected
  ));
  guestAfterStart.emit("room:leave");
  const explicitLeavePayload = await explicitLeaveNotice;
  await explicitLeaveDisconnected;
  if (explicitLeavePayload?.reconnectable !== true || explicitLeavePayload?.roomId !== hostCredentials.roomId) {
    fail("ゲーム中の切断で再参加情報が保持されません。");
  }

  const guestAfterExplicitLeave = await connectClient();
  const explicitRejoinAccepted = nextEvent(guestAfterExplicitLeave, "room:joined");
  const explicitRejoinSnapshot = nextEvent(guestAfterExplicitLeave, "game:snapshot");
  guestAfterExplicitLeave.emit("room:join", {
    roomId:hostCredentials.roomId,
    playerName:"参加者",
    mode:"v39-world",
    protocolVersion:"v39-room-v1",
    participantId:guestCredentials.participantId,
    reconnectToken:guestCredentials.reconnectToken
  });
  const explicitRejoinCredentials = await explicitRejoinAccepted;
  const explicitRejoinGameSnapshot = await explicitRejoinSnapshot;
  if (explicitRejoinCredentials.participantId !== guestCredentials.participantId || explicitRejoinGameSnapshot.snapshotJson !== snapshotJson) {
    fail("ゲーム中に明示切断した参加者が元ゲームへ再参加できません。");
  }

  host.close();
  guestAfterExplicitLeave.close();
  console.log("v39 room lobby check passed");
} finally {
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), new Promise(resolve => setTimeout(resolve, 1000))]);
}
