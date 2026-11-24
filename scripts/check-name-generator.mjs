import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const moduleSource = readFileSync("frontend/src/lib/name-generator.js", "utf8");
const {generateNameResults} = await import("data:text/javascript;base64," + Buffer.from(moduleSource).toString("base64"));
const source = "data/source/export/json/";
const lexicon = JSON.parse(readFileSync(source + "命名辞書.json", "utf8"));
const races = JSON.parse(readFileSync(source + "種族.json", "utf8"));
assert.equal(races.length, 11);
assert.equal(lexicon.length, 589);
assert.equal(lexicon.filter(row=>row.出典区分==="語源参考").length,19);
assert.equal(lexicon.filter(row=>row.出典区分==="ソロモン72柱・音形").length,24);
assert.equal(new Set(lexicon.map(row=>[row.種族,row.語,row.区分,row.性別傾向].join("|"))).size,589);
assert.ok(lexicon.every(row => !("ID" in row)), "命名辞書に不要なIDは置かない");
assert.ok(races.every(row => Array.isArray(row["男性名候補"]) && Array.isArray(row["女性名候補"])));
for(const race of races) {
  for(const gender of ["共通","男性系","女性系"]) {
    const batch = generateNameResults({race:race.key,gender,count:10,lexicon,races,random:()=>.5});
    assert.equal(batch.length, 10, race.key + ":" + gender);
    assert.equal(new Set(batch.map(r=>r.name)).size, 10);
    assert.ok(batch.every(r=>[...r.name].length<=20 && r.parts.length===2 && r.meaning));
    assert.ok(batch.every(r=>r.name.includes("・")===(race.key==="竜人")),race.key+":name format");
    const single = generateNameResults({race:race.key,gender,count:1,lexicon,races,random:()=>.5});
    assert.equal(single.length, 1);
  }
  for(const gender of ["共通","男性系","女性系"]) {
    const batch = generateNameResults({race:race.key,gender,mode:"presets",count:10,lexicon,races,random:()=>.5});
    assert.equal(batch.length, 10, race.key + ":presets:" + gender);
    assert.equal(new Set(batch.map(r=>r.name)).size, 10);
  }
}
const disabled = lexicon.map(row => ({...row, 使用可:false}));
assert.deepEqual(generateNameResults({race:"只人",lexicon:disabled}), []);
const appMarkup = readFileSync("frontend/src/App.vue", "utf8");
const mapPanelMarkup = readFileSync("frontend/src/components/PhaserMapGeneratorPanel.vue", "utf8");
assert.match(appMarkup, /class="name-generator-title-launch"/, "ゲーム開始前の名前生成ボタン");
assert.match(appMarkup, /<name-generator-modal\s+:show="showNameGeneratorModal"/, "開始前の生成モーダル接続");
assert.match(mapPanelMarkup, /@click="openNameGeneratorFromQuickMenu"/, "右上設定メニューからの起動");
assert.match(mapPanelMarkup, /<name-generator-modal\s+:show="showNameGeneratorModal"/, "ゲーム中の生成モーダル接続");
console.log("name generator: 11 races × 3 gender modes × (single/batch/preset), start launcher and settings modal OK");
