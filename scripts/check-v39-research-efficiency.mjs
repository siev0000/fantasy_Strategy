import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const balanceUrl = moduleUrl(readFileSync("frontend/src/lib/v39-gameplay-balance.js", "utf8"));
const tree = {
  recommendedUnitLevels:{1:5,2:15}, timeReductionSkills:{軍事Lv:"指揮"},
  categories:{軍事Lv:{levels:[
    {level:1,items:[{id:"basic",level:1,recommendedUnitLevel:5}]},
    {level:2,items:[{id:"advanced",level:2,recommendedUnitLevel:15}]}
  ]}}
};
const treeUrl = moduleUrl(`export const researchTreeData=${JSON.stringify(tree)};
  export const normalizeResearchCategoryName=value=>value;`);
const source = readFileSync("frontend/src/lib/research-progress.js", "utf8")
  .replace('"./research-tree-config.js"', JSON.stringify(treeUrl))
  .replace('"./v39-gameplay-balance.js"', JSON.stringify(balanceUrl));
const research = await import(moduleUrl(source));
const low = {id:"low",level:1,skillLevels:{指揮:0}}, normal = {...low,level:5};
assert.equal(research.isResearchLevelUnlocked({},"軍事Lv",1,1),true);
assert.equal(research.isResearchLevelUnlocked({},"軍事Lv",2,99),false);
let result = research.selectResearch({},"軍事Lv","basic",low);
assert.equal(result.changed,true);
assert.equal(research.researchExperiencePerTurn(low,"軍事Lv",tree,tree.categories.軍事Lv.levels[0].items[0]),2);
assert.equal(research.researchExperiencePerTurn(normal,"軍事Lv",tree,tree.categories.軍事Lv.levels[0].items[0]),10);
assert.equal(research.researchExperiencePerTurn({...normal,level:99},"軍事Lv",tree,tree.categories.軍事Lv.levels[0].items[0]),10);
assert.equal(research.researchExperiencePerTurn({...low,level:0},"軍事Lv",tree,tree.categories.軍事Lv.levels[1].items[0]),1);
assert.equal(research.researchExperiencePerTurn(null,"軍事Lv",tree),0);
assert.equal(research.researchExperiencePerTurn({...normal,skillLevels:{指揮:50}},"軍事Lv",tree,tree.categories.軍事Lv.levels[0].items[0]),15);
result = research.addResearchExperience(result.state,"軍事Lv",40);
assert.equal(research.selectResearch(result.state,"軍事Lv","advanced",low).changed,false);
assert.equal(research.selectResearch(result.state,"軍事Lv","basic",normal).state.progress.targetExpMap.basic,40);
result = research.addResearchExperience(result.state,"軍事Lv",60);
assert.equal(result.completed,true);
assert.equal(research.isResearchLevelUnlocked(result.state,"軍事Lv",2,1),true);
result = research.selectResearch(result.state,"軍事Lv","advanced",low);
assert.equal(result.changed,true);
assert.equal(research.researchExperiencePerTurn(low,"軍事Lv",tree,tree.categories.軍事Lv.levels[1].items[0]),1);
assert.deepEqual(research.normalizeResearchState(JSON.parse(JSON.stringify(result.state))),result.state);
console.log("research: prerequisite unlock, low-Lv selection, efficiency, minimum gain, skills, progress and save passed");
