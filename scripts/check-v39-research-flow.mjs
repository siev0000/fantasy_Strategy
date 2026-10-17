import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const rows=JSON.parse(readFileSync("data/source/export/json/研究.json","utf8"));
const city=JSON.parse(readFileSync("data/source/export/json/都市基本データ.json","utf8"));
const registry=url(`export const researchData=${JSON.stringify(rows)}, cityBaseData=${JSON.stringify(city)};`);
const defaults=url(`export default ${readFileSync('config/v39-expedition-defaults.json','utf8')};`);
const config=url(readFileSync("frontend/src/lib/research-tree-config.js","utf8").replace('"./game-data-registry.js"',JSON.stringify(registry)).replace('"../../../config/v39-expedition-defaults.json"',JSON.stringify(defaults)));
const balance=url(readFileSync("frontend/src/lib/v39-gameplay-balance.js","utf8"));
const rules=await import(url(readFileSync("frontend/src/lib/research-progress.js","utf8").replace('"./research-tree-config.js"',JSON.stringify(config)).replace('"./v39-gameplay-balance.js"',JSON.stringify(balance))));
const {researchTreeData:tree,resolveResearchTreeData}=await import(config);
const root="鍛冶Lv:1:武器製造効率Ⅰ", branch="鍛冶Lv:2:製作効率Ⅰ";
let result=rules.selectResearch({},"鍛冶Lv",root,{id:"unit",level:1});
assert.equal(result.changed,true);
assert.equal(rules.inspectResearchUnlock(result.state,branch).unlocked,false);
result=rules.addResearchExperience(result.state,"鍛冶Lv",100);
assert.equal(rules.inspectResearchUnlock(result.state,branch).unlocked,true);
assert.equal(rules.isResearchCompleted(result.state,"鍛冶Lv",1,"鍛冶Lv:1:防具製造効率Ⅰ"),false);
assert.equal(rules.inspectResearchUnlock(result.state,"鍛冶Lv:2:鉄資源効率Ⅰ").unlocked,false);
result=rules.selectResearch(result.state,"鍛冶Lv",branch,{id:"unit",level:1});
result=rules.addResearchExperience(result.state,"鍛冶Lv",37);
assert.equal(result.state.progress.targetExpMap[branch],37);
assert.deepEqual(rules.normalizeResearchState(JSON.parse(JSON.stringify(result.state))),result.state);
const geo="地質調査Lv:1:地質調査Ⅰ", eco="生態調査Lv:1:生態調査Ⅰ";
const legacy=rules.normalizeResearchState({progress:{completedByCategoryLevel:{地質調査Lv:{1:[geo]},生態調査Lv:{1:[eco]}},targetExpMap:{"地質調査Lv:2:地質調査Ⅱ":55},carryByCategory:{地質調査Lv:3,生態調査Lv:4}},selection:{地質調査Lv:"地質調査Lv:2:地質調査Ⅱ"},assignedUnitIdByCategory:{地質調査Lv:"unit"}});
assert.deepEqual(new Set(legacy.progress.completedByCategoryLevel.調査Lv[1]),new Set([geo,eco]));
assert.equal(legacy.selection.調査Lv,"地質調査Lv:2:地質調査Ⅱ");
assert.equal(legacy.progress.carryByCategory.調査Lv,7);
assert.equal(rules.resolveCompletedResearchLevel(legacy,"地質調査Lv"),1);
assert.equal(rules.resolveCompletedResearchLevel(legacy,"地質調査"),1);
assert.equal(rules.resolveCompletedResearchLevel({progress:{completedByCategoryLevel:{調査Lv:{1:[geo]}}}},"生態調査"),0);
assert.equal(rules.inspectResearchUnlock({progress:{completedByCategoryLevel:{調査Lv:{1:[geo]}}}},"生態調査Lv:2:生態調査Ⅱ").unlocked,false);
const bad=resolveResearchTreeData([...rows,{項目名:"不明",技術対象:"鍛冶",Lv:1,ID:"missing",前提研究ID:"no-id"},
  {項目名:"循環A",技術対象:"鍛冶",Lv:1,ID:"cycle-a",前提研究ID:"cycle-b"},
  {項目名:"循環B",技術対象:"鍛冶",Lv:1,ID:"cycle-b",前提研究ID:"cycle-a"}]);
assert.equal(rules.inspectResearchUnlock({},"missing",bad).unlocked,false);
assert.equal(rules.inspectResearchUnlock({},"cycle-a",bad).unlocked,false);
const {layoutResearchFlow}=await import(url(readFileSync("frontend/src/lib/research-flow-layout.js","utf8")));
const flow=layoutResearchFlow(tree.categories.調査Lv.levels.flatMap(row=>row.items));
assert.equal(flow.nodes.length,7);assert.equal(flow.edges.length,4);
for (const {from,to} of flow.edges) {
  assert.equal(from.x,to.x);
  assert.ok(from.y+from.height<to.y);
}
const narrow=layoutResearchFlow(tree.categories.調査Lv.levels.flatMap(row=>row.items),{width:270,maxColumns:1});
assert.ok(narrow.nodes.every(node=>node.x===12));
assert.equal(narrow.width,294);
console.log("research flow: branch unlock, no all-item gate, save, legacy category migration, discovery isolation, invalid/cyclic IDs and layout passed");
