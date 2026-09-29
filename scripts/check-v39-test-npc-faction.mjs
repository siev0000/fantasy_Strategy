import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.waitForFunction(() => (
    typeof window.startV39LocalSession === "function"
    && typeof window.addV39TestFaction === "function"
    && typeof window.autoPlaceV39InitialBases === "function"
  ));
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    const session = window.getV39GameState();
    const sessionPlayer = session.players.find(player => player.isPlayer !== false);
    const sovereignId = sessionPlayer?.factionState?.units?.[0]?.id;
    if (!sessionPlayer || !sovereignId) throw new Error("初期編成ユニットがありません");
    window.setV39GameState({
      players:session.players.map(player => player.id !== sessionPlayer.id ? player : ({
        ...player,
        factionState:{
          ...player.factionState,
          units:player.factionState.units.map(unit => unit.id === sovereignId ? { ...unit, isSovereign:true } : unit)
        }
      }))
    }, { reason:"npc-faction-check-sovereign" });
    window.generateV39TestFieldWithSeed({ w:60, h:60, patternId:"realistic" }, "npc-faction-check");
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const initial = window.getV39GameState();
    const human = initial.players.find(player => player.isPlayer !== false);
    const humanPlacement = window.autoPlaceV39InitialBases(human?.id);
    if (!humanPlacement?.ok) throw new Error(`プレイヤー初期配置に失敗: ${humanPlacement?.reason || "不明"}`);

    window.setV39TestMode?.(true);
    window.openV39TestTools?.();
    const addNpcButton = document.querySelector('[data-test-action="faction-npc"]');
    if (!(addNpcButton instanceof HTMLButtonElement)) throw new Error("TEST ONのNPC勢力追加ボタンが表示されません");
    addNpcButton.click();
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const state = window.getV39GameState();
    const npc = state.players.find(player => player.isPlayer === false);
    const settlement = npc?.factionState?.settlements?.find(row => row?.placed);
    if (!npc || !settlement || !(npc.factionState.units || []).every(unit => Number.isFinite(Number(unit?.x)) && Number.isFinite(Number(unit?.y)))) {
      throw new Error("NPC勢力の拠点またはユニット初期配置が完了していません");
    }
    if ((state.sessionParticipants || []).some(participant => (participant.assignedPlayerIds || []).includes(npc.id))) {
      throw new Error("NPC勢力が参加者へ割り当てられています");
    }
    if ((state.timeline?.playerTurnOrder || []).includes(npc.id)) {
      throw new Error("NPC勢力が手動操作ターンに含まれています");
    }
    const save = window.createV39SaveData?.();
    const savedNpc = save?.gameState?.players?.find(player => player.id === npc.id);
    if (savedNpc?.isPlayer !== false || !savedNpc?.factionState?.settlements?.some(row => row?.placed)) {
      throw new Error("NPC勢力がセーブへ保存されません");
    }
    return { npcId:npc.id, label:npc.label, settlementId:settlement.settlementId, unitCount:npc.factionState.units.length, saved:true };
  });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
