import assert from "node:assert/strict";
import { mkdirSync,writeFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out="output/web-game/bow-skills";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(600);
    const report=await page.evaluate(()=>{
      window.__v39SuppressCombatEffects=true;
      const map=window.__v39FieldRuntime.mapData;
      map.grid=map.grid.map(row=>row.map(()=>"洞窟"));map.worldWrapEnabled=false;
      map.heightLevelMap=map.grid.map(row=>row.map(()=>0));map.defenseStructures=[];
      const rows=window.getGameDataRows("スキル一覧"),find=name=>rows.find(row=>row.名前===name);
      const arrow=find("貫通矢"),passive=find("弓の使い手"),precision=find("精度");
      const bow={slot:"武器2",name:"弓",power:25,range:20};
      const sword={slot:"武器1",name:"剣",power:100,range:10};
      const actor={id:"bow-fixture",status:{攻撃:100,命中:100},equipment:[sword,bow],techniques:[]};
      const target={id:"bow-target",level:1,status:{防御:0,速度:100},resistances:{}};
      const damage=(skillRow,techniques=[])=>window.computeV39AttackDamage({attacker:{...actor,techniques},target,skillRow,random:()=>0.5});
      const arrowDamage=damage(arrow),swordDamage=damage(find("闘気撃"));
      const accuracy=damage(arrow,[{source:precision}]).detail.accuracy;
      const state=window.getV39GameState(),player=state.players[0],original=player.factionState.units[0];
      const setActor=(level,underground=true)=>{
        map.isUnderground=underground;
        window.setV39GameState({players:[{...player,factionState:{...player.factionState,squads:[],
          selectedUnitId:original.id,combatRuntime:{},units:[{...original,race:"只人",className:"アーチャー",level,
            x:5,y:10,equipment:[{slot:"武器1",name:"弓"}],ap:100,currentAp:100,testSkillNames:[]}]}}],
          neutralVillages:[],enemies:[],timeline:{...state.timeline,turnNumber:1,phase:"player"}});
        return window.getV39ActiveFactionState().units[0];
      };
      const first=setActor(1,false),fraction=window.buildV39AttackAreaScaleMap(first,{x:8,y:10},arrow);
      const next=setActor(5,false),full=window.buildV39AttackAreaScaleMap(next,{x:8,y:10},arrow);
      const underground=setActor(1,true),caveArea=window.buildV39AttackAreaScaleMap(underground,{x:10,y:10},arrow);
      const fixture={...first,techniques:[],equipment:[bow]};
      map.isUnderground=false;
      const basic={名前:"射程15",行動:"A",物理:100,射程:15};
      const fractional15=window.buildV39AttackAreaScaleMap(fixture,{x:7,y:10},basic);
      map.isUnderground=true;
      const final=setActor(5,true);
      window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unitId:final.id}}));
      return {arrowPower:arrowDamage.detail.power,swordPower:swordDamage.detail.power,accuracy,
        rangeBonus:arrow.射程補正,passiveBonus:passive.射程補正,
        fraction:fraction.get("8,10"),full:full.get("8,10"),cave:caveArea.get("10,10"),fractional15:fractional15.get("7,10"),
        arrowData:arrow,passiveData:passive};
    });
    assert.equal(report.arrowPower,86);assert.equal(report.swordPower,250);assert.equal(report.accuracy,110);
    assert.equal(report.rangeBonus,5);assert.equal(report.passiveBonus,5);
    assert.equal(report.fraction,0.5);assert.equal(report.full,1);assert.equal(report.cave,1);assert.equal(report.fractional15,0.5);
    await page.locator('[data-foot="squad"]').click();
    await page.locator('[data-squad-detail-tab="action"]').click();
    assert.equal((await page.locator('[data-v39-technique-name="貫通矢"] .technique-range').textContent()).trim(),"射 30");
    assert.equal((await page.locator('[data-v39-technique-name="弓"] .technique-range').textContent()).trim(),"射 25");
    assert.equal((await page.locator('[data-v39-technique-name="弓の使い手"] .technique-range').textContent()).trim(),"射 +5");
    await page.locator('[data-v39-technique-name="貫通矢"]').click();
    const cast=await page.evaluate(()=>{
      const state=window.getV39GameState(),player=state.players[0],unit=player.factionState.units[0];
      const enemy={id:"bow-victim",name:"弓試験敵",worldId:state.activeWorldId,x:8,y:10,hp:5000,currentHp:5000,maxHp:5000,level:1,
        status:{防御:0,精神:0,速度:1},resistances:{}};
      window.setV39GameState({enemies:[enemy]});
      const row=window.getGameDataRows("スキル一覧").find(row=>row.名前==="貫通矢");
      const ok=window.executeV39FactionCombatAction({playerId:player.id,attackerId:unit.id,target:{x:8,y:10},skillRow:row});
      return {ok,hp:window.getV39GameState().enemies[0].hp,ap:window.getV39ActiveFactionState().units[0].ap};
    });
    assert.ok(cast.ok);assert.ok(cast.hp<5000);assert.equal(cast.ap,40);
    await page.screenshot({path:`${out}/${width}.png`});
    assert.deepEqual(errors,[]);writeFileSync(`${out}/${width}.json`,JSON.stringify({report,cast},null,2));
    console.log(`${width}: bow weapon bonus, offhand matching, passive +5, fractional range, AP60 and actual hit OK`);
    await page.close();
  }
} finally {await browser.close();}
