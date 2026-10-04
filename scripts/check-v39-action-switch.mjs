import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280,height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3021", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.getV39AttackSession === "function");
  await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    window.generateV39TestFieldWithSeed({ w:36,h:36,patternId:"realistic" }, "action-switch-check");
    await new Promise(resolve => setTimeout(resolve,100));
    const state = window.getV39GameState();
    const player = state.players.find(row => row.id === state.activePlayerId);
    const unit = player.factionState.units[0];
    window.setV39GameState({ players:state.players.map(row => row.id !== player.id ? row : ({ ...row,
      factionState:{ ...row.factionState, selectedUnitId:unit.id,
        units:[{ ...unit,x:5,y:5,hp:100,currentHp:100,state:"生存",ap:100,currentAp:100,actionPoint:100 }],
        exploration:{ discoveredFeaturesByTile:{},surveyedTileKeys:[],history:[],lastProcessedTurn:0 }
      }
    })), enemies:[],neutralVillages:[],enemyNests:[] });
    window.activateV39FooterTab("squad");
  });
  await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
  await page.locator('[data-squad-detail-tab="action"]').click();
  const attack = () => page.locator('[data-v39-attack-name]:not(.unavailable)').first();
  const session = () => page.evaluate(() => window.getV39AttackSession());
  const clickUnavailableSurvey = async () => {
    const button = page.locator("#mobileBattleSurvey");
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    // aria-disabled describes action availability; native clicks still cancel targeting and show the reason.
    await page.mouse.click(box.x + box.width / 2,box.y + box.height / 2);
  };
  const start = async () => {
    await attack().click();
    await page.waitForFunction(() => !!window.getV39AttackSession());
  };
  await start();
  await attack().click();
  assert.equal(await session(),null,"same attack must toggle off");
  assert.equal(await page.locator('[data-v39-attack-name].active').count(),0);
  await start();
  const passive = page.locator('#detailTechniqueRows [data-v39-technique-name]:not([data-v39-attack-name])').first();
  if (await passive.count()) {
    await passive.click();
    assert.equal(await session(),null,"non-attack skill must cancel attack");
  } else {
    await attack().click();
  }
  await start();
  await page.locator("#mobileBattleMove").click();
  assert.equal(await session(),null,"movement must cancel attack");
  await start();
  await page.locator("#mobileBattleSurvey").click();
  assert.equal(await session(),null,"survey must cancel attack");
  await page.locator("#mobileBattleSurveyUse").click();
  const survey = await page.evaluate(() => {
    const state = window.getV39GameState();
    const player = state.players.find(row => row.id === state.activePlayerId);
    const unit = player.factionState.units.find(unit => unit.id === player.factionState.selectedUnitId);
    return { ap:unit.ap,progress:unit.surveyTask?.progressPercent };
  });
  assert.deepEqual(survey,{ ap:0,progress:100 });
  await page.evaluate(() => {
    const state = window.getV39GameState();
    window.setV39GameState({ players:state.players.map(player => ({ ...player,
      factionState:{ ...player.factionState,units:player.factionState.units.map(unit => ({ ...unit,ap:100,currentAp:100,actionPoint:100 })) }
    })) });
  });
  await start();
  await clickUnavailableSurvey();
  assert.equal(await session(),null,"unavailable survey must also cancel attack");
  assert.match(await page.locator("#mobileBattleSurvey").getAttribute("title"),/すでに調査中/);
  assert.equal(await page.locator("#mobileBattleSurveyUse").isDisabled(),true);
  await start();
  await page.locator("#mobileBattleWait").click();
  assert.equal(await session(),null,"wait must cancel attack");
  await page.locator("#mobileBattleWaitUse").click();
  await clickUnavailableSurvey();
  assert.match(await page.locator("#mobileBattleSurvey").getAttribute("title"),/待機済み/);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ survey, toggleOff:true, moveCancels:true, surveyCancels:true, unavailableSurveyCancels:true, waitCancels:true, errors },null,2));
  await page.screenshot({ path:"output/web-game/v39-action-switch.png" });
} finally { await browser.close(); }
