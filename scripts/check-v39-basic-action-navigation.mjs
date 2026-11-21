import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('frontend/src/v39/unit/v39-basic-action-navigation.js','utf8');
const {createV39BasicActionNavigation}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class Node {
  constructor(id='',tag='DIV',textContent=''){
    Object.assign(this,{id,tagName:tag,textContent,hidden:false,dataset:{},children:[],events:{},attributes:{},classes:new Set()});
    this.classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};
  }
  add(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}return this;}
  get firstElementChild(){return this.children[0]||null;}
  matches(selector){return selector.split(',').some(part=>
    part.startsWith('[')?this.hasAttribute(part.slice(1,-1)):this.tagName.toLowerCase()===part);}
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector);}
  querySelector(selector){return this.parts?.[selector]||null;}
  hasAttribute(key){return Object.hasOwn(this.attributes,key);}
  addEventListener(type,fn){this.events[type]=fn;}
  click(){this.events.click?.();}
  focus(){this.focused=true;}
}
const panel=new Node(),list=new Node('detailBasicList'),options=new Node(),heading=new Node();
const move=new Node('mobileBattleMove','BUTTON','移動'),wait=new Node('mobileBattleWait','DIV','待機');
const food=new Node('detailCarriedFood','DETAILS','携帯食料・補給'),soul=new Node('mobileSoulRecovery','DIV','魂を回収');
for(const action of [wait,soul]){
  action.parts={':scope > .technique-summary':{querySelector:selector=>selector==='.technique-name'?action:null}};
}
const iconMarkup='<span class="technique-icon"><span class="technique-icon-glyph">➜</span></span>';
const moveSummary={querySelector:selector=>selector==='.technique-name'?move:
  selector.startsWith('.technique-icon')?{outerHTML:iconMarkup}:null};
move.parts={':scope > .technique-summary':moveSummary};
const boarding=new Node('v39-golem-boarding-actions'),boardingDetail=new Node('','SECTION','搭乗検証パイロット');
boarding.attributes['data-basic-action-group']='';
boarding.parts={':scope > [data-basic-action-label]':boardingDetail};boardingDetail.dataset.basicActionLabel='降車';
const cargo=new Node('detailUnitCargoStatus','DIV','積載 0/117.6 / 魂 0');
cargo.attributes['data-basic-action-label']='手持ち物資';cargo.dataset.basicActionLabel='手持ち物資';
for(const action of [food,cargo])action.attributes['data-basic-action-icon']='';
food.parts={':scope > summary':new Node('','SUMMARY','携帯食料・補給')};
boarding.add(boardingDetail);
list.add(move,wait,food,cargo,soul,boarding);panel.add(heading,options,list);
let cancelled=0;const changes=[];
const screenIcons=new Map([['携帯食料・補給','🍞'],['手持ち物資','🧺']]);
const nav=createV39BasicActionNavigation({panel,list,options,heading,renderIcon:label=>screenIcons.get(label),
  onBack:()=>cancelled++,onChange:key=>changes.push(key)});
assert(heading.hidden&&list.hidden&&!options.hidden);
for(const label of ['移動','待機','携帯食料・補給','手持ち物資','降車'])assert(options.innerHTML.includes(`<b>${label}</b>`));
assert(options.innerHTML.includes(`${iconMarkup}</span><b>移動</b>`),'the list keeps the existing action icon');
assert(options.innerHTML.includes('🍞</span></span><b>携帯食料・補給</b>'));
assert(options.innerHTML.includes('🧺</span></span><b>手持ち物資</b>'));
assert(!options.innerHTML.includes('搭乗検証パイロット'));assert(!options.innerHTML.includes('積載 0/117.6'));
const open=key=>{const button=new Node('','BUTTON');button.attributes['data-basic-action-option']='';button.dataset.basicActionOption=key;options.events.click({target:button});};
let moveStarted=false;move.attributes['data-v39-technique-name']='';move.addEventListener('click',()=>{moveStarted=true;});
open(move.id);assert(moveStarted);assert.equal(panel.dataset.basicAction,'mobileBattleMove');assert(!heading.hidden&&options.hidden&&!list.hidden);
assert(move.classes.has('v39-basic-action-selected'));assert(!wait.classes.has('v39-basic-action-selected'));
heading.events.click();assert.equal(cancelled,1);assert.equal(list.dataset.basicAction,'');assert(heading.hidden);
nav.select(wait);assert(!heading.hidden);
open(food.id);
assert(food.open);assert(!heading.hidden);
assert(!wait.classes.has('v39-basic-action-selected'));
nav.sync();assert.equal(panel.dataset.basicAction,'detailCarriedFood','rerender retains the selected action');
heading.events.click();assert.equal(food.open,false);
nav.select(soul);soul.hidden=true;nav.sync();assert.equal(panel.dataset.basicAction,'','unavailable action falls back to list');
soul.hidden=false;nav.select(soul);
const replacement=new Node('mobileSoulRecovery','DIV','魂を回収');replacement.parentElement=list;
replacement.parts=soul.parts;
list.children[list.children.indexOf(soul)]=replacement;
nav.sync();assert(replacement.classes.has('v39-basic-action-selected'),'replacement nodes retain selection without cloning controls');
assert(!nav.select(new Node('outside')));assert.equal(changes.at(-1),'mobileSoulRecovery');
open(boarding.id);
assert.equal(panel.dataset.basicAction,boarding.id);
boarding.children=[];nav.sync();
assert(heading.hidden);assert.equal(panel.dataset.basicAction,'');
assert(!options.innerHTML.includes('<b>降車</b>'));
const template=readFileSync('frontend/src/v39/ui/v39-operation-ui.js','utf8');
assert(template.includes('id="v39-basic-action-heading"'));assert(template.includes('id="v39-basic-coordination"'));
const binding=readFileSync('frontend/src/v39/unit/v39-squad-derived-binding.js','utf8');
assert(binding.includes('basicNavigation?.select(card)'));assert(binding.includes('basicNavigation?.sync()'));
console.log('PASS: basic action selection/header return, food controls, hidden/dynamic actions, rerender persistence and existing integration. No browser.');
