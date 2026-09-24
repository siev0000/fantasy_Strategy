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

  const settingsUpdated = nextEvent(host, "room:snapshot", snapshot => snapshot.settings.factionCount === 2);
  host.emit("room:update-settings", {
    roomId:hostCredentials.roomId,
    settings:{
      factionCount:2,
      playerParticipantAssignments:{ "player-1":hostCredentials.participantId, "player-2":guestCredentials.participantId }
    }
  });
  const settingsSnapshot = await settingsUpdated;
  const guestEntry = settingsSnapshot.participants.find(participant => participant.participantId === guestCredentials.participantId);
  if (!guestEntry?.assignedPlayerIds.includes("player-2")) fail("担当勢力が参加者へ反映されません。");

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

  const rejected = nextEvent(guest, "room:error", payload => /ホスト/.test(String(payload?.message || "")));
  guest.emit("room:update-settings", { roomId:hostCredentials.roomId, settings:{ factionCount:1 } });
  await rejected;

  const bothReady = nextEvent(host, "room:snapshot", snapshot => snapshot.participants.length === 2 && snapshot.participants.every(participant => participant.ready));
  host.emit("room:ready", { roomId:hostCredentials.roomId, ready:true });
  guest.emit("room:ready", { roomId:hostCredentials.roomId, ready:true });
  await bothReady;

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

  host.close();
  rejoinedGuest.close();
  console.log("v39 room lobby check passed");
} finally {
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), new Promise(resolve => setTimeout(resolve, 1000))]);
}
