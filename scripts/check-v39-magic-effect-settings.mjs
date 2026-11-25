import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {build} from "esbuild";

const values = new Map();
globalThis.window = {dispatchEvent(){},localStorage:{
  getItem:key=>values.get(key) ?? null,
  setItem:(key,value)=>values.set(key,value)
}};
const {outputFiles} = await build({
  stdin:{resolveDir:process.cwd(),contents:`
    export * from "./frontend/src/lib/v39-magic-effect-settings.js";
    export * from "./frontend/src/lib/v39-combat-effect-rules.js";
    export * from "./frontend/src/lib/v39-effect-settings.js";
  `},
  bundle:true,write:false,format:"esm",platform:"node"
});
const moduleUrl = "data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64");
const init = module => {
  module.setV39EffectSettingsCatalog(["斬撃","炎の雨","火炎2","シールド"]);
  module.setV39MagicEffectSkillCatalog(rows);
};
const rows = JSON.parse(readFileSync("data/source/export/json/スキル一覧.json","utf8"));
const api = await import(moduleUrl);
init(api);

const spells = api.getV39MagicEffectSpells();
assert.ok(spells.length >= 156);
assert.ok(spells.some(spell=>!spell.system));
assert.ok(spells.some(spell=>spell.row.攻撃手段 !== "魔法" && spell.row.判定 === "魔力"));
const [spell,other] = spells;
const explicit = {...spell.row,アニメ:"炎の雨:火炎2"};
assert.deepEqual(api.resolveV39CombatEffect(explicit),{effectName:"炎の雨:火炎2",reason:"スキル指定"});
assert.equal(api.getV39MagicEffectSetting(spell.key),null);
const settings = {
  baseEffect:"火炎2",sequenceSteps:[{effectName:"火炎2",offsetX:25},{effectName:"炎の雨"}],
  decorationEffect:"シールド",gradientEnabled:true,scaleMultiplierPercent:160,playbackSpeedPercent:200
};
assert.equal(api.updateV39MagicEffectSetting(spell.key,settings),true);
const resolved = api.resolveV39CombatEffect(explicit);
assert.equal(resolved.reason,"魔法別設定");
assert.equal(resolved.effectName,"火炎2");
assert.equal(resolved.settings.gradientEnabled,true);
assert.equal(resolved.settings.scaleMultiplierPercent,160);
assert.equal(resolved.settings.playbackSpeedPercent,200);
assert.equal(resolved.defaultSpeedPercent,100);
assert.equal(resolved.settings.damageMomentPercent,75);
assert.deepEqual(resolved.settings.sequenceSteps.map(step=>step.effectName),["火炎2","炎の雨","シールド"]);
assert.equal(resolved.settings.sequenceSteps[0].offsetX,25);
const proxy = api.registerV39EffectEditorProxy("@magic","斬撃");
api.updateV39EffectSetting(proxy,api.getV39MagicEffectSetting(spell.key));
assert.deepEqual(api.resolveV39EffectPlaybackSettings(proxy).sequenceSteps,resolved.settings.sequenceSteps);
assert.equal(api.getV39MagicEffectSetting(other.key),null);
assert.deepEqual(api.getV39EffectSettingsSnapshot().effects,{});
assert.equal(api.resolveV39CombatEffect(explicit,{},[],[],{automatic:true}).reason,"スキル指定");
assert.equal(api.resolveV39CombatEffect({攻撃手段:"武器"},{},[{id:"weapon",baseEffect:"斬撃"}]).categoryId,"weapon");

const reloaded = await import(moduleUrl+"#reload");
init(reloaded);
assert.deepEqual(reloaded.getV39MagicEffectSnapshot(),api.getV39MagicEffectSnapshot());
const jsonSnapshot = () => JSON.parse(JSON.stringify(api.getV39MagicEffectSnapshot()));
const file = jsonSnapshot();
assert.throws(()=>api.prepareV39MagicEffectImport({...file,[other.key]:{baseEffect:"斬撃",scaleMultiplierPercent:"large"}}));
assert.deepEqual(jsonSnapshot(),file);
const unknown = {...file,[other.key]:{baseEffect:"未知画像"},unknown:{baseEffect:"斬撃"}};
api.resetV39MagicEffectSetting(spell.key);
assert.equal(api.resolveV39CombatEffect(explicit).reason,"スキル指定");
const result = api.prepareV39MagicEffectImport(unknown);
assert.equal(result.skippedCount,2);
assert.equal(result.importedCount,1);
result.apply();
assert.deepEqual(jsonSnapshot(),file);

const sameNames = [
  {名前:"同じ名前",行動:"A",攻撃手段:"魔法",系統:"炎"},
  {名前:"同じ名前",行動:"A",攻撃手段:"魔法",系統:"氷"}
];
api.setV39MagicEffectSkillCatalog(sameNames);
assert.equal(api.getV39MagicEffectSpells().length,2);
api.setV39MagicEffectSkillCatalog([...sameNames,sameNames[0]]);
assert.equal(api.getV39MagicEffectSpells().length,1);
console.log(`Magic effect settings OK for ${spells.length} skills`);
