import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

// 一般村の長期挙動を実ゲームと同じターン経路で確認する。10 / 30 / 50 / 100 を環境変数で切替可能。
const TURN_COUNT = Math.max(1, Math.floor(Number(process.env.V39_VILLAGE_SIM_TURNS) || 10));
const TURN_TIMEOUT_MS = 10_000;
const RUN_ENEMY_AI = process.env.V39_VILLAGE_SIM_WITH_ENEMY_AI === "1";
const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.waitForFunction(() => (
    typeof window.startV39LocalSession === "function"
    && typeof window.generateV39TestFieldWithSeed === "function"
    && typeof window.autoPlaceV39InitialBases === "function"
    && typeof window.advanceV39Turn === "function"
  ));
  const report = await page.evaluate(async ({ turnCount, turnTimeoutMs, runEnemyAi }) => {
    const alive = unit => Number(unit?.hp ?? unit?.currentHp ?? 0) > 0 && unit?.state !== "死亡";
    const snapshot = (state, turn) => ({
      turn,
      villages:(state?.neutralVillages || []).map(village => ({
        id:village.id,
        population:Number(village.population || 0),
        researchExp:Number(village.researchExp || 0),
        territoryTiles:Array.isArray(village.territoryTileKeys) ? village.territoryTileKeys.length : 0,
        defenseUnits:(village.defenseUnits || []).length,
        livingDefenseUnits:(village.defenseUnits || []).filter(alive).length,
        lastProcessedTurn:Number(village.lastProcessedTurn || 0),
        raid:village.raidState?.turn === turn ? {
          defended:village.raidState.defended === true,
          populationLoss:Number(village.raidState.populationLoss || 0)
        } : null
      })).sort((left, right) => String(left.id).localeCompare(String(right.id), "ja"))
    });
    const assertVillages = (state, expectedIds, turn) => {
      const villages = Array.isArray(state?.neutralVillages) ? state.neutralVillages : [];
      const ids = villages.map(village => String(village?.id || ""));
      if (new Set(ids).size !== ids.length) throw new Error(`ターン${turn}: 一般村IDが重複しています`);
      if (ids.length !== expectedIds.length || ids.some(id => !expectedIds.includes(id))) {
        throw new Error(`ターン${turn}: 一般村が消失または追加されました: ${JSON.stringify(ids)}`);
      }
      for (const village of villages) {
        if (!Number.isFinite(Number(village?.population)) || Number(village.population) < 1) throw new Error(`ターン${turn}: ${village?.name || village?.id}の人口が不正です`);
        if (!Array.isArray(village?.territoryTileKeys) || village.territoryTileKeys.length !== 7) throw new Error(`ターン${turn}: ${village?.name || village?.id}の領域が7マスではありません`);
        if (Number(village?.lastProcessedTurn || 0) < turn) throw new Error(`ターン${turn}: ${village?.name || village?.id}のターン処理が実行されていません`);
        for (const guard of village?.defenseUnits || []) {
          if (!Number.isFinite(Number(guard?.x)) || !Number.isFinite(Number(guard?.y))) throw new Error(`ターン${turn}: 守備軍の座標が不正です`);
        }
      }
    };

    window.startV39LocalSession(1, { playMode:"single-test" });
    document.querySelector("#v39-play-mode-select")?.remove();
    document.querySelectorAll(".vue-modal-backdrop").forEach(element => element.remove());
    const session = window.getV39GameState();
    const sessionHuman = session?.players?.find(player => player?.isPlayer !== false);
    const sovereignId = sessionHuman?.factionState?.units?.[0]?.id;
    if (!sessionHuman || !sovereignId) throw new Error("操作勢力の初期統治者を準備できません");
    // 統治者作成モーダルを経ない試験用に、既存の長期Bot試験と同じ最小初期化を行う。
    window.setV39GameState({
      players:session.players.map(player => player.id !== sessionHuman.id ? player : ({
        ...player,
        factionState:{
          ...player.factionState,
          units:player.factionState.units.map(unit => unit.id === sovereignId ? { ...unit, isSovereign:true } : unit)
        }
      }))
    }, { reason:"neutral-village-long-sim-sovereign" });
    window.generateV39TestFieldWithSeed({ w:30, h:30, patternId:"realistic", neutralVillageCount:2 }, "neutral-village-long-sim");
    await new Promise(resolve => window.setTimeout(resolve, 150));
    const initial = window.getV39GameState();
    const human = initial?.players?.find(player => player?.isPlayer !== false);
    if (!human || !window.autoPlaceV39InitialBases(human.id)?.ok) throw new Error("操作勢力の初期拠点を配置できません");
    // 自動配置は手動配置の最後に出る完了イベントを発火しないため、ワールド人口生成も実プレイと同じ完了契機へ揃える。
    window.dispatchEvent(new CustomEvent("v39:initial-placement-complete", { detail:{ playerId:human.id } }));
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const seeded = window.getV39GameState();
    const villageIds = (seeded?.neutralVillages || []).map(village => String(village.id)).sort();
    if (villageIds.length !== 2) throw new Error(`一般村を2件生成できません: ${villageIds.length}`);

    // 抽象襲撃・人口・守備隊の長期検証では、時間を使う敵行動演出を除外する。
    // 実敵との相互戦闘は check-v39-neutral-village-defense.mjs が担当する。
    const originalEnemyTurn = window.runV39EnemyTurn;
    if (!runEnemyAi) window.runV39EnemyTurn = async () => undefined;
    try {
      const snapshots = [snapshot(seeded, Number(seeded?.timeline?.turnNumber || 1))];
      let raidCount = 0;
      let defendedRaidCount = 0;
      let populationLoss = 0;
      for (let index = 0; index < turnCount; index += 1) {
        const advanced = await Promise.race([
          window.advanceV39Turn(),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error(`ターン${index + 1}の解決が${turnTimeoutMs}ms以内に完了しません`)), turnTimeoutMs))
        ]);
        if (advanced !== true) throw new Error(`ターン${index + 1}を進められません`);
        const state = window.getV39GameState();
        const turn = Number(state?.timeline?.turnNumber || 0);
        assertVillages(state, villageIds, turn);
        const current = snapshot(state, turn);
        for (const village of current.villages) if (village.raid) {
          raidCount += 1;
          if (village.raid.defended) defendedRaidCount += 1;
          populationLoss += village.raid.populationLoss;
        }
        if (index === 0 || (index + 1) % 10 === 0 || index + 1 === turnCount) snapshots.push(current);
      }
      return { turnCount, villageIds, raidCount, defendedRaidCount, populationLoss, snapshots };
    } finally {
      if (!runEnemyAi) window.runV39EnemyTurn = originalEnemyTurn;
    }
  }, { turnCount:TURN_COUNT, turnTimeoutMs:TURN_TIMEOUT_MS, runEnemyAi:RUN_ENEMY_AI });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
