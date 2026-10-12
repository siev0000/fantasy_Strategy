import assert from "node:assert/strict";
import {mkdirSync,readFileSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const entry=JSON.parse(readFileSync("config/v39-facility-recruitment-defaults.json","utf8")).entries[0];
const classes=JSON.parse(readFileSync("data/source/export/json/クラス.json","utf8"));
const fighter=classes.find(row=>row.名前==="ファイター"),warrior=classes.find(row=>row.名前===entry.className);
const fighterSkills=Object.entries(fighter).filter(([key,value])=>/^Skill\d+$/.test(key) && Number(key.slice(5))<=10 && typeof value==="string").map(([,value])=>value);
mkdirSync("output/web-game/facility-recruitment",{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",e=>errors.push(e.stack));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.evaluate(()=>{
      window.closeV39PlayModeSelection();window.startV39LocalSession(1,{playMode:"single-test"});
      const state=window.getV39GameState();
      window.setV39GameState({players:state.players.map(player=>({...player,factionState:{...player.factionState,
        initialSettlementCount:1,initialSettlementPlans:player.factionState.initialSettlementPlans?.slice(0,1),
        units:player.factionState.units.map((unit,index)=>index?unit:{...unit,isSovereign:true})}}))});
      window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"facility-recruitment-test");
    });
    await page.waitForFunction(()=>window.__v39FieldRuntime?.mapData && !window.isV39MapInputLocked?.());
    const tile=await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39PlacementContext.allowedTiles.find(tile=>window.canPlaceV39InitialBase(tile)));
    assert.ok(tile);await page.evaluate(tile=>window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:tile})),tile);
    await page.locator('[data-placement-confirm]').click();
    await page.waitForFunction(()=>window.getV39ActiveFactionState().settlements.some(row=>row.placed));
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    const fixture=await page.evaluate(entry=>{
      const state=window.getV39GameState(),p=window.getV39ActivePlayer(),v=p.factionState.settlements[0];
      const key=Object.keys(v.tileFacilityMap).find(key=>v.tileFacilityMap[key].includes(entry.facilityName));
      return {key,global:state.facilitiesByTile[key],buildings:v.buildings,level:v.cityLevels.軍事Lv};
    },entry);
    assert.ok(fixture.key);assert.ok(fixture.global.includes(entry.facilityName));assert.ok(fixture.buildings.includes(entry.facilityName));
    assert.equal(fixture.level,entry.requiredMilitaryLevel);
    await page.evaluate(()=>window.openV39UnitCreate());
    await page.locator('#v39-unit-class').selectOption(entry.className);
    assert.equal(await page.locator('#v39-unit-create-confirm').isEnabled(),true);
    await page.screenshot({path:`output/web-game/facility-recruitment/${width}-create.png`});
    const before=await page.evaluate(()=>{
      const p=window.getV39ActivePlayer(),v=p.factionState.settlements[0];return {count:p.factionState.units.length,population:v.population};
    });
    await page.locator('#v39-unit-create-confirm').click();
    const created=await page.evaluate(()=>{
      const p=window.getV39ActivePlayer(),u=p.factionState.units.at(-1),v=p.factionState.settlements[0];
      return {unit:u,count:p.factionState.units.length,population:v.population};
    });
    assert.equal(created.count,before.count+1);assert.equal(created.unit.className,entry.className);
    assert.equal(created.unit.isMob,true);assert.ok(created.unit.unitType.includes("軍隊"));
    assert.equal(created.unit.derivedCharacter.ok,true);assert.ok(created.unit.techniques.length);assert.ok(created.unit.equipment.length);
    assert.equal(created.unit.level,11);
    assert.deepEqual(created.unit.prerequisiteClassLevels,{ファイター:10});
    assert.equal(created.unit.derivedCharacter.classLevels,1);
    assert.ok(created.unit.acquiredSkillNames.includes("戦う者"));
    for (const name of fighterSkills) assert.ok(created.unit.acquiredSkillNames.includes(name),`missing prerequisite skill ${name}`);
    if (warrior.Skill3 && !fighterSkills.includes(warrior.Skill3)) assert.equal(created.unit.acquiredSkillNames.includes(warrior.Skill3),false);
    const grown=await page.evaluate(id=>{
      const u=window.getV39ActiveFactionState().units.find(u=>u.id===id);
      const next=window.applyV39DerivedCharacterData({...u,level:u.level+1});
      return {prior:next.derivedCharacter.prerequisiteClassLevels,current:next.derivedCharacter.classLevels};
    },created.unit.id);
    assert.deepEqual(grown,{prior:{ファイター:10},current:2});
    const humanCap=await page.evaluate(id=>{
      const u=window.getV39ActiveFactionState().units.find(u=>u.id===id);
      const result=window.grantV39UnitExperience(u,10000000),again=window.grantV39UnitExperience(result.unit,1000);
      return {level:result.unit.level,class:result.unit.derivedCharacter.classLevels,race:result.unit.derivedCharacter.raceLevels,
        extra:again.amount,nextLevel:again.unit.level,display:window.resolveV39UnitExpDisplay(again.unit)};
    },created.unit.id);
    assert.equal(humanCap.level,20);assert.equal(humanCap.class,10);assert.equal(humanCap.race,0);
    assert.equal(humanCap.extra,0);assert.equal(humanCap.nextLevel,20);assert.equal(humanCap.display.atLimit,true);
    assert.ok(created.population<before.population);
    const restrictions=await page.evaluate(entry=>{
      const saved=window.getV39GameState(),p=window.getV39ActivePlayer();
      const request={className:entry.className,race:p.race,mode:"army",count:1};
      const verify=(settlements,mode="army")=>{
        window.setV39GameState({players:saved.players.map(row=>row.id===p.id?{...row,factionState:{...row.factionState,settlements}}:row)});
        const before=JSON.stringify(window.getV39GameState().players);
        const result=window.createV39Units({...request,mode});
        return {ok:result.ok,reason:result.reason,unchanged:JSON.stringify(window.getV39GameState().players)===before};
      };
      const base=p.factionState.settlements[0], key=Object.keys(base.tileFacilityMap).find(k=>base.tileFacilityMap[k].includes(entry.facilityName));
      const missing=verify([{...base,tileFacilityMap:{}}]);
      const damaged=verify([{...base,facilityStateByTile:{...base.facilityStateByTile,[key]:{[entry.facilityName]:{hp:0,maxHp:100,status:"損壊"}}}}]);
      const hero=verify([base],"normal");
      const low=verify([{...base,cityLevels:{...base.cityLevels,軍事Lv:0}}]);
      window.setV39GameState({players:saved.players});
      return {missing,damaged,hero,low};
    },entry);
    for(const result of Object.values(restrictions)){assert.equal(result.ok,false);assert.equal(result.unchanged,true);}
    assert.match(restrictions.missing.reason,/兵舎/);assert.match(restrictions.damaged.reason,/兵舎/);assert.match(restrictions.hero.reason,/軍隊のみ/);
    assert.match(restrictions.low.reason,/軍事Lv4/);
    const raceCases=await page.evaluate(entry=>{
      const saved=window.getV39GameState(),player=window.getV39ActivePlayer();
      const outputs=[];
      for (const race of ["ビーストマン","デヴィル"]) {
        const settlements=player.factionState.settlements.map(v=>({...v,populationByRace:{[race]:100}}));
        window.setV39GameState({players:saved.players.map(p=>p.id===player.id?{...p,race,factionState:{...p.factionState,settlements}}:p)});
        const result=window.createV39Units({race,className:entry.className,mode:"army",count:1});
        if(!result.ok) throw new Error(result.reason);
        const unit=result.createdUnits[0];
        window.setV39GameState({players:JSON.parse(JSON.stringify(window.getV39GameState().players))});
        const restored=window.getV39ActiveFactionState().units.find(u=>u.id===unit.id);
        const grown=window.applyV39DerivedCharacterData({...restored,level:restored.level+2});
        const capped=window.grantV39UnitExperience(restored,10000000).unit;
        const middle=window.applyV39DerivedCharacterData({...restored,level:restored.level+5});
        const again=window.grantV39UnitExperience(capped,1000);
        outputs.push({race,level:restored.level,raceLevel:restored.derivedCharacter.raceLevels,classLevel:restored.derivedCharacter.classLevels,
          prior:restored.prerequisiteClassLevels,growthStart:restored.classGrowthStart,
          grownRace:grown.derivedCharacter.raceLevels,grownClass:grown.derivedCharacter.classLevels,
          cap:{level:capped.level,race:capped.derivedCharacter.raceLevels,class:capped.derivedCharacter.classLevels,extra:again.amount},
          middle:{race:middle.derivedCharacter.raceLevels,class:middle.derivedCharacter.classLevels}});
      }
      window.setV39GameState({players:saved.players});return outputs;
    },entry);
    for (const [index,raceLevel] of [3,5].entries()) {
      const item=raceCases[index];assert.equal(item.level,11+raceLevel);assert.equal(item.raceLevel,raceLevel);assert.equal(item.classLevel,1);
      assert.deepEqual(item.prior,{ファイター:10});assert.deepEqual(item.growthStart,{level:11+raceLevel,raceLevels:raceLevel,classLevels:1});
      assert.equal(item.grownRace,raceLevel+1);assert.equal(item.grownClass,2);
      assert.deepEqual(item.cap,index===0?{level:22,race:5,class:7,extra:0}:{level:22,race:7,class:5,extra:0});
      assert.deepEqual(item.middle,index===0?{race:5,class:4}:{race:7,class:4});
    }
    assert.deepEqual(errors,[]);console.log(`${width}: test barracks placed, warrior army generated with JSON stats/equipment/skills, population consumed, restrictions verified`);
    await page.close();
  }
  const page=await browser.newPage();await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
  const normal=await page.evaluate(()=>{window.startV39LocalSession(1,{playMode:"single-normal"});return window.getV39ActiveFactionState().facilityRecruitmentTest;});
  assert.notEqual(normal,true);await page.close();console.log("normal play does not enable the test facility fixture");
} finally {await browser.close();}
