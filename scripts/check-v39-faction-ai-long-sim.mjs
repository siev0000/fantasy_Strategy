import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

// 10 / 30 / 50 / 100ターンを同じ検証内容で実行できる。未指定時は短い確認用の10ターン。
const TURN_COUNT = Math.max(1, Math.floor(Number(process.env.V39_AI_SIM_TURNS) || 10));
const TURN_TIMEOUT_MS = 5000;
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
    && typeof window.advanceV39Turn === "function"
  ));
  const report = await page.evaluate(async ({ turnCount, turnTimeoutMs }) => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    document.querySelector("#v39-play-mode-select")?.remove();
    document.querySelectorAll(".vue-modal-backdrop").forEach(element => element.remove());
    const initial = window.getV39GameState();
    const human = initial.players.find(player => player.isPlayer !== false);
    if (!human) throw new Error("操作勢力を作成できません");
    const sovereignId = human.factionState?.units?.[0]?.id;
    if (!sovereignId) throw new Error("操作勢力の初期統治者がありません");
    window.setV39GameState({
      players:initial.players.map(player => player.id !== human.id ? player : ({
        ...player,
        factionState:{
          ...player.factionState,
          units:player.factionState.units.map(unit => unit.id === sovereignId ? { ...unit, isSovereign:true } : unit)
        }
      }))
    }, { reason:"faction-ai-long-sim-sovereign" });
    window.generateV39TestFieldWithSeed({ w:60, h:60, patternId:"realistic" }, "faction-ai-long-sim-check");
    await new Promise(resolve => window.setTimeout(resolve, 100));
    if (!window.autoPlaceV39InitialBases(human.id)?.ok) throw new Error("操作勢力の初期配置に失敗しました");
    const added = window.addV39TestFaction("npc");
    if (!added?.ok || !window.autoPlaceV39InitialBases(added.player.id)?.ok) throw new Error("NPC勢力の初期配置に失敗しました");

    // 勢力AIの長期検証では、別系統の敵AI演出を止めてターン解決を高速化する。
    const originalEnemyTurn = window.runV39EnemyTurn;
    window.runV39EnemyTurn = async () => undefined;
    try {
      const snapshots = [];
      for (let index = 0; index < turnCount; index += 1) {
        const beforeAdvance = window.getV39GameState();
        const advanced = await Promise.race([
          window.advanceV39Turn(),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error(`ターン${index + 1}の解決が${turnTimeoutMs}ms以内に完了しません`)), turnTimeoutMs))
        ]);
        if (advanced !== true) throw new Error(`ターン${index + 1}を進められません`);
        const state = window.getV39GameState();
        const npc = state.players.find(player => player.id === added.player.id);
        const faction = npc?.factionState;
        if (!npc || !faction) throw new Error(`ターン${index + 1}でNPC勢力状態が消えました`);
        if (!Array.isArray(faction.units) || !Array.isArray(faction.settlements)) throw new Error(`ターン${index + 1}でNPC勢力データが配列ではありません`);
        if (Number(faction.aiState?.lastProcessedTurn || 0) < Number(state.timeline?.turnNumber || 1)) {
          throw new Error(`ターン${index + 1}でAI処理記録が更新されません: ${JSON.stringify({ before:{ activePlayerId:beforeAdvance.activePlayerId, timeline:beforeAdvance.timeline }, after:{ activePlayerId:state.activePlayerId, timeline:state.timeline }, aiState:faction.aiState, npc:{ id:npc.id, isPlayer:npc.isPlayer }, players:state.players.map(row => ({ id:row.id, isPlayer:row.isPlayer })) })}`);
        }
        // 出力は節目だけにして、100ターン試験でもログを読みやすく保つ。
        if (index === 0 || (index + 1) % 10 === 0 || index + 1 === turnCount) snapshots.push({
          turn:state.timeline?.turnNumber,
          units:faction.units.length,
          settlements:faction.settlements.length,
          objective:faction.aiState?.objective?.type || "",
          lastProcessedTurn:faction.aiState?.lastProcessedTurn,
          actionHistoryCount:Array.isArray(faction.aiState?.history) ? faction.aiState.history.length : 0,
          resources:Object.keys(faction.resources || {}).length
        });
      }
      return { turnCount, snapshots, finalTurn:window.getV39GameState().timeline?.turnNumber };
    } finally {
      window.runV39EnemyTurn = originalEnemyTurn;
    }
  }, { turnCount:TURN_COUNT, turnTimeoutMs:TURN_TIMEOUT_MS });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
