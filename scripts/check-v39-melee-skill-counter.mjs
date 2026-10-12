import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync("output/web-game/melee-skill-counter",{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [1100,390]){
    const page=await browser.newPage({viewport:{width,height:844}});
    const errors=[];
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(600);
    const report=await page.evaluate(()=>{
      window.__v39SuppressCombatEffects=true;
      const map=window.__v39FieldRuntime.mapData;
      map.grid=map.grid.map(row=>row.map(()=>"洞窟"));
      map.heightLevelMap=map.grid.map(row=>row.map(()=>0));
      const cases=[
        {label:"weapon skill",method:"武器",range:10,weapon:"剣",expected:true},
        {label:"normal weapon",method:"武器",range:10,weapon:"剣",equipmentAttack:true,expected:true},
        {label:"weapon inherited range",method:"武器",range:null,weapon:"剣",expected:true},
        {label:"bow weapon skill",method:"武器",range:10,weapon:"弓",expected:false},
        {label:"gun weapon skill",method:"武器",range:10,weapon:"銃",expected:false},
        {label:"magic",method:"魔法",range:10,weapon:"剣",expected:false},
        {label:"ranged melee skill",method:"武器",range:20,weapon:"剣",expected:false},
        {label:"area melee skill",method:"武器",range:10,weapon:"剣",area:"周囲",expected:false},
        {label:"splash melee skill",method:"武器",range:10,weapon:"剣",splash:1,expected:false},
        {label:"natural melee",method:"爪",range:10,weapon:"剣",expected:true}
      ];
      return cases.map((entry,index)=>{
        const state=window.getV39GameState(),player=state.players[0];
        const target={...player.factionState.units[0],x:11,y:10,hp:10000,currentHp:10000,maxHp:10000,
          ap:100,currentAp:100,actionPoint:100,waitedTurn:0,lastActionTurn:0,lastUsedAttack:"",
          techniques:[],equipment:[{slot:"武器1",name:"棍棒",power:10,attackAp:30,range:10}],
          status:{攻撃:100,防御:10,精神:100,命中:1000,速度:10}};
        const attacker={id:"counter-enemy",name:"試験敵",worldId:state.activeWorldId,x:10,y:10,
          hp:10000,currentHp:10000,maxHp:10000,level:1,ap:100,currentAp:100,
          equipment:[{slot:"武器1",name:entry.weapon,power:5,attackAp:10,range:10}],
          status:{攻撃:10,防御:10,命中:1000,精神:1000,速度:10}};
        window.setV39GameState({enemies:[attacker],neutralVillages:[],enemyCombatRuntime:{},players:[{...player,
          factionState:{...player.factionState,units:[target],squads:[],selectedUnitId:target.id,
            combatRuntime:{},villagePlacementMode:false}}]});
        const skillRow={名前:entry.equipmentAttack?entry.weapon:`武器技${index}`,行動:"A",攻撃手段:entry.method,
          物理:5,射程:entry.range,範囲:entry.area||null,炸裂:entry.splash||0,AP消費:10,
          装備攻撃:entry.equipmentAttack===true};
        const counterLogs=[];
        const onLog=event=>{if(event.detail?.skillName?.endsWith("（反撃）"))counterLogs.push(event.detail.skillName);};
        window.addEventListener("v39:combat-log",onLog);
        try{
          const resolved=window.executeV39EnemyCombatAction({enemyId:attacker.id,targetUnitId:target.id,skillRow,apPaid:true});
          const unit=window.getV39ActiveFactionState().units[0];
          return {...entry,resolved:!!resolved,ap:unit.ap,counterLogs};
        }finally{window.removeEventListener("v39:combat-log",onLog);}
      });
    });
    for(const entry of report){
      assert.equal(entry.resolved,true,entry.label);
      assert.equal(entry.counterLogs.length,entry.expected?1:0,JSON.stringify(entry));
      assert.equal(entry.ap,entry.expected?85:100,JSON.stringify(entry));
      if(entry.expected)assert.equal(entry.counterLogs[0],"棍棒（反撃）");
    }
    await page.screenshot({path:`output/web-game/melee-skill-counter/${width}.png`});
    assert.deepEqual(errors,[]);
    console.log(`${width}: normal/skill melee counter, base-weapon-only, ranged/magic/area/splash exclusions OK`);
    await page.close();
  }
}finally{await browser.close();}
