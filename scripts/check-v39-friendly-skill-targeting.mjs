import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
await page.waitForFunction(() => (
  typeof window.startV39LocalSession === "function"
  && typeof window.generateV39TestFieldWithSeed === "function"
  && typeof window.startV39SelectedUnitAttack === "function"
  && typeof window.getV39MapEntityMarker === "function"
));

const report = await page.evaluate(async () => {
  const pause = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
  const session = window.startV39LocalSession(1);
  window.generateV39TestFieldWithSeed({ w:36, h:36, patternId:"realistic" }, "friendly-skill-targeting");
  window.closeFieldSettingsModal?.();

  const playerId = window.getV39GameState().activePlayerId || session.players[0].id;
  const sourceUnit = window.getV39GameState().players.find(player => player.id === playerId)?.factionState.units[0];
  const status = { ...(sourceUnit?.status || {}), HP:200, 攻撃:200, 防御:0, 魔力:200, 魔防:0, 命中:200, 速度:100 };
  const attackerId = "friendly-target-attacker";
  const targetId = "friendly-target-unit";

  function createUnit(id, x, y, overrides = {}) {
    return {
      ...sourceUnit,
      id,
      name:id,
      // Use a non-data class so state normalization preserves the test skill row.
      race:"__test__",
      className:"__test__",
      x,
      y,
      level:3,
      Lv:3,
      state:"生存",
      hp:200,
      currentHp:200,
      maxHp:200,
      ap:100,
      currentAp:100,
      maxAp:100,
      status,
      equipment:[],
      techniques:[],
      ...overrides
    };
  }

  function setUnits(skillRow, targetOverrides = {}) {
    window.cancelV39SelectedUnitAttack?.("friendly-target-test-reset");
    const attacker = createUnit(attackerId, 12, 12, { techniques:[skillRow] });
    const target = createUnit(targetId, 13, 12, targetOverrides);
    const state = window.getV39GameState();
    const players = state.players.map(player => player.id !== playerId ? player : ({
      ...player,
      factionState:{
        ...player.factionState,
        villagePlacementMode:false,
        selectedUnitId:attackerId,
        units:[attacker, target]
      }
    }));
    window.setV39GameState({ players }, { reason:"friendly-skill-target-test" });
    window.refreshV39MapEntities?.();
    return { attacker, target };
  }

  async function clickTargetMarker() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      window.refreshV39MapEntities?.();
      const marker = window.getV39MapEntityMarker?.(targetId);
      if (marker) {
        marker.emit("pointerdown", null, 0, 0, { stopPropagation() {} });
        return true;
      }
      await pause(25);
    }
    return false;
  }

  async function runCase(skillRow, targetOverrides) {
    setUnits(skillRow, targetOverrides);
    await pause(20);
    const started = window.startV39SelectedUnitAttack();
    const session = window.getV39AttackSession?.() || null;
    const selectedBefore = window.getV39GameState().players[0].factionState.selectedUnitId;
    const clicked = await clickTargetMarker();
    await pause(30);
    const faction = window.getV39GameState().players[0].factionState;
    const target = faction.units.find(unit => unit.id === targetId);
    const attacker = faction.units.find(unit => unit.id === attackerId);
    return {
      started,
      skillName:session?.skillName || "",
      attackerId:session?.unitId || "",
      clicked,
      selectedBefore,
      selectedAfter:faction.selectedUnitId,
      targetHp:target?.hp,
      targetState:target?.state,
      attackerLastUsedAttack:attacker?.lastUsedAttack,
      attackSessionActive:!!window.getV39AttackSession?.()
    };
  }

  const attack = await runCase({
    名前:"味方攻撃試験", 行動:"A", 攻撃手段:"素手", 判定:"攻撃",
    物理:30, 射程:1, AP消費:10, 攻撃回数:1
  }, { hp:200, currentHp:200 });
  const heal = await runCase({
    名前:"味方回復試験", 行動:"A", 攻撃手段:"奇跡", 回復:40,
    射程:1, AP消費:10
  }, { hp:100, currentHp:100 });
  const revive = await runCase({
    名前:"味方蘇生試験", 行動:"A", 攻撃手段:"奇跡", 回復:50,
    効果:"蘇生_Lv-1", 射程:1, AP消費:10
  }, { level:3, Lv:3, hp:0, currentHp:0, state:"死亡" });

  return { attack, heal, revive };
});

await browser.close();
console.log(JSON.stringify({ report, errors }, null, 2));

const targetSelectionHeld = entry => entry?.started
  && entry?.clicked
  && entry?.selectedBefore === "friendly-target-attacker"
  && entry?.selectedAfter === "friendly-target-attacker"
  && entry?.attackSessionActive === false;

if (errors.length
  || !targetSelectionHeld(report.attack)
  || !targetSelectionHeld(report.heal)
  || !targetSelectionHeld(report.revive)
  || report.attack.skillName !== "味方攻撃試験"
  || report.attack.attackerId !== "friendly-target-attacker"
  || report.attack.attackerLastUsedAttack !== "味方攻撃試験"
  || report.heal.skillName !== "味方回復試験"
  || report.heal.attackerId !== "friendly-target-attacker"
  || report.heal.attackerLastUsedAttack !== "味方回復試験"
  || report.revive.skillName !== "味方蘇生試験"
  || report.revive.attackerId !== "friendly-target-attacker"
  || report.revive.attackerLastUsedAttack !== "味方蘇生試験"
  || report.heal.targetHp <= 100
  || report.revive.targetState === "死亡"
  || report.revive.targetHp !== 50) process.exitCode = 1;
