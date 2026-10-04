import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1000,height:800}}),errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3021",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>typeof window.inspectV39InitialPlacementArea==="function");
  await page.evaluate(()=>{
    window.startV39LocalSession(1,{playMode:"single-test"});
    const state=window.getV39GameState();
    window.setV39GameState({players:state.players.map(player=>({...player,race:"エルフ",factionState:{...player.factionState,
      initialSettlementCount:1,initialSettlementPlans:[{name:"序盤村"}],
      units:player.factionState.units.map((unit,index)=>index!==0?unit:{...unit,isSovereign:true,unitType:"統治者"})}}))});
    window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"start-area");
    const data=window.__v39FieldRuntime.mapData;
    data.worldWrapEnabled=false;
    for(let y=0;y<data.h;y++)for(let x=0;x<data.w;x++){
      data.grid[y][x]="平地";data.heightLevelMap[y][x]=x===12&&y===12?0:1;data.specialMap[y][x]="";
      if(data.reliefMap?.[y])data.reliefMap[y][x]="";
      if(data.lavaMap?.[y])data.lavaMap[y][x]=false;
      if(data.strongMonsterMap?.[y])data.strongMonsterMap[y][x]=false;
      if(data.strongMonsterInfoMap?.[y])data.strongMonsterInfoMap[y][x]=null;
    }
    data.riverData={riverSet:new Set()};
    window.beginV39InitialPlacement({force:true});
  });
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  assert.equal(await page.locator('.footer-body #v39-placement-preview').count(),1);
  assert.equal(await page.locator('[data-placement-candidates]').count(),0);
  const candidateCount=await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39PlacementContext.candidates.length);
  assert.ok(candidateCount>3&&candidateCount<=20);
  await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0]?.children.list
    .find(child=>child.name==="v39-initial-placement-shade")?.visible);
  assert.equal(await page.locator('[data-placement-confirm]').isDisabled(),true);
  for (const key of ["squad","tile","settlement","test","manage"]) {
    if (!await page.locator(`[data-foot="${key}"]`).isVisible()) continue;
    await page.locator(`[data-foot="${key}"]`).click();
    assert.ok(await page.locator('#v39-placement-preview').isVisible());
    assert.ok(await page.locator('[data-placement-confirm]').isVisible());
    assert.ok(await page.locator(`[data-foot="${key}"] .tab-text`).isVisible());
  }
  assert.ok(await page.evaluate(()=>{
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    return !scene.v39SelectedTile && scene.v39PlacementContext.candidates.every(tile=>tile.x>=3&&tile.y>=3&&tile.x<33&&tile.y<33);
  }));
  await page.screenshot({path:"output/web-game/v39-start-area-before-selection.png"});
  await page.setViewportSize({width:440,height:900});
  await page.screenshot({path:"output/web-game/v39-start-area-before-selection-mobile.png"});
  await page.setViewportSize({width:1000,height:800});
  await page.evaluate(()=>{
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    const tile=scene.v39PlacementContext.candidates[0];
    scene.cameras.main.setZoom(2).centerOn(tile.x*62+(tile.y%2?31:0)+31,tile.y*56+37);
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const point=await page.evaluate(()=>{
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],camera=scene.cameras.main;
    const tile=scene.v39PlacementContext.candidates[0];
    const screen=camera.matrix.transformPoint(tile.x*62+(tile.y%2?31:0)+31-camera.scrollX,tile.y*56+37-camera.scrollY);
    const canvas=window.__v39FieldRuntime.game.canvas.getBoundingClientRect();
    return {x:canvas.left+screen.x,y:canvas.top+screen.y};
  });
  await page.mouse.click(point.x,point.y);
  assert.match(await page.locator('[data-placement-location]').textContent(),/高度 0/);
  assert.ok(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39SelectedTile));
  await page.evaluate(()=>{
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    const keys=scene.v39PlacementContext.allowedKeys;
    for(let y=3;y<33;y++)for(let x=3;x<33;x++)if(!keys.has(`${x},${y}`)){
      window.__testPlacementOutside={x,y,terrain:"平地",height:1,special:""};return;
    }
    throw new Error("範囲外の検証マスがありません");
  });
  assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39Input.selectTile(window.__testPlacementOutside)),null);
  assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39SelectedTile.x),12);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:12,y:12,terrain:"海",height:0,special:""}})));
  assert.equal(await page.locator('[data-placement-confirm]').isDisabled(),true);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:window.__testPlacementOutside})));
  assert.equal(await page.locator('[data-placement-confirm]').isDisabled(),true);
  assert.match(await page.locator('[data-placement-level]').textContent(),/候補マス.*周囲2マス/);
  assert.equal(await page.evaluate(()=>window.placeV39InitialBase(window.__testPlacementOutside)),false);
  assert.equal(await page.evaluate(()=>window.canPlaceV39InitialBase({x:12,y:13,terrain:"平地"})),true);
  assert.equal(await page.evaluate(()=>window.canPlaceV39InitialBase({x:12,y:14,terrain:"平地"})),true);
  assert.ok(await page.evaluate(()=>{
    const shade=window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(child=>child.name==="v39-initial-placement-shade");
    return shade.visible && shade.getData("allowedTileCount")>=19 && shade.mask.invertAlpha;
  }));
  assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().visibility.exploredTileKeys.length),0);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:12,y:12,terrain:"平地",height:0,special:""}})));
  assert.equal(await page.evaluate(()=>window.getV39GameState().players[0].factionState.settlements.filter(row=>row.placed).length),0);
  assert.match(await page.locator('[data-placement-level]').textContent(),/4マス.*初期敵なし.*5〜8マス.*Lv1〜3/);
  const preview=await page.evaluate(()=>window.inspectV39InitialPlacementArea({x:12,y:12}));
  assert.ok(preview.beginnerSpecies.includes("スネーク"));
  assert.ok(!preview.beginnerSpecies.includes("ワイバーン"));
  assert.ok(preview.outerMinLevel>=4);
  await page.screenshot({path:"output/web-game/v39-start-area.png"});
  await page.setViewportSize({width:440,height:900});
  assert.ok(await page.evaluate(()=>{
    const panel=document.getElementById("v39-placement-preview").getBoundingClientRect();
    const field=document.getElementById("v39-phaser-field").getBoundingClientRect();
    const confirm=document.querySelector('[data-placement-confirm]').getBoundingClientRect();
    const footer=document.querySelector('.footer-body').getBoundingClientRect();
    return panel.top>=field.bottom && confirm.bottom<=Math.min(window.innerHeight,footer.bottom)+1 && confirm.top>=footer.top;
  }));
  await page.screenshot({path:"output/web-game/v39-start-area-mobile.png"});
  for (const viewport of [{width:440,height:600},{width:320,height:568}]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(()=>{
      const button=document.querySelector('[data-placement-confirm]').getBoundingClientRect();
      const footer=document.querySelector('.footer-body').getBoundingClientRect();
      return button.bottom<=Math.min(window.innerHeight,footer.bottom)+1 && button.top>=footer.top;
    }));
  }
  await page.screenshot({path:"output/web-game/v39-start-area-small-mobile.png"});
  for (const key of ["squad","tile","settlement","manage"]) {
    await page.locator(`[data-foot="${key}"]`).click();
    assert.ok(await page.locator('#v39-placement-preview').isVisible());
    assert.match(await page.locator('[data-placement-location]').textContent(),/\(12,12\)/);
    assert.equal(await page.locator('[data-placement-confirm]').isDisabled(),false);
  }
  await page.locator('[data-placement-confirm]').click();
  assert.equal(await page.evaluate(()=>window.getV39GameState().players[0].factionState.settlements.filter(row=>row.placed).length),1);
  assert.equal(await page.locator('#v39-placement-preview').isVisible(),false);
  for (const key of ["tile","settlement","manage","squad"]) {
    await page.locator(`[data-foot="${key}"]`).click();
    assert.equal(await page.locator('.footer-body>section.v39-footer-panel-active').getAttribute("id"),`foot${key[0].toUpperCase()}${key.slice(1)}`);
  }
  await page.waitForFunction(()=>!window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list
    .find(child=>child.name==="v39-initial-placement-shade").visible);
  assert.ok(await page.evaluate(()=>{
    window.renderV39Visibility();
    return window.isV39TestMode?.() === true || window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list
      .some(child=>child.name.startsWith("v39-unexplored-fog-layer"));
  }));
  const generated=await page.evaluate(()=>{
    const data=window.__v39FieldRuntime.mapData;
    const distance=(a,b)=>{
      const cube=p=>[p.x-((p.y-(p.y&1))/2),p.y];
      const aa=cube(a),bb=cube(b),dq=aa[0]-bb[0],dr=aa[1]-bb[1];
      return Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr));
    };
    // Beginner levels must be independent of height and strong-monster terrain markers.
    for(let y=0;y<data.h;y++)for(let x=0;x<data.w;x++){
      const d=distance({x:12,y:12},{x,y});
      data.grid[y][x]="平地";data.specialMap[y][x]="";
      if(data.reliefMap?.[y])data.reliefMap[y][x]="";
      data.heightLevelMap[y][x]=d<=8?8:0;
      if(data.strongMonsterMap?.[y])data.strongMonsterMap[y][x]=d>4&&d<=8;
    }
    const enemies=window.spawnV39Enemies();
    return enemies.filter(enemy=>["通常","強敵","強敵配下"].includes(enemy.spawnType))
      .map(enemy=>({name:enemy.name,level:enemy.level,distance:distance({x:12,y:12},enemy),strong:enemy.strongEnemy,adjusted:enemy.beginnerAdjusted,band:enemy.spawnLevelBand}));
  });
  assert.ok(generated.length>0);
  assert.ok(generated.every(enemy=>enemy.distance>4));
  const near=generated.filter(enemy=>enemy.distance<=8),far=generated.filter(enemy=>enemy.distance>8);
  assert.ok(near.length>0);assert.ok(far.length>0);
  assert.ok(near.every(enemy=>enemy.level>=1&&enemy.level<=3&&!enemy.strong));
  assert.ok(far.every(enemy=>enemy.band!=="beginner"));
  const wrapped=await page.evaluate(()=>{
    const state=window.getV39GameState(),data=window.__v39FieldRuntime.mapData;
    data.worldWrapEnabled=true;
    window.__v39FieldRuntime.settings.islandCustomSettings={...window.__v39FieldRuntime.settings.islandCustomSettings,worldWrapEnabled:true};
    const player=state.players[0],base=player.factionState.settlements[0];
    const second={...player,id:"player-2",factionState:{...player.factionState,units:[],
      settlements:[{...base,id:"second",settlementId:"second",x:24,y:24}],selectedSettlementId:"second"}};
    window.setV39GameState({players:[{...player,factionState:{...player.factionState,
      settlements:[{...base,x:1,y:1}]}},second]});
    const direct=(a,b)=>{
      const aq=a.x-((a.y-(a.y&1))/2),bq=b.x-((b.y-(b.y&1))/2),dq=aq-bq,dr=a.y-b.y;
      return Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr));
    };
    const distance=enemy=>Math.min(...[{x:1,y:1},{x:24,y:24}].flatMap(base=>
      [-data.w,0,data.w].flatMap(dx=>[-data.h,0,data.h].map(dy=>direct(base,{x:enemy.x+dx,y:enemy.y+dy})))));
    return window.spawnV39Enemies().filter(enemy=>["通常","強敵","強敵配下"].includes(enemy.spawnType))
      .map(enemy=>({distance:distance(enemy),level:enemy.level}));
  });
  assert.ok(wrapped.length>0);
  assert.ok(wrapped.every(enemy=>enemy.distance>4));
  assert.ok(wrapped.filter(enemy=>enemy.distance<=8).every(enemy=>enemy.level>=1&&enemy.level<=3));
  const automatic=await page.evaluate(()=>{
    window.startV39LocalSession(2,{playMode:"single-test"});
    const state=window.getV39GameState();
    window.setV39GameState({enemies:[],players:state.players.map(player=>({...player,factionState:{...player.factionState,
      initialSettlementCount:1,initialSettlementPlans:[{}],
      units:player.factionState.units.map((unit,index)=>index?unit:{...unit,isSovereign:true,unitType:"統治者"})}}))});
    return window.getV39GameState().players.map(player=>window.autoPlaceV39InitialBases(player.id));
  });
  assert.ok(automatic.every(result=>result.ok),JSON.stringify(automatic));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({preview,near,farCount:far.length,wrappedCount:wrapped.length,errors},null,2));
} finally {await browser.close();}
