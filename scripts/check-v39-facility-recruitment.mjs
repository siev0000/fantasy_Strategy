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
    assert.equal(await page.locator('#v39-create-tab').getAttribute('aria-selected'),"true");
    await page.locator('#v39-training-tab').click();
    assert.match(await page.locator('#v39-training-pane').textContent(),/訓練中のユニットはありません/);
    assert.equal(await page.locator('#v39-unit-create-confirm').isVisible(),false);
    await page.locator('#v39-create-tab').click();
    assert.equal(await page.locator('#v39-unit-training-level').inputValue(),"3");
    const countBounds=await page.locator('#v39-unit-count').boundingBox();
    const levelBounds=await page.locator('#v39-unit-training-level').boundingBox();
    assert.ok(Math.abs(countBounds.y-levelBounds.y)<1,"count and training level share a row");
    assert.ok(countBounds.x+countBounds.width<=levelBounds.x,"numeric inputs do not overlap");
    assert.equal(await page.locator('#v39-unit-training-level').getAttribute('max'),"10");
    await page.locator('#v39-unit-training-level').fill("10");
    await page.locator('#v39-unit-training-level').dispatchEvent('change');
    assert.match(await page.locator('.v39-unit-create-overview').textContent(),/総合Lv10/);
    await page.locator('#v39-unit-mode').selectOption('normal');
    assert.equal(await page.locator('#v39-unit-training-level').inputValue(),"7");
    await page.locator('#v39-unit-mode').selectOption('elite_army');
    assert.equal(await page.locator('#v39-unit-training-level').inputValue(),"3");
    await page.locator('#v39-unit-mode').selectOption('army');
    assert.doesNotMatch(await page.locator('#v39-unit-mode').textContent(), /必要軍事Lv/);
    await page.locator('#v39-unit-class').selectOption(entry.className);
    const ogre=await page.evaluate(()=>window.getV39ActiveFactionState().units.find(u=>u.name==="被験者"));
    assert.equal(ogre.className,"ウォーリアー");
    assert.notEqual(ogre.isMob,true);
    assert.equal(await page.locator(`[data-v39-instructor-id="${ogre.id}"]`).count(),1);
    const mismatchedIds=await page.evaluate(()=>window.getV39ActiveFactionState().units.filter(u=>u.className!=="ウォーリアー").map(u=>u.id));
    for(const id of mismatchedIds) assert.equal(await page.locator(`[data-v39-instructor-id="${id}"]`).count(),0);
    assert.equal(await page.locator('#v39-unit-training-level').inputValue(),"11");
    assert.equal(await page.locator('#v39-unit-training-level').getAttribute('min'),"11");
    await page.locator('#v39-unit-training-level').fill("12");
    await page.locator('#v39-unit-training-level').dispatchEvent('change');
    assert.match(await page.locator('.v39-unit-create-overview').textContent(),/総合Lv12/);
    assert.match(await page.locator('.v39-unit-create-growth').textContent(),/ウォーリアーLv2/);
    await page.locator('#v39-unit-training-level').fill("11");
    await page.locator('#v39-unit-training-level').dispatchEvent('change');
    assert.match(await page.locator('.v39-unit-create-summary').textContent(), /軍事研究必要Lv4 \/ 現在Lv4/);
    assert.match(await page.locator('.v39-unit-create-overview').textContent(), /訓練後のユニット 総合Lv11/);
    assert.match(await page.locator('.v39-unit-create-summary').textContent(), /既存・訓練中 \d+ \/ 上限 \d+/);
    const expectedLimit=await page.locator('.v39-unit-create-summary').evaluate(el=>el.textContent.match(/既存・訓練中 (\d+) \/ 上限 (\d+)/).slice(1).map(Number));
    assert.equal(await page.locator('#v39-create-tab .v39-unit-count-limit').textContent(),`${expectedLimit[0]}/${expectedLimit[1]}`);
    assert.equal(await page.locator('#v39-unit-count-remaining').count(),0);
    const labels=await page.evaluate(()=>({
      race:document.querySelector('#v39-unit-race').closest('label').querySelector('b').textContent,
      job:document.querySelector('#v39-unit-class').closest('label').querySelector('b').textContent,
      raceCount:document.querySelector('#v39-unit-race').options.length,
      upperCount:[...document.querySelector('#v39-unit-class').options].filter(o=>o.textContent.includes('[兵舎]')).length,
      jobCount:document.querySelector('#v39-unit-class').options.length
    }));
    assert.equal(labels.race,`${labels.raceCount}種`);
    assert.equal(labels.job,`基${labels.jobCount-labels.upperCount} 上${labels.upperCount}`);
    assert.match(await page.locator('.v39-unit-create-overview').textContent(), /今回の消費 1ユニット分/);
    assert.equal(await page.locator('.v39-unit-create-extra[open]').count(),0);
    assert.deepEqual(await page.locator('.v39-unit-create-growth > div').allTextContents(),
      ["種族 只人Lv0", "クラス1 ファイターLv10", "クラス2 ウォーリアーLv1"]);
    const controls=await page.evaluate(()=>{
      const race=document.querySelector('#v39-unit-race').getBoundingClientRect();
      const job=document.querySelector('#v39-unit-class').getBoundingClientRect();
      return {aligned:Math.abs(race.left-job.left)<1,vertical:job.top>race.bottom};
    });
    assert.deepEqual(controls,{aligned:true,vertical:true});
    assert.equal(await page.locator('.v39-unit-create-grid .v39-instructor-picker').count(),1);
    assert.equal(await page.locator('.v39-unit-training .v39-instructor-picker').count(),0);
    const instructorPlacement=await page.evaluate(()=>{
      const picker=document.querySelector('.v39-instructor-picker').getBoundingClientRect();
      const count=document.querySelector('#v39-unit-count').getBoundingClientRect();
      const overview=document.querySelector('.v39-unit-create-overview').getBoundingClientRect();
      return picker.top>=count.bottom && picker.bottom<=overview.top;
    });
    assert.equal(instructorPlacement,true);
    assert.equal(await page.locator('#v39-unit-create-confirm').isEnabled(),true);
    await page.locator('#v39-unit-count').fill("2");
    await page.locator('#v39-unit-count').dispatchEvent("change");
    assert.match(await page.locator('.v39-unit-training').textContent(),/同時訓練枠 0 \/ 1/);
    assert.match(await page.locator('.v39-unit-training').textContent(),/2ユニット中、1ユニットは順番待ち/);
    await page.locator('#v39-unit-count').fill("1");
    await page.locator('#v39-unit-count').dispatchEvent("change");
    const estimatedTurns=await page.locator('.v39-unit-training').evaluate(el=>el.textContent.match(/訓練時間 ⌛(\d+)/)[1]);
    assert.equal(await page.locator('#v39-unit-create-confirm').textContent(),`訓練開始⌛${estimatedTurns}`);
    await page.screenshot({path:`output/web-game/facility-recruitment/${width}-create.png`});
    await page.locator('.v39-unit-create-overview .v39-unit-create-extra summary').click();
    assert.match(await page.locator('.v39-unit-create-overview .v39-unit-create-extra').textContent(),/HPは単体の.*倍 \/ 攻撃は.*回/);
    await page.locator('.v39-unit-create-overview .v39-unit-create-extra summary').click();
    await page.locator('.v39-unit-training .v39-unit-create-extra summary').click();
    assert.match(await page.locator('.v39-unit-training .v39-unit-create-extra').textContent(),/毎ターン .* EXP \/ 必要 .* EXP/);
    await page.screenshot({path:`output/web-game/facility-recruitment/${width}-training-details.png`});
    await page.locator('.v39-unit-training .v39-unit-create-extra summary').click();
    const instructorTarget = await page.evaluate(async () => {
      const {buildV39UnitEntity}=await import("http://127.0.0.1:3022/src/lib/v39-unit-creation-rules.js");
      const state=window.getV39GameState(),player=window.getV39ActivePlayer(),v=player.factionState.settlements[0];
      const facilityKey=Object.keys(v.tileFacilityMap).find(key=>v.tileFacilityMap[key].includes("兵舎"));
      const units=[buildV39UnitEntity({id:"instructor-inside",name:"教官試験",race:player.race,className:"ウォーリアー",level:20,x:v.x,y:v.y}),
        buildV39UnitEntity({id:"instructor-outside",name:"領土外試験",race:player.race,className:"ウォーリアー",level:20,x:0,y:0})];
      window.setV39GameState({players:state.players.map(p=>p.id!==player.id?p:{...p,factionState:{...p.factionState,
        units:[...p.factionState.units.filter(u=>`${u.x},${u.y}`!==facilityKey),...units]}})});
      window.openV39UnitCreate();
      return Object.keys(v.tileFacilityMap).find(key=>v.tileFacilityMap[key].includes("兵舎"));
    });
    await page.locator('.v39-instructor-picker summary').click();
    assert.equal(await page.locator('[data-v39-instructor-id="instructor-outside"]').isDisabled(),true);
    assert.equal(await page.locator('[data-v39-instructor-id="instructor-inside"]').isEnabled(),true);
    await page.locator('[data-v39-instructor-id="instructor-outside"]').scrollIntoViewIfNeeded();
    const fixedHeader=await page.evaluate(()=>{
      const panel=document.querySelector('#v39-unit-create-panel');
      panel.scrollTop=panel.scrollHeight;
      const head=panel.querySelector('.v39-unit-create-head');
      const bounds=head.getBoundingClientRect(),container=panel.getBoundingClientRect();
      return {sticky:getComputedStyle(head).position,visible:Math.abs(bounds.top-container.top)<2,scroll:panel.scrollTop};
    });
    assert.equal(fixedHeader.sticky,"sticky");
    assert.equal(fixedHeader.visible,true);
    if(width===390) assert.ok(fixedHeader.scroll>0);
    await page.screenshot({path:`output/web-game/facility-recruitment/${width}-instructors.png`});
    await page.locator('[data-v39-instructor-id="instructor-inside"]').click();
    const instructorMoved=await page.evaluate(()=>window.getV39ActiveFactionState().units.find(u=>u.id==="instructor-inside"));
    assert.equal(`${instructorMoved.x},${instructorMoved.y}`,instructorTarget,await page.locator("#v39-unit-create-status").textContent());
    assert.ok(instructorMoved.ap<100);
    assert.match(await page.locator('.v39-unit-training').textContent(),/教官: 教官試験/);
    const savedForSlots=await page.evaluate(async()=>{
      const {createV39Units}=await import("http://127.0.0.1:3022/src/lib/v39-unit-creation-rules.js");
      const saved=window.getV39GameState(),player=window.getV39ActivePlayer();
      const result=createV39Units(saved,player.id,{race:"只人",className:"ウォーリアー",mode:"army",count:2});
      if(!result.ok)throw new Error(result.reason);
      window.setV39GameState({players:result.state.players});window.openV39UnitCreate();
      return saved.players;
    });
    assert.match(await page.locator('.v39-unit-training').textContent(),/同時訓練枠 1 \/ 1/);
    assert.match(await page.locator('#v39-training-tab').textContent(),/訓練中 2/);
    const queuedLimit=await page.locator('.v39-unit-create-summary').evaluate(el=>el.textContent.match(/既存・訓練中 (\d+) \/ 上限 (\d+)/).slice(1).map(Number));
    assert.equal(queuedLimit[0],expectedLimit[0]+2);
    assert.equal(await page.locator('#v39-create-tab .v39-unit-count-limit').textContent(),`${queuedLimit[0]}/${queuedLimit[1]}`);
    await page.locator('#v39-training-tab').click();
    assert.equal(await page.locator('#v39-create-pane').isVisible(),false);
    assert.equal(await page.locator('#v39-unit-create-confirm').isVisible(),false);
    assert.equal(await page.locator('[data-training-status="training"]').count(),1);
    assert.equal(await page.locator('[data-training-status="waiting"]').count(),1);
    assert.match(await page.locator('#v39-training-pane').textContent(),/教官: 教官試験/);
    await page.screenshot({path:`output/web-game/facility-recruitment/${width}-training-slots.png`});
    await page.locator('#v39-training-tab').press('ArrowLeft');
    assert.equal(await page.locator('#v39-create-tab').getAttribute('aria-selected'),"true");
    assert.equal(await page.locator('#v39-unit-class').inputValue(),entry.className);
    assert.equal(await page.locator('#v39-unit-count').inputValue(),"1");
    await page.evaluate(players=>{window.setV39GameState({players});window.openV39UnitCreate();},savedForSlots);
    const before=await page.evaluate(()=>{
      const p=window.getV39ActivePlayer(),v=p.factionState.settlements[0];return {count:p.factionState.units.length,population:v.population};
    });
    await page.locator('#v39-unit-create-confirm').click();
    assert.equal(await page.evaluate(() => window.getV39ActiveFactionState().units.length), before.count);
    assert.equal(await page.evaluate(() => window.getV39ActiveFactionState().unitTrainingQueue.length), 1);
    await page.locator('#v39-training-tab').click();
    const tick = await page.evaluate(async () => {
      const advanced = await window.advanceV39Turn({skipUnactedFocus:true});
      return {advanced, progress:window.getV39ActiveFactionState().unitTrainingQueue[0]?.progressExp};
    });
    assert.equal(tick.advanced,true);
    assert.ok(tick.progress>0);
    assert.equal(await page.locator('#v39-training-tab').getAttribute('aria-selected'),"true");
    assert.ok(Number(await page.locator('.v39-training-card progress').getAttribute('value'))>0);
    await page.screenshot({path:`output/web-game/facility-recruitment/${width}-training.png`});
    await page.locator('#v39-create-tab').click();
    await page.evaluate(async () => {
      const {advanceV39RecruitTraining} = await import("http://127.0.0.1:3022/src/lib/v39-recruit-training.js");
      let state = window.getV39GameState();
      for (let turn=state.timeline.turnNumber+1; state.players.some(p => p.factionState.unitTrainingQueue.length); turn++) {
        if (turn>100) throw new Error("training did not finish");
        state=advanceV39RecruitTraining(state,turn).state;
      }
      window.setV39GameState({players:state.players});
    });
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
    const raceCases=await page.evaluate(async entry=>{
      const {advanceV39RecruitTraining} = await import("http://127.0.0.1:3022/src/lib/v39-recruit-training.js");
      const saved=window.getV39GameState(),player=window.getV39ActivePlayer();
      const outputs=[];
      for (const race of ["ビーストマン","デヴィル"]) {
        const settlements=player.factionState.settlements.map(v=>({...v,populationByRace:{[race]:100}}));
        window.setV39GameState({players:saved.players.map(p=>p.id===player.id?{...p,race,factionState:{...p.factionState,settlements}}:p)});
        window.openV39UnitCreate();
        const displayed=`Lv${document.querySelector('#v39-unit-training-level').value}`;
        const growthRows=[...document.querySelectorAll('.v39-unit-create-growth > div')].map(row=>row.textContent);
        const result=window.createV39Units({race,className:entry.className,mode:"army",count:1});
        if(!result.ok) throw new Error(result.reason);
        const unit=result.queuedUnits[0];
        let trained=result.state;
        for(let turn=trained.timeline.turnNumber+1;trained.players.some(p=>p.factionState.unitTrainingQueue.length);turn++) {
          if(turn>100) throw new Error("training did not finish");
          trained=advanceV39RecruitTraining(trained,turn).state;
        }
        window.setV39GameState({players:trained.players});
        window.setV39GameState({players:JSON.parse(JSON.stringify(window.getV39GameState().players))});
        const restored=window.getV39ActiveFactionState().units.find(u=>u.id===unit.id);
        const grown=window.applyV39DerivedCharacterData({...restored,level:restored.level+2});
        const capped=window.grantV39UnitExperience(restored,10000000).unit;
        const middle=window.applyV39DerivedCharacterData({...restored,level:restored.level+5});
        const again=window.grantV39UnitExperience(capped,1000);
        outputs.push({race,displayed,growthRows,level:restored.level,raceLevel:restored.derivedCharacter.raceLevels,classLevel:restored.derivedCharacter.classLevels,
          prior:restored.prerequisiteClassLevels,growthStart:restored.classGrowthStart,
          grownRace:grown.derivedCharacter.raceLevels,grownClass:grown.derivedCharacter.classLevels,
          cap:{level:capped.level,race:capped.derivedCharacter.raceLevels,class:capped.derivedCharacter.classLevels,extra:again.amount},
          middle:{race:middle.derivedCharacter.raceLevels,class:middle.derivedCharacter.classLevels}});
      }
      window.setV39GameState({players:saved.players});return outputs;
    },entry);
    for (const [index,raceLevel] of [3,5].entries()) {
      const item=raceCases[index];assert.equal(item.level,11+raceLevel);assert.equal(item.raceLevel,raceLevel);assert.equal(item.classLevel,1);
      assert.match(item.displayed,new RegExp(`Lv${item.level}`));
      assert.deepEqual(item.growthRows,[`種族 ${item.race}Lv${raceLevel}`,"クラス1 ファイターLv10","クラス2 ウォーリアーLv1"]);
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
