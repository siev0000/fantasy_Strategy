import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('frontend/src/v39/unit/v39-basic-action-navigation.js','utf8');
const {createV39BasicActionNavigation}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class Node {
  constructor(id='',tag='DIV',title=''){
    Object.assign(this,{id,tagName:tag,title,hidden:false,dataset:{},children:[],events:{},attributes:{},classes:new Set()});
    this.classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};
  }
  add(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}return this;}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  querySelector(){return this.title?{textContent:this.title}:null;}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(type,fn){this.events[type]=fn;}
}
const panel=new Node(),list=new Node('detailBasicList'),heading=new Node(),label=new Node();
const move=new Node('mobileBattleMove','BUTTON','移動'),wait=new Node('mobileBattleWait','DIV','待機');
const food=new Node('detailCarriedFood','DETAILS','携帯食料・補給'),soul=new Node('mobileSoulRecovery','DIV','魂を回収');
const summary=new Node('','SUMMARY');food.add(summary);list.add(move,wait,food,soul);panel.add(heading,list);
let cancelled=0;const changes=[];
const nav=createV39BasicActionNavigation({panel,list,heading,label,onBack:()=>cancelled++,onChange:key=>changes.push(key)});
assert(heading.disabled);assert.equal(label.textContent,'行動を選択');
assert(nav.select(move));assert.equal(panel.dataset.basicAction,'mobileBattleMove');assert.equal(label.textContent,'‹ 移動');
assert(move.classes.has('v39-basic-action-selected'));assert(!wait.classes.has('v39-basic-action-selected'));
heading.events.click();assert.equal(cancelled,1);assert.equal(list.dataset.basicAction,'');assert(heading.disabled);
nav.select(wait);assert.equal(label.textContent,'‹ 待機');
let prevented=false;summary.closest=()=>summary;
panel.events.click({target:summary,preventDefault(){prevented=true;}});
assert(prevented);assert(food.open);assert.equal(label.textContent,'‹ 携帯食料・補給');
assert(!wait.classes.has('v39-basic-action-selected'));
nav.sync();assert.equal(panel.dataset.basicAction,'detailCarriedFood','rerender retains the selected action');
heading.events.click();assert.equal(food.open,false);
nav.select(soul);soul.hidden=true;nav.sync();assert.equal(panel.dataset.basicAction,'','unavailable action falls back to list');
soul.hidden=false;nav.select(soul);
const replacement=new Node('mobileSoulRecovery','DIV','魂を回収');replacement.parentElement=list;
list.children[list.children.indexOf(soul)]=replacement;
nav.sync();assert(replacement.classes.has('v39-basic-action-selected'),'replacement nodes retain selection without cloning controls');
assert(!nav.select(new Node('outside')));assert.equal(changes.at(-1),'mobileSoulRecovery');
const template=readFileSync('frontend/src/v39/ui/v39-operation-ui.js','utf8');
assert(template.includes('id="v39-basic-action-heading"'));assert(template.includes('id="v39-basic-coordination"'));
const binding=readFileSync('frontend/src/v39/unit/v39-squad-derived-binding.js','utf8');
assert(binding.includes('basicNavigation?.select(card)'));assert(binding.includes('basicNavigation?.sync()'));
console.log('PASS: basic action selection/header return, food controls, hidden/dynamic actions, rerender persistence and existing integration. No browser.');
