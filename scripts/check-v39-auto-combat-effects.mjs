import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
import {build} from 'esbuild';

const json = path => JSON.parse(readFileSync(path, "utf8"));
const defaults = json("config/v39-effect-composite-defaults.json");
const categories = Object.entries(defaults.categories).map(([id, row]) => ({ id, ...row }));
const attributes = Object.entries(defaults.attributes).map(([name, row]) => ({ name, ...row }));
const bundle=await build({entryPoints:['frontend/src/lib/v39-combat-effect-rules.js'],bundle:true,write:false,format:'esm',platform:'node'});
const source=bundle.outputFiles[0].text;
const { resolveV39CombatEffect } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const resolve = (skill, attacker = {}) => resolveV39CombatEffect(skill, attacker, categories, attributes);
assert.deepEqual(resolve({ アニメ:"炎の雨:火炎2", 攻撃手段:"爪", 炎:40 }), { effectName:"炎の雨:火炎2", reason:"スキル指定" });
for (const [name, id] of [["剣", "slash"], ["槍", "thrust"], ["棍棒", "strike"]]) {
  const result = resolve({ 攻撃手段:"武器" }, { equipment:[{ slot:"武器1", name }, { slot:"武器2", name:"槍" }] });
  assert.equal(result.categoryId, id);
  assert.equal(result.attributeName, "");
}
assert.equal(resolve({ 攻撃手段:"武器", 装備元:{ name:"槍" } }).categoryId, "thrust");
assert.equal(resolve({ 攻撃手段:"武器" }, { equipment:[{slot:"武器1",source:{攻撃属性:"打撃",装備名:"剣"}}] }).categoryId, "strike");
const noAttribute = resolve({ 攻撃手段:"牙", 物理:500 }, { status:{ 炎:999 } });
assert.equal(noAttribute.categoryId, "fang");
assert.equal(noAttribute.settings.gradientEnabled, false);
assert.equal(noAttribute.settings.tint, "");
assert.equal(resolve({ 攻撃手段:"爪", 炎:10, 氷:30 }, { status:{ 雷:999 } }).attributeName, "氷");
assert.equal(resolve({ 攻撃手段:"爪", 氷:30, 炎:30 }).attributeName, "氷");
assert.equal(resolve({ 攻撃手段:"爪", 炎:0 }).attributeName, "");
const output = "output/web-game/auto-combat-effects";
mkdirSync(output, { recursive:true });
const browser = await chromium.launch();
try {
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport:{ width, height:844 } });
    const errors = [], plays = [];
    page.on("pageerror", error => errors.push(String(error)));
    page.on("console", async message => {
      if (message.text().startsWith("[エフェクト再生]")) plays.push(await message.args()[1].jsonValue());
    });
    await page.goto(process.env.V39_TEST_URL||"http://127.0.0.1:3000", { waitUntil:"networkidle" });
    // 設定画面を開かずに属性色が使えることも確認する。
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();});
    await page.waitForFunction(()=>!!window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0]?.v39Input);
    await page.waitForTimeout(600);
    const cases = [
      { skillRow:{攻撃手段:"武器"}, attacker:{equipment:[{slot:"武器1",name:"槍"}]}, category:"thrust", attribute:"" },
      { skillRow:{攻撃手段:"爪",炎:10,雷:25}, category:"claw", attribute:"雷" },
      { skillRow:{攻撃手段:"牙",物理:50}, category:"fang", attribute:"" },
      { skillRow:{攻撃手段:"爪",アニメ:"斬撃",炎:100}, category:"", attribute:"" }
      ,...['弓','毛皮','射撃攻撃','遠距離攻撃'].map((method,index)=>({skillRow:{攻撃手段:method},category:['bow','fur','shot','shot'][index],attribute:''}))
    ];
    for (const [index, entry] of cases.entries()) {
      await page.evaluate(async ({skillRow, attacker}) => {
        const unit = window.getV39ActiveFactionState().units[0];
        await window.playV39MapEffect({ skillRow, attacker, tileX:unit.x, tileY:unit.y,
          attackerTile:{x:unit.x-1,y:unit.y}, allowInFog:true, totalDurationMs:150 });
      }, entry);
      await page.waitForTimeout(100);
      const played = plays.at(-1);
      assert.equal(played.基本カテゴリ, entry.category);
      assert.equal(played.着色属性, entry.attribute);
      if (!entry.attribute) assert.equal(played.gradient, null);
      if (entry.attribute) assert.equal(played.gradient.colorA, defaults.attributes[entry.attribute].gradientColorA);
      await page.screenshot({ path:`${output}/case-${index}-${width}.png` });
    }
    const actual = await page.evaluate(() => {
      const state = window.getV39GameState();
      const map = window.__v39FieldRuntime.mapData;
      map.grid = map.grid.map(row => row.map(() => "洞窟"));
      map.heightLevelMap = map.grid.map(row => row.map(() => 0));
      const player = state.players[0];
      const target = { ...player.factionState.units[0], x:11, y:10, hp:1000, currentHp:1000,
        equipment:[], techniques:[], status:{防御:10,精神:10} };
      const enemy = {id:"effect-test-enemy",name:"試験敵",x:10,y:10,worldId:state.activeWorldId,
        hp:100,currentHp:100,ap:100,currentAp:100,level:1,status:{攻撃:100},equipment:[]};
      window.setV39GameState({enemies:[enemy],neutralVillages:[],players:[{...player,
        factionState:{...player.factionState,units:[target]}}]});
      const captured = [];
      const original = window.playV39MapEffect;
      window.playV39MapEffect = request => { captured.push(request); return Promise.resolve(true); };
      try {
        const result = window.executeV39EnemyCombatAction({enemyId:enemy.id,targetUnitId:target.id,
          skillRow:{名前:"試験爪",攻撃手段:"爪",雷:20,射程:1,AP消費:10},apPaid:true});
        return {resolved:!!result,method:captured[0]?.skillRow?.攻撃手段,attackerId:captured[0]?.attacker?.id};
      } finally { window.playV39MapEffect = original; }
    });
    assert.equal(actual.resolved, true);
    assert.equal(actual.method, "爪");
    assert.equal(actual.attackerId, "effect-test-enemy");
    assert.deepEqual(errors, []);
    console.log(`${width}: explicit priority, weapon mapping, strongest skill attribute, no-color playback OK`);
    await page.close();
  }
} finally { await browser.close(); }
