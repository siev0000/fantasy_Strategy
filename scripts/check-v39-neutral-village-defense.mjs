import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.generateV39TestFieldWithSeed === "function" && typeof window.executeV39EnemyCombatAction === "function");
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    document.querySelector("#v39-play-mode-select")?.remove();
    document.querySelector(".vue-modal-backdrop")?.remove();
    window.generateV39TestFieldWithSeed({ w:30, h:30, patternId:"realistic" }, "neutral-village-defense-check");
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const initial = window.getV39GameState();
    const sourceGuard = initial.players.flatMap(player => player?.factionState?.units || [])[0];
    if (!sourceGuard) throw new Error("検証用のユニットがありません");
    const guardSkill = { 名前:"守備軍検証攻撃", 行動:"A", 攻撃手段:"素手", 射程:1, 威力:1000, 打撃:1000, 判定:"攻撃" };
    const enemySkill = { 名前:"一般生物検証攻撃", 行動:"A", 攻撃手段:"素手", 射程:1, 威力:1, 打撃:1, 判定:"攻撃" };
    const combatStatus = { ...(sourceGuard.status || {}), HP:999, 攻撃:999, 防御:0, 命中:999, 速度:1, 回避:1 };
    const guard = { ...sourceGuard, id:"test-neutral-village-guard", name:"検証村 守備軍", x:10, y:10, hp:999, currentHp:999, maxHp:999, state:"生存", status:combatStatus, techniques:[guardSkill], neutral:true, isNeutralVillageGuard:true };
    const enemy = { ...sourceGuard, id:"test-neutral-village-enemy", name:"検証一般生物", x:11, y:10, hp:999, currentHp:999, maxHp:999, state:"生存", status:combatStatus, techniques:[enemySkill], aggressive:true, nestId:"" };
    const village = { id:"test-neutral-village", name:"検証村", x:10, y:9, neutral:true, defenseUnits:[guard] };
    window.setV39GameState({ neutralVillages:[village], enemies:[enemy] }, { reason:"neutral-village-defense-check-state" });
    const enemyResolved = window.executeV39EnemyCombatAction({ enemyId:enemy.id, targetUnitId:guard.id, skillRow:enemySkill, suppressEffect:true });
    if (enemyResolved !== true) throw new Error("一般生物から村守備軍への攻撃を解決できません");
    const afterEnemy = window.getV39GameState();
    const guardAfterEnemy = afterEnemy.neutralVillages[0].defenseUnits[0];
    if (Number(guardAfterEnemy.hp) >= 999) throw new Error("村守備軍へダメージが適用されません");
    window.__v39SuppressCombatEffects = true;
    const defenseTurn = window.runV39NeutralVillageDefenseTurn?.();
    window.__v39SuppressCombatEffects = false;
    if (Number(defenseTurn?.attacks) !== 1) throw new Error(`村守備軍の自動防衛回数が不正です: ${JSON.stringify(defenseTurn)}`);
    const afterGuard = window.getV39GameState();
    const enemyAfterGuard = afterGuard.enemies.find(unit => unit.id === enemy.id);
    if (Number(enemyAfterGuard.hp) >= Number(afterEnemy.enemies.find(unit => unit.id === enemy.id)?.hp)) throw new Error("一般生物へダメージが適用されません");
    return { enemyResolved, guardDefenseAttacks:defenseTurn.attacks, guardHp:guardAfterEnemy.hp, enemyHp:enemyAfterGuard.hp };
  });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
