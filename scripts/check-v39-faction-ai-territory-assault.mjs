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
    && typeof window.executeV39FactionTerritoryAssault === "function"
  ));
  const report = await page.evaluate(() => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    const initial = window.getV39GameState();
    const defender = initial.players.find(player => player.isPlayer !== false);
    const added = window.addV39TestFaction("npc");
    if (!defender || !added?.ok) throw new Error("検証用の両勢力を作成できません");
    const attackerPlayerId = added.player.id;
    const attackerId = added.player.factionState.units[0]?.id;
    const defenderUnitId = defender.factionState.units[0]?.id;
    if (!attackerId || !defenderUnitId) throw new Error("検証用ユニットを作成できません");
    const tileKey = "12,12";
    const pairKey = [defender.id, attackerPlayerId].sort().join("|");
    const prepared = {
      ...window.getV39GameState(),
      territoryOwnerByTile:{ [tileKey]:defender.id },
      territoryStateByTile:{ [tileKey]:{ status:"領土", settlementId:"test", hp:1000, maxHp:1000 } },
      diplomacyRelations:{ [pairKey]:{ pairKey, status:"war", relationValue:-40, treaties:{} } },
      players:window.getV39GameState().players.map(player => {
        if (player.id === attackerPlayerId) return {
          ...player,
          factionState:{
            ...player.factionState,
            aiState:{ ...player.factionState.aiState, lastProcessedTurn:0 },
            units:player.factionState.units.map(unit => unit.id === attackerId ? { ...unit, x:12, y:12, ap:100, currentAp:100, actionPoint:100 } : unit)
          }
        };
        if (player.id === defender.id) return {
          ...player,
          factionState:{ ...player.factionState, units:player.factionState.units.map(unit => ({ ...unit, hp:0, currentHp:0, state:"死亡" })) }
        };
        return player;
      })
    };
    window.setV39GameState(prepared, { reason:"faction-territory-assault-check-prepare" });
    const planned = window.runV39FactionAiTurn(window.getV39GameState(), 2, window.__v39FieldRuntime?.mapData);
    const action = planned.reports.find(row => row.playerId === attackerPlayerId)?.territoryActions?.[0];
    if (!action) throw new Error(`NPCが敵対領土への攻撃を計画しません: ${JSON.stringify(planned.reports)}`);
    window.setV39GameState({ players:planned.state.players }, { reason:"faction-territory-assault-check-plan" });
    const before = window.getV39GameState();
    const beforeAp = before.players.find(player => player.id === attackerPlayerId)?.factionState.units.find(unit => unit.id === attackerId)?.ap;
    const result = window.executeV39FactionTerritoryAssault({ ...action, turnNumber:2 });
    const after = window.getV39GameState();
    const afterAp = after.players.find(player => player.id === attackerPlayerId)?.factionState.units.find(unit => unit.id === attackerId)?.ap;
    const territory = after.territoryStateByTile[tileKey];
    if (!result.ok || !(Number(territory.hp) < 1000) || !(Number(afterAp) < Number(beforeAp))) {
      throw new Error(`領土攻撃が領土HP・APへ反映されません: ${JSON.stringify({ result, beforeAp, afterAp, territory })}`);
    }
    if (after.territoryOwnerByTile[tileKey] !== defender.id) throw new Error("未確定の所有権移転が発生しました");
    return { action:{ skillName:action.skillRow?.名前, tileKey:action.tileKey }, result, beforeAp, afterAp, territory };
  });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
