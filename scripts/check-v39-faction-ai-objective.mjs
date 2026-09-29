import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.startV39LocalSession === "function" && typeof window.runV39FactionAiTurn === "function");
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    const session = window.getV39GameState();
    const human = session.players.find(player => player.isPlayer !== false);
    const sovereignId = human?.factionState?.units?.[0]?.id;
    if (!human || !sovereignId) throw new Error("初期統治者がありません");
    window.setV39GameState({ players:session.players.map(player => player.id !== human.id ? player : ({
      ...player, factionState:{ ...player.factionState, units:player.factionState.units.map(unit => unit.id === sovereignId ? { ...unit, isSovereign:true } : unit) }
    })) }, { reason:"faction-ai-objective-sovereign" });
    window.generateV39TestFieldWithSeed({ w:60, h:60, patternId:"realistic" }, "faction-ai-objective-check");
    await new Promise(resolve => window.setTimeout(resolve, 100));
    if (!window.autoPlaceV39InitialBases(human.id)?.ok) throw new Error("プレイヤー初期配置に失敗しました");
    const added = window.addV39TestFaction("npc");
    if (!added?.ok || !window.autoPlaceV39InitialBases(added.player.id)?.ok) throw new Error("NPC初期配置に失敗しました");
    const before = window.getV39GameState();
    const target = Object.values(before.victoryLandmarksByTile || {})[0];
    if (!target) throw new Error("勝利対象土地がありません");
    const players = before.players.map(player => player.id !== added.player.id ? player : ({
      ...player,
      factionState:{
        ...player.factionState,
        exploration:{
          ...player.factionState.exploration,
          discoveredFeaturesByTile:{ ...player.factionState.exploration.discoveredFeaturesByTile, [target.key]:{ ...target } }
        }
      }
    }));
    const prepared = { ...before, players };
    const result = window.runV39FactionAiTurn(prepared, 1, window.__v39FieldRuntime?.mapData);
    const npc = result.state.players.find(player => player.id === added.player.id);
    const objective = npc?.factionState?.aiState?.objective;
    const commands = result.reports.find(row => row.playerId === added.player.id)?.commands || [];
    if (objective?.type !== "victory-landmark" || objective.targetTileKey !== target.key) {
      throw new Error(`NPCが自勢力発見済みの勝利対象を目的化しません: ${JSON.stringify(objective)}`);
    }
    if (!commands.some(command => command === `目的:勝利対象 ${target.name}`)) throw new Error(`AIログに勝利目標が残りません: ${commands.join(" / ")}`);
    return { objective, commands };
  });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
