import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1000, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3021", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.startV39LocalSession === "function");
  const report = await page.evaluate(async () => {
    const root = "http://127.0.0.1:3022/src/";
    const { raceData, factionData } = await import(root + "lib/game-data-registry.js");
    const { resolveV39UnitInitialLevel, resolveV39UnitRaceCategory, resolveV39UnitExpDisplay } = await import(root + "lib/v39-unit-experience.js");
    const { createV39InitialSovereign } = await import(root + "v39/core/v39-initial-sovereign.js");
    const { createV39Units } = await import(root + "lib/v39-unit-creation-rules.js");
    const { normalizeV39NeutralVillage } = await import(root + "lib/v39-neutral-village-rules.js");
    const { FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS } = await import(root + "lib/v39-economy-rules.js");
    const map = { w:12, h:12, grid:Array.from({length:12}, () => Array(12).fill("平地")) };
    const sampleUnits = [];
    const cases = raceData.map(row => {
      const race = row.key;
      const category = resolveV39UnitRaceCategory({ race });
      const sovereign = createV39InitialSovereign({ playerId:"test", race, className:"ファイター", characterName:"試験" });
      const village = {
        id:"base", settlementId:"base", placed:true, x:5, y:5, population:1000,
        populationByRace:{ [race]:1000 }, heroBirthUnlock:10, cityLevels:{ 軍事Lv:3 },
        foodStockByType:Object.fromEntries(FOOD_RESOURCE_KEYS.map(key => [key,10000])),
        materialStockByType:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key => [key,10000]))
      };
      const create = (mode, isPlayer) => createV39Units({ players:[{
        id:"test", race, isPlayer,
        factionState:{ units:[], village, settlements:[village], selectedSettlementId:"base" }
      }] }, "test", { mode, race, className:"ファイター" });
      const results = ["normal","army","elite_army"].flatMap(mode => [true,false].map(isPlayer => {
        const result = create(mode,isPlayer);
        const unit = result.createdUnits?.[0];
        if (category === "human" && isPlayer && ["normal","army"].includes(mode) && sampleUnits.length < 2 && unit) {
          sampleUnits.push({ ...unit, name:mode === "normal" ? "初期Lv7" : "軍隊Lv3" });
        }
        return { mode, isPlayer, ok:result.ok, reason:result.reason, level:unit?.level, hp:unit?.hp, maxHp:unit?.maxHp,
          profile:unit?.combatProfile, populationCost:result.check?.populationCost,
          exp:unit ? resolveV39UnitExpDisplay(unit).exp : null };
      }));
      const faction = factionData.find(row => row.カナ === rowClass(race));
      function rowClass(key) { return raceData.find(row => row.key === key)?.className; }
      const neutral = normalizeV39NeutralVillage({ id:"village", race, combatRaceName:row.className,
        factionDataName:faction?.種族, population:100, x:5,y:5, militaryLevel:1 }, map);
      const oldUnits = neutral.defenseUnits.map(unit => ({...unit, level:17, hp:Math.round(unit.maxHp/2)}));
      const refreshed = normalizeV39NeutralVillage({...neutral, militaryLevel:3, defenseUnits:oldUnits},map);
      return { race, category, normal:resolveV39UnitInitialLevel(race), army:resolveV39UnitInitialLevel(race,true),
        sovereignOk:sovereign.ok, sovereignLevel:sovereign.unit?.level, results,
        guardLevels:neutral.defenseUnits.map(unit=>unit.level),
        preservedLevels:refreshed.defenseUnits.filter(unit=>oldUnits.some(old=>old.id===unit.id)).map(unit=>unit.level) };
    });
    window.startV39LocalSession(1,{playMode:"single-test"});
    window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"initial-unit-levels");
    const state = window.getV39GameState();
    const field = window.__v39FieldRuntime.mapData;
    const tiles = [];
    for(let y=0;y<field.h;y++)for(let x=0;x<field.w;x++) {
      if(!["海","湖","火山"].includes(field.grid[y][x])) tiles.push({x,y});
    }
    const squadId = state.players[0].factionState.squads[0].id;
    const units = sampleUnits.map((unit,index) => ({...unit, squadId, ...tiles[Math.floor(tiles.length/2)+index], ownerPlayerId:state.players[0].id }));
    window.setV39GameState({ players:state.players.map((player,index) => index ? player : {
      ...player, factionState:{...player.factionState, units,
        squads:[{...player.factionState.squads[0], unitIds:units.map(unit=>unit.id)}],
        selectedUnitId:units[0].id, villagePlacementMode:false }
    }) });
    return cases;
  });
  const expected = { human:[7,3], demi:[10,6], demon:[12,9], other:[7,3] };
  for (const row of report) {
    const [normal,army] = expected[row.category];
    assert.equal(row.normal, normal, row.race);
    assert.equal(row.army, army, row.race);
    assert.equal(row.sovereignOk,true,row.race);
    assert.equal(row.sovereignLevel,normal,row.race);
    for (const unit of row.results) {
      assert.equal(unit.ok,true,`${row.race} ${unit.mode}: ${unit.reason}`);
      assert.equal(unit.level,unit.mode === "normal" ? normal : army);
      assert.equal(unit.hp,unit.maxHp);
      assert.equal(unit.exp,0);
      if (unit.mode === "army") {
        assert.equal(unit.profile.memberCount,3);
        assert.equal(unit.populationCost,3);
        assert.equal(unit.profile.hpMultiplier,2);
        assert.equal(unit.profile.attackCount,3);
      }
      if (unit.mode === "elite_army") assert.equal(unit.profile.memberCount,5);
    }
    assert.ok(row.guardLevels.length > 0,row.race);
    assert.ok(row.guardLevels.every(level => level === army),row.race);
    assert.ok(row.preservedLevels.every(level => level === 17),row.race);
  }
  await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
  await page.waitForTimeout(300);
  await page.screenshot({path:"output/web-game/v39-initial-unit-level.png"});
  await page.evaluate(() => window.openV39UnitCreate());
  const ui = await page.locator("#v39-unit-create-panel").innerText();
  assert.ok(ui.includes("初期Lv3"));
  const modes = await page.locator("#v39-unit-mode").innerText();
  assert.ok(modes.includes("必要軍事Lv1") && modes.includes("必要軍事Lv3"));
  await page.screenshot({path:"output/web-game/v39-army-three-ui.png"});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ report, errors },null,2));
} finally {
  await browser.close();
}
