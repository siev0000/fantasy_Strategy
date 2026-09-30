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
  ));
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    const initial = window.getV39GameState();
    const human = initial.players.find(player => player.isPlayer !== false);
    const added = window.addV39TestFaction("npc");
    if (!human || !added?.ok) throw new Error("検証用の2勢力を用意できません");
    window.generateV39TestFieldWithSeed({ w:60, h:60, patternId:"realistic" }, "faction-ai-foreign-objective-check");
    await new Promise(resolve => window.setTimeout(resolve, 100));

    const state = window.getV39GameState();
    const npcId = added.player.id;
    const pairKey = [human.id, npcId].sort().join("|");
    const players = state.players.map(player => {
      if (player.id === human.id) return {
        ...player,
        factionState:{ ...player.factionState, units:player.factionState.units.slice(0, 1).map(unit => ({ ...unit, x:11, y:10 })) }
      };
      if (player.id === npcId) return {
        ...player,
        factionState:{
          ...player.factionState,
          units:player.factionState.units.slice(0, 1).map(unit => ({ ...unit, x:10, y:10, ap:100, maxAp:100 })),
          exploration:{ ...player.factionState.exploration, discoveredFactionsByPlayerId:{} },
          aiState:{ ...player.factionState.aiState, lastProcessedTurn:0 }
        }
      };
      return player;
    });
    const prepared = {
      ...state,
      players,
      diplomacyRelations:{ ...state.diplomacyRelations, [pairKey]:{ pairKey, status:"peace", relationValue:-40, diplomacyPenalty:0, treaties:{} } }
    };
    window.setV39GameState(prepared, { reason:"faction-ai-foreign-objective-prepare" });

    // 索敵前は敵対友好度でもNPCが宣戦しない。
    window.dispatchEvent(new CustomEvent("v39:turn-stage-diplomacy", { detail:{ turnNumber:1 } }));
    const beforeDiscovery = window.getV39GameState();
    if (beforeDiscovery.diplomacyRelations[pairKey]?.status === "war") throw new Error("未発見勢力へNPCが宣戦しました");

    const intelligence = window.runV39FactionAiTurn(beforeDiscovery, 1, window.__v39FieldRuntime?.mapData);
    const discoveredNpc = intelligence.state.players.find(player => player.id === npcId);
    const known = discoveredNpc?.factionState?.exploration?.discoveredFactionsByPlayerId?.[human.id];
    if (!known || known.key !== "11,10") throw new Error(`索敵した他勢力を保存しません: ${JSON.stringify(known)}`);

    window.setV39GameState({ players:intelligence.state.players, diplomacyRelations:intelligence.state.diplomacyRelations }, { reason:"faction-ai-foreign-objective-discovered" });
    window.dispatchEvent(new CustomEvent("v39:turn-stage-diplomacy", { detail:{ turnNumber:2 } }));
    const afterDiplomacy = window.getV39GameState();
    if (afterDiplomacy.diplomacyRelations[pairKey]?.status !== "war") throw new Error(`発見済みの敵対勢力へNPCが宣戦しません: ${JSON.stringify({ relation:afterDiplomacy.diplomacyRelations[pairKey], known:afterDiplomacy.players.find(player => player.id === npcId)?.factionState?.exploration?.discoveredFactionsByPlayerId })}`);

    const resetAi = {
      ...afterDiplomacy,
      players:afterDiplomacy.players.map(player => player.id !== npcId ? player : ({
        ...player,
        factionState:{ ...player.factionState, aiState:{ ...player.factionState.aiState, lastProcessedTurn:0 } }
      }))
    };
    const result = window.runV39FactionAiTurn(resetAi, 2, window.__v39FieldRuntime?.mapData);
    const objective = result.state.players.find(player => player.id === npcId)?.factionState?.aiState?.objective;
    const commands = result.reports.find(row => row.playerId === npcId)?.commands || [];
    const combatAction = result.reports.find(row => row.playerId === npcId)?.combatActions?.[0];
    if (objective?.type !== "foreign-faction" || objective.targetPlayerId !== human.id) {
      throw new Error(`戦時に発見済み他勢力を目的化しません: ${JSON.stringify(objective)}`);
    }
    if (!commands.some(command => command === `目的:他勢力 ${known.playerName}`)) throw new Error(`AIログに他勢力目的が残りません: ${commands.join(" / ")}`);
    if (!combatAction) throw new Error(`射程内の敵対勢力へ攻撃計画を作りません: ${commands.join(" / ")}`);
    window.setV39GameState({ players:result.state.players, diplomacyRelations:result.state.diplomacyRelations }, { reason:"faction-ai-foreign-combat" });
    const beforeAttack = window.getV39GameState().players.find(player => player.id === npcId)?.factionState?.units?.find(unit => unit.id === combatAction.attackerId);
    const resolved = window.executeV39FactionCombatAction?.(combatAction);
    const afterAttack = window.getV39GameState().players.find(player => player.id === npcId)?.factionState?.units?.find(unit => unit.id === combatAction.attackerId);
    if (resolved !== true || !(Number(afterAttack?.ap) < Number(beforeAttack?.ap))) {
      throw new Error(`NPC国家攻撃が既存戦闘へ接続されません: ${JSON.stringify({ resolved, beforeAp:beforeAttack?.ap, afterAp:afterAttack?.ap, combatAction })}`);
    }
    return { known, objective, commands, combatAction:{ attackerId:combatAction.attackerId, targetUnitId:combatAction.targetUnitId, skillName:combatAction.skillRow?.名前 } };
  });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
