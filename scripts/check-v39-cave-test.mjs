import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("output/web-game/cave-test",{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:850}});
const errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  await page.locator("[data-v39-cave-test]").waitFor({state:"visible"});
  const report=await page.evaluate(async()=>{
    const cave=await import("/src/lib/v39-cave-generator.js");
    const spawn=await import("/src/v39/ai/v39-enemy-spawn.js");
    const definitions=spawn.getV39EnemySpawnDefinitions("洞窟");
    const cases=[];
    for(const row of cave.V39_CAVE_TEMPLATES) for(const entranceCount of [2,3,4]) {
      const map=cave.generateV39CaveMap({seed:"test-cave",templateId:row.id,entranceCount});
      const enemies=cave.populateV39CaveMonsters(map,definitions,spawn.createV39EventEnemy);
      const reachable=map.grid.every((line,y)=>line.every((terrain,x)=>terrain!=="洞窟"||cave.findV39CavePath(map,map.entrances[0],{x,y}).length>0));
      const connected=map.entrances.every(entry=>cave.findV39CavePath(map,map.entrances[0],entry).length>0);
      const safe=enemies.every(enemy=>map.entrances.every(entry=>cave.findV39CavePath(map,entry,enemy).length>3));
      const references=[...row.通路.flatMap(corridor=>corridor.経路),...row.入口接続].filter(point=>!Array.isArray(point));
      const portsValid=references.every(point=>{
        const [cx,cy,rx,ry]=row.部屋[point.部屋],port=row.部屋接続口[point.部屋][point.接続口];
        return port&&Math.abs(port[0]-cx)<=rx&&Math.abs(port[1]-cy)<=ry&&(Math.abs(port[0]-cx)===rx||Math.abs(port[1]-cy)===ry);
      });
      const outerWall=map.grid.every((line,y)=>line.every((terrain,x)=>x>0&&y>0&&x<map.w-1&&y<map.h-1||terrain==="岩壁"));
      cases.push({id:row.id,name:row.名前,entranceCount,reachable,connected,safe,portsValid,outerWall,enemies:enemies.length,
        layout:map.grid.map(line=>line.map(terrain=>terrain==="洞窟"?".":"#").join("")).join("\n"),
        mapRepeat:JSON.stringify(map)===JSON.stringify(cave.generateV39CaveMap({seed:"test-cave",templateId:row.id,entranceCount})),
        valid:enemies.every(enemy=>enemy.hp>0&&enemy.maxHp>0&&enemy.derivedCharacter.ok&&map.grid[enemy.y][enemy.x]==="洞窟"),
        unique:new Set(enemies.map(enemy=>`${enemy.x},${enemy.y}`)).size===enemies.length,
        repeat:JSON.stringify(enemies)===JSON.stringify(cave.populateV39CaveMonsters(map,definitions,spawn.createV39EventEnemy))});
    }
    const linked=cave.generateV39CaveMap({surfaceEntrances:[{id:"surface-a",x:4,y:9},{id:"surface-b",x:10,y:12}]});
    let invalidRejected=false;
    try { cave.generateV39CaveMap({entranceCount:5}); } catch { invalidRejected=true; }
    const fixture={id:"width-fixture",名前:"幅テスト",幅:25,高さ:17,部屋:[[3,8,1,1],[20,8,1,1]],部屋接続口:[{右:[4,8],左:[2,8]},{左:[19,8],右:[21,8]}],通路:[],出入口:[[2,8],[21,8]],入口接続:[{部屋:0,接続口:"左"},{部屋:1,接続口:"右"}],入口通路幅:[1,1]};
    const widths=[];
    cave.V39_CAVE_TEMPLATES.push(fixture);
    try{
      for(const width of [1,2,3]){
        fixture.通路=[{幅:width,経路:[{部屋:0,接続口:"右"},{部屋:1,接続口:"左"}]}];
        const map=cave.generateV39CaveMap({templateId:fixture.id});
        widths.push({width,actual:map.grid.filter(line=>line[10]==="洞窟").length,from:map.corridors[0].from,to:map.corridors[0].to});
      }
    }finally{cave.V39_CAVE_TEMPLATES.pop();}
    return {cases,widths,linked:linked.entrances.map(entry=>entry.surfaceEntrance.id),invalidRejected};
  });
  assert.deepEqual(report.linked,["surface-a","surface-b"]); assert.ok(report.invalidRejected);
  for(const row of report.cases) assert.ok(row.reachable&&row.connected&&row.safe&&row.portsValid&&row.outerWall&&row.valid&&row.unique&&row.repeat&&row.mapRepeat&&row.enemies>0,JSON.stringify(row));
  for(const row of report.widths){assert.equal(row.actual,row.width);assert.deepEqual(row.from,[4,8]);assert.deepEqual(row.to,[19,8]);}
  const patterns=report.cases.filter(row=>row.entranceCount===2);
  assert.equal(new Set(patterns.map(row=>row.layout)).size,patterns.length,"different pattern layouts");
  for(const row of report.cases)delete row.layout;
  const before=await page.evaluate(()=>JSON.stringify(window.getV39GameState()));
  await page.locator("[data-v39-cave-test]").click();
  const dialog=page.getByRole("dialog",{name:"洞窟生成テスト"});
  await dialog.locator("svg").waitFor({state:"visible"});
  for(const row of patterns){
    await dialog.getByLabel("形状").selectOption(row.id);
    await dialog.getByRole("button",{name:"生成",exact:true}).click();
    assert.ok((await dialog.locator("footer").innerText()).includes(row.name));
    await page.screenshot({path:`output/web-game/cave-test/pattern-${row.id}.png`});
  }
  await dialog.getByLabel("形状").selectOption("branch");
  await dialog.getByLabel("出入口").selectOption("4");
  await dialog.getByRole("button",{name:"生成",exact:true}).click();
  await dialog.locator("[data-cave-enemy]").first().click();
  await dialog.locator("[data-cave-enemy-detail]").waitFor({state:"visible"});
  assert.match(await dialog.locator("[data-cave-enemy-detail]").innerText(),/HP/);
  await dialog.locator('[data-cave-tile="2,3"]').click();
  assert.match(await dialog.locator("footer").innerText(),/現在位置：2,3/);
  assert.equal(await dialog.locator(".cave-route").count(),1);
  await page.screenshot({path:"output/web-game/cave-test/desktop.png"});
  await dialog.getByRole("button",{name:"開始画面に戻る"}).click();
  assert.equal(await page.evaluate(()=>JSON.stringify(window.getV39GameState())),before);
  await page.setViewportSize({width:390,height:844});
  await page.locator("[data-v39-cave-test]").click();
  await dialog.locator("svg").waitFor({state:"visible"});
  await page.screenshot({path:"output/web-game/cave-test/mobile.png"});
  const bounds=await dialog.boundingBox(); assert.ok(bounds.y>=0&&bounds.y+bounds.height<=844);
  await dialog.getByRole("button",{name:"開始画面に戻る"}).click();
  assert.ok(await page.locator("[data-v39-cave-test]").isVisible());
  await page.setViewportSize({width:320,height:568});
  await page.locator("[data-v39-cave-test]").scrollIntoViewIfNeeded();
  const menuBounds=await page.locator(".v39-play-mode-dialog").boundingBox();
  assert.ok(menuBounds.y>=0&&menuBounds.y+menuBounds.height<=568);
  await page.locator("[data-v39-cave-test]").click();
  await dialog.locator("svg").waitFor({state:"visible"});
  await dialog.press("Escape");
  assert.ok(await page.locator("[data-v39-cave-test]").isVisible());
  assert.deepEqual(errors,[]);
  writeFileSync("artifacts/cave-test-report.json",JSON.stringify({report,errors},null,2));
  console.log(JSON.stringify({report,errors},null,2));
} finally { await browser.close(); }
