import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const progress = url(`export const findResearchItem=id=>id==='known' ? {categoryKey:'軍事Lv',level:1,item:{name:'施設解禁'}} : null;
  export const isResearchCompleted=(research,category,level,id)=>!!research?.completed?.includes(id);`);
const defaults = url('export default {facilityResearchIds:{"仮施設":["known"]}};');
const balance = url('export const V39_RESEARCH_BALANCE={constructionUnlockMode:"item"};');
const source = readFileSync("frontend/src/lib/v39-construction-research.js","utf8")
  .replace('"../../../config/v39-construction-research-defaults.json"',JSON.stringify(defaults))
  .replace('"./v39-gameplay-balance.js"',JSON.stringify(balance))
  .replace('"./research-progress.js"',JSON.stringify(progress));
const {inspectFacilityResearch:inspect,requiredFacilityResearchIds:ids,facilitiesUnlockedByResearch:targets}=await import(url(source));
const facility={name:"仮施設",requirements:{軍事Lv:2}};
assert.deepEqual(inspect({},facility,"level").reasons,[]);
assert.deepEqual(inspect({},facility,"item").reasons,["研究未完了: 施設解禁"]);
assert.deepEqual(inspect({completed:["known"]},facility,"item").reasons,[]);
assert.deepEqual(inspect({}, {name:"未設定",requirements:{軍事Lv:1}},"item").reasons,["解禁研究が未設定です"]);
assert.deepEqual(inspect({}, {name:"研究不要",requirements:{}},"item").reasons,[]);
assert.deepEqual(inspect({completed:["unknown"]},{...facility,requiredResearchIds:["unknown"]},"item").reasons,["研究未完了: unknown"]);
assert.deepEqual(inspect({completed:["known"]},{...facility,requiredResearchIds:["known","unknown"]},"item").reasons,["研究未完了: unknown"]);
assert.deepEqual(ids({...facility,requiredResearchIds:["known","known"]}),["known"]);
assert.deepEqual(targets("known",[facility,{name:"別施設"}]),[facility]);
console.log("construction research: level/item modes, explicit completion, missing mapping, unknown IDs, all prerequisites and target display passed");
