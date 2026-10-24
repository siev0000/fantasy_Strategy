import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/race-unification';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.startV39CallTest==='function');
  const result=await page.evaluate(async()=>{
    const {raceData,factionData}=await import('/src/lib/game-data-registry.js');
    const rules=await import('/src/lib/v39-race-definitions.js');
    const sovereign=await import('/src/v39/core/v39-initial-sovereign.js');
    const exp=await import('/src/lib/v39-unit-experience.js');
    const {caveRaceOptions}=await import('/src/lib/v39-cave-adventure.js');
    const {generateV39WorldPopulation}=await import('/src/v39/world/v39-world-population.js');
    const failures=[],ok=(value,message)=>{if(!value)failures.push(message);};
    const available=rules.getV39PlayableRaceDefinitions().map(row=>row.key).sort();
    const expected=['只人','エルフ','オーガ','ゴブリン','竜人','悪魔','天使'].sort();
    ok(JSON.stringify(available)===JSON.stringify(expected),'playable list');
    ok(raceData.length===11&&factionData.length===11,'pending records preserved');
    ok(factionData.every(row=>raceData.some(r=>r.key===row.種族&&r.name===row.種族&&r.className===row.カナ)),'one canonical name per race');
    ok(rules.normalizeV39RaceName('人間')==='只人'&&rules.normalizeV39RaceName('森人')==='エルフ','legacy names');
    ok(rules.normalizeV39RaceName('人族')==='人族','human family must not collapse to only humans');
    ok(exp.resolveV39UnitRaceCategory({race:'人間'})==='human'&&exp.resolveV39UnitRaceCategory({race:'森人'})==='human','legacy growth category');
    ok(caveRaceOptions.every(r=>available.includes(r.key))&&caveRaceOptions.length===7,'cave selection');
    for(const name of ['ドワーフ','獣人','巨人','ヴァンパイア']){
      ok(!rules.isV39RacePlayable(name),'incomplete enabled '+name);
      ok(sovereign.getV39InitialSovereignClassCandidates(name).length===0,'class candidates for incomplete '+name);
      ok(!sovereign.createV39InitialSovereign({playerId:'test',race:name,className:'ファイター',characterName:'試験'}).ok,'incomplete direct creation '+name);
    }
    const old=sovereign.createV39InitialSovereign({playerId:'test',race:'人間',className:'ファイター',characterName:'旧名称試験'});
    ok(old.ok&&old.unit.race==='只人','alias creation not canonical');
    const good=raceData.find(row=>row.key==='只人');
    ok(!rules.isV39RacePlayable({...good,高さ:undefined})&&!rules.isV39RacePlayable({...good,使用可:false}),'flag or missing zero-valued field bypass');
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();
    const source=window.getV39GameState(),map=window.__v39FieldRuntime.mapData;
    for(let i=0;i<8;i++){
      const population=generateV39WorldPopulation({...source,players:[],territoryOwnerByTile:{}},map,{neutralVillageCount:8});
      ok([...population.neutralVillages,...population.wandererGroups].every(row=>available.includes(row.race)),'unavailable race in generated population');
    }
    window.startV39LocalSession(1,{gameSettings:{npcFactionCount:6}});
    const npcs=window.getV39GameState().players.filter(p=>p.isPlayer===false);
    ok(npcs.length===6&&npcs.every(p=>available.includes(p.race)),'NPC faction selection');
    const pid=window.getV39GameState().activePlayerId;
    window.dispatchEvent(new CustomEvent('v39:initial-sovereign-required',{detail:{playerId:pid}}));
    return {failures,available};
  });
  assert.deepEqual(result.failures,[]);
  const buttons=page.locator('[data-v39-race-option]');
  await buttons.first().waitFor();
  const categories=await page.locator('[data-v39-race-category]').evaluateAll(nodes=>nodes.map(n=>n.dataset.v39RaceCategory));
  const shown=new Set();
  for(const category of categories){
    await page.locator(`[data-v39-race-category="${category}"]`).click();
    for(const name of await buttons.evaluateAll(nodes=>nodes.map(n=>n.dataset.v39RaceOption)))shown.add(name);
  }
  assert.deepEqual([...shown].sort(),result.available);
  await page.locator('[data-v39-race-category="人族"]').click();
  await page.screenshot({path:`${out}/${width}-races.png`});
  await page.locator('[data-v39-race-option="只人"]').click();
  await page.locator('[data-v39-race-confirm]').click();
  await page.screenshot({path:`${out}/${width}-classes.png`});
  assert.deepEqual(errors,[]);
  console.log(`${width}: unified names, pending race rejection, alias compatibility, NPC/village selection and UI passed`);
  await page.close();
}}finally{await browser.close();}
