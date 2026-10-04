import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("output/web-game/cave-sites",{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  const report=await page.evaluate(async()=>{
    const c=await import("/src/lib/v39-cave-adventure.js"),p=await import("/src/lib/v39-cave-generator.js"),h=await import("/src/lib/hex-grid.js");
    const checks=[];
    function check(name,result){if(!result)throw new Error(name);checks.push(name);}
    function rejects(work){try{work();return false;}catch{return true;}}
    const fresh=id=>c.createCaveAdventure(c.defaultCaveProfiles(),{seed:"sites",templateId:id});
    for(const template of p.V39_CAVE_TEMPLATES) {
      const game=fresh(template.id);
      check(`${template.id} sites`,game.sites.length===7&&new Set(game.sites.map(s=>s.key)).size===7);
      check(`${template.id} placement`,game.sites.every(s=>s.wall
        ?game.map.grid[s.y][s.x]==="岩壁"&&h.getHexNeighborCoords(game.map.w,game.map.h,s.x,s.y).some(t=>game.map.grid[t.y][t.x]==="洞窟")
        :game.map.grid[s.y][s.x]==="洞窟"&&!game.enemies.some(e=>e.x===s.x&&e.y===s.y)));
      check(`${template.id} repeat`,JSON.stringify(game.sites)===JSON.stringify(fresh(template.id).sites));
      check(`${template.id} normal floor no boss`,!game.enemies.some(e=>e.isCaveBoss));
      game.floor=4;game.position={...game.map.entrances[1]};c.descendCave(game);
      const bosses=game.enemies.filter(e=>e.isCaveBoss);
      check(`${template.id} floor5 boss`,bosses.length===1&&bosses[0].derivedCharacter.ok&&bosses[0].aggressive&&bosses[0].level>game.enemies.filter(e=>!e.isCaveBoss).reduce((n,e)=>Math.max(n,e.level),0));
      check(`${template.id} boss safety`,game.map.entrances.every(entry=>p.findV39CavePath(game.map,bosses[0],entry).length>3));
    }
    const game=fresh("chamber");game.enemies=[];
    const herb=game.sites.find(s=>s.kind==="herb");game.position={...herb};c.revealCave(game);
    game.party[0].hp-=50;game.party[2].hp=-8;
    c.useCaveSite(game,herb.id,game.party[0].id);
    check("rest heals only living",game.party[0].hp===game.party[0].maxHp-50+Math.ceil(game.party[0].maxHp*.25)&&game.party[2].hp===-8);
    check("rest AP charges",game.party[0].ap===80&&game.party[1].ap===80&&herb.remaining===2);
    check("one rest per turn",rejects(()=>c.useCaveSite(game,herb.id,game.party[0].id)));
    game.turn++;game.party[0].ap=0;
    const hp=game.party[0].hp;
    check("no AP no healing",rejects(()=>c.useCaveSite(game,herb.id,game.party[0].id))&&game.party[0].hp===hp&&herb.remaining===2);
    const ore=game.sites.find(s=>s.kind==="ore");
    check("remote mining blocked",rejects(()=>c.useCaveSite(game,ore.id,game.party[0].id)));
    game.position=h.getHexNeighborCoords(game.map.w,game.map.h,ore.x,ore.y).find(t=>game.map.grid[t.y][t.x]==="洞窟");c.revealCave(game);game.party[0].ap=100;
    const grid=JSON.stringify(game.map.grid);
    for(let i=0;i<3;i++)c.useCaveSite(game,ore.id,game.party[0].id);
    check("mine deposit and AP",game.inventory.鉱石===3&&ore.remaining===0&&game.party[0].ap===10);
    check("depleted no repeated reward",rejects(()=>c.useCaveSite(game,ore.id,game.party[0].id))&&game.inventory.鉱石===3);
    check("mining keeps walls",JSON.stringify(game.map.grid)===grid);
    const gem=game.sites.find(s=>s.kind==="gem");game.position=h.getHexNeighborCoords(game.map.w,game.map.h,gem.x,gem.y).find(t=>game.map.grid[t.y][t.x]==="洞窟");c.revealCave(game);game.party[0].ap=100;
    c.useCaveSite(game,gem.id,game.party[0].id);
    check("gem reward",game.inventory.宝石===1&&gem.remaining===0);
    game.position={...game.map.entrances[1]};c.descendCave(game);
    check("floor keeps inventory",game.inventory.鉱石===3&&game.inventory.宝石===1);
    return {checks};
  });
  assert.deepEqual(errors,[]);
  writeFileSync("output/web-game/cave-sites/report.json",JSON.stringify({report,errors,uiTest:"scripts/check-v39-cave-native.mjs"},null,2));
  console.log(JSON.stringify({checks:report.checks.length,errors}));
}finally{await browser.close();}
