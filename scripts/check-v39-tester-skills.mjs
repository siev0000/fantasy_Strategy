import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out = "output/web-game/tester-skills";
mkdirSync(out, { recursive:true });
const browser = await chromium.launch();
try {
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport:{ width, height:844 } });
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button", { name:"探索ゲーム", exact:true }).click();
    await page.getByRole("button", { name:"探索開始", exact:true }).click();
    await page.waitForTimeout(700);
    await page.evaluate(async () => {
      // 洞窟では自動出現させない。防御スキル試験のためだけに固定テストデータを投入する。
      const faction=window.getV39ActiveFactionState();
      const fixtures=window.getGameDataTable("テストゲーム状態").players[0].factionState.units
        .filter(unit=>unit.testOnly).map(unit=>({...unit,x:null,y:null}));
      window.updateV39ActiveFactionState({units:[...faction.units,...fixtures]});
      window.dispatchEvent(new CustomEvent("v39:cave-world-ready"));
      await window.setV39TestMode(true);
    });
    await page.waitForFunction(() => window.getV39GameState().players[0].factionState.units.some(unit => unit.id === "combat-tester"));
    await page.waitForFunction(()=>window.getV39ActiveFactionState().units.some(unit=>unit.id==='combat-tester'
      &&unit.worldId===window.getV39GameState().activeWorldId&&Number.isFinite(unit.x)&&unit.hp>0));
    const initial = await page.evaluate(() => {
      window.__testEffectNames = [];
      const info = console.info.bind(console);
      console.info = (label, ...values) => {
        if(label === "[エフェクト再生]") window.__testEffectNames.push(values[0]?.元アニメーション);
        info(label, ...values);
      };
      const state = window.getV39GameState();
      const faction = state.players[0].factionState;
      const tester = faction.units.find(unit => unit.id === "combat-tester");
      if(tester.worldId!==state.activeWorldId||!Number.isFinite(tester.x)||!(tester.hp>0))throw new Error('tester was not automatically placed');
      window.updateV39ActiveFactionState({
        selectedUnitId:tester.id
      });
      window.dispatchEvent(new CustomEvent("v39:unit-selected", { detail:{ unitId:tester.id } }));
      const updated = window.getV39GameState().players[0].factionState.units.find(unit => unit.id === tester.id);
      return { skills:updated.techniques.map(row => row.name), others:faction.units.filter(unit => unit.id !== tester.id)
        .flatMap(unit => unit.testSkillNames || []), x:tester.x, y:tester.y };
    });
    assert.equal(initial.skills.length, 10);
    assert.equal(initial.others.length, 0);
    await page.waitForFunction(() => !window.isV39MapInputLocked?.());
    await page.locator('[data-squad-detail-tab="action"]').click();
    await page.locator('[data-v39-technique-name="TEST_盾"]').click();
    const result = await page.evaluate(({ x, y }) => {
      const cast = window.executeV39AttackAt(x, y);
      const unit = window.getV39GameState().players[0].factionState.units.find(unit => unit.id === "combat-tester");
      return { cast, shield:unit.shield, ap:unit.ap };
    }, initial);
    assert.ok(result.shield?.maximum > 0, JSON.stringify(result));
    assert.equal(result.ap, 95);
    await page.evaluate(() => {
      const faction = window.getV39GameState().players[0].factionState;
      window.updateV39ActiveFactionState({ units:faction.units.map(unit => unit.id === "combat-tester"
        ? { ...unit, name:"とても長い名前の戦闘試験官", shield:{...unit.shield, remaining:43},
          barrier:{ maximum:60, remaining:30, expiresAtTurn:4 } } : unit) });
    });
    await page.waitForTimeout(300);
    await page.locator('[data-foot="squad"]').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path:`${out}/${width}.png` });
    const ui = await page.locator('[data-v39-unit-id="combat-tester"]').evaluate(card => {
      const name = card.querySelector(".squad-name");
      return { nameWidth:name.clientWidth, textWidth:name.scrollWidth, whiteSpace:getComputedStyle(name).whiteSpace,
        fit:Number(name.style.getPropertyValue("--v39-text-fit")),
        withinCard:name.getBoundingClientRect().right <= card.getBoundingClientRect().right,
        position:card.querySelector(".squad-pos").textContent,
        fills:[...card.querySelectorAll(".v39-card-defense-fill")].map(fill => fill.style.width) };
    });
    console.log(JSON.stringify({width, ui}));
    assert.ok(ui.textWidth <= ui.nameWidth + 1, JSON.stringify(ui));
    assert.equal(ui.whiteSpace, "nowrap");
    assert.ok(ui.withinCard);
    if(width === 390) assert.ok(ui.fit < 1);
    assert.ok(ui.position.includes("盾43") && ui.position.includes("障壁30"));
    assert.deepEqual(ui.fills, ["50%", "50%"]);
    await page.screenshot({ path:`${out}/${width}.png` });
    await page.evaluate(() => {
      const faction = window.getV39GameState().players[0].factionState;
      window.updateV39ActiveFactionState({ units:faction.units.map(unit => unit.id === "combat-tester"
        ? {...unit, name:"試験官", shield:{...unit.shield, remaining:0}, barrier:null} : unit) });
    });
    await page.waitForTimeout(200);
    const empty = await page.locator('[data-v39-unit-id="combat-tester"]').evaluate(card => ({
      position:card.querySelector(".squad-pos").textContent,
      fit:Number(card.querySelector(".squad-name").style.getPropertyValue("--v39-text-fit")),
      fills:[...card.querySelectorAll(".v39-card-defense-fill")].map(fill => fill.style.width)
    }));
    assert.ok(empty.position.includes("盾0") && !empty.position.includes("障壁"));
    assert.equal(empty.fit, 1);
    assert.deepEqual(empty.fills, ["0%"]);
    await page.waitForFunction(() => !window.isV39MapInputLocked?.());
    await page.locator('[data-v39-technique-name="TEST_結界3"]').click();
    await page.evaluate(({x,y}) => window.executeV39AttackAt(x,y), initial);
    await page.locator('[data-v39-defense-facing]').click();
    assert.equal(await page.locator('[data-v39-defense-facing]').textContent(),"回転：右上");
    assert.equal(await page.evaluate(() => window.getV39AttackSession().confirmedTarget),null);
    await page.evaluate(({x,y}) => window.executeV39AttackAt(x,y), initial);
    await page.screenshot({path:`${out}/${width}-triangle-rotation.png`});
    await page.locator('[data-v39-technique-name="TEST_結界7"]').click();
    const preview = await page.evaluate(({x,y}) => {
      const before = window.__v39FieldRuntime.mapData.defenseStructures?.length || 0;
      const first = window.executeV39AttackAt(x,y);
      const session = window.getV39AttackSession();
      const unit = window.getV39ActiveFactionState().units.find(unit => unit.id === "combat-tester");
      return { first, before, after:window.__v39FieldRuntime.mapData.defenseStructures?.length || 0,
        ap:unit.ap, target:session.confirmedTarget };
    }, initial);
    assert.equal(preview.first, false);
    assert.equal(preview.before, preview.after);
    assert.equal(preview.ap, 95);
    assert.deepEqual(preview.target, {x:initial.x, y:initial.y});
    await page.screenshot({path:`${out}/${width}-area-preview.png`});
    const confirmed = await page.evaluate(({x,y}) => {
      const changed = window.executeV39AttackAt(x+1,y);
      const returned = window.executeV39AttackAt(x,y);
      const second = window.executeV39AttackAt(x,y);
      const unit = window.getV39ActiveFactionState().units.find(unit => unit.id === "combat-tester");
      return {changed, returned, second, ap:unit.ap,
        tiles:window.__v39FieldRuntime.mapData.defenseStructures.at(-1)?.tiles.length};
    }, initial);
    console.log(JSON.stringify({preview, confirmed}));
    assert.equal(confirmed.changed, false);
    assert.equal(confirmed.returned, false);
    assert.equal(confirmed.second, true);
    assert.equal(confirmed.ap, 90);
    assert.equal(confirmed.tiles, 7);
    await page.waitForTimeout(1700);
    const effects = await page.evaluate(() => window.__testEffectNames);
    assert.ok(effects.includes("シールド"), JSON.stringify(effects));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, initial, result }));
    await page.close();
  }
} finally {
  await browser.close();
}
