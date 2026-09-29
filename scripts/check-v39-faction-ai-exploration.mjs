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
    && typeof window.runV39FactionAiTurn === "function"
    && typeof window.setV39GameState === "function"
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
    }, { reason:"faction-ai-exploration-sovereign" });
    window.generateV39TestFieldWithSeed({ w:60, h:60, patternId:"realistic" }, "faction-ai-exploration-check");
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const human = window.getV39GameState().players.find(player => player.isPlayer !== false);
    const humanPlacement = window.autoPlaceV39InitialBases(human?.id);
    if (!humanPlacement?.ok) throw new Error(`プレイヤー初期配置に失敗: ${humanPlacement?.reason || "不明"}`);

    const added = window.addV39TestFaction("npc");
    if (!added?.ok) throw new Error(`NPC勢力追加に失敗: ${added?.reason || "不明"}`);
    const npcPlacement = window.autoPlaceV39InitialBases(added.player.id);
    if (!npcPlacement?.ok) throw new Error(`NPC初期配置に失敗: ${npcPlacement?.reason || "不明"}`);
    const initial = window.getV39GameState();
    const npc = initial.players.find(player => player.id === added.player.id);
    if (!npc?.factionState?.units?.length) throw new Error("NPC探索ユニットがありません");

    const first = window.runV39FactionAiTurn(initial, 1, window.__v39FieldRuntime?.mapData);
    const startedTasks = first.state.players.find(player => player.id === npc.id)?.factionState?.units
      ?.filter(unit => unit?.surveyTask) || [];
    if (!startedTasks.length || !first.reports[0]?.commands?.some(command => command.startsWith("調査:"))) {
      throw new Error("NPCが未調査地点の調査を開始しません");
    }

    window.setV39GameState({ players:first.state.players }, { reason:"faction-ai-exploration-check" });
    window.dispatchEvent(new CustomEvent("v39:turn-stage-exploration", { detail:{ turnNumber:1 } }));
    const surveyed = window.getV39GameState();
    const beforeMove = surveyed.players.find(player => player.id === npc.id)?.factionState?.units || [];
    const positionsBefore = new Map(beforeMove.map(unit => [unit.id, `${unit.x},${unit.y}`]));
    const second = window.runV39FactionAiTurn(surveyed, 2, window.__v39FieldRuntime?.mapData);
    const afterMove = second.state.players.find(player => player.id === npc.id)?.factionState?.units || [];
    const moved = afterMove.some(unit => positionsBefore.get(unit.id) !== `${unit.x},${unit.y}`);
    const moveCommands = second.reports[0]?.commands?.filter(command => command.startsWith("探索移動:")) || [];
    if (!moved || !moveCommands.length) throw new Error(`NPCが調査済み地点から未調査の隣接地点へ移動しません: ${JSON.stringify({ first:first.reports[0]?.commands, second:second.reports[0]?.commands, before:beforeMove.map(unit => ({ id:unit.id, x:unit.x, y:unit.y, ap:unit.ap })), after:afterMove.map(unit => ({ id:unit.id, x:unit.x, y:unit.y, ap:unit.ap })) })}`);

    const movedUnit = afterMove.find(unit => positionsBefore.get(unit.id) !== `${unit.x},${unit.y}`);
    if (!(Number(movedUnit?.ap) < Number(movedUnit?.maxAp))) throw new Error("NPC移動で共通APが消費されません");
    document.getElementById("playModeSelectModal")?.classList.remove("open");
    return { firstCommands:first.reports[0].commands, secondCommands:second.reports[0].commands, movedUnit:{ id:movedUnit.id, ap:movedUnit.ap, maxAp:movedUnit.maxAp } };
  });
  await page.screenshot({ path:"output/web-game/v39-faction-ai-exploration.png", fullPage:false });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
