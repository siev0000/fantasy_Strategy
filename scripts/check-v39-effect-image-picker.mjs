import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints:['frontend/src/v39/ui/v39-effect-image-picker.js'], bundle:true, write:false,
  format:'esm', platform:'node', plugins:[{name:'source-stub',setup(b){
    b.onLoad({filter:/v39-effect-player\.js$/},()=>({contents:'export const getV39EffectImageSource = () => null;'}));
  }}] });
const { openEffectImagePicker } = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
class Node {
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.dataset={};this.attrs={};this.handlers={};this.value='';this.isConnected=true;}
  append(...children){for(const child of children)child.parent=this;this.children.push(...children);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,fn){this.handlers[k]=fn;}
  querySelector(tag){return this.children.find(n=>n.tag===tag);}
  getContext(){return {drawImage(){}};}
  focus(){this.focused=true;}
  showModal(){this.open=true;}
  close(){this.open=false;this.handlers.close?.();}
  remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
}
const previous={document:globalThis.document,IntersectionObserver:globalThis.IntersectionObserver,Image:globalThis.Image};
const body=new Node('body'),observers=[],images=[];
globalThis.document={body,createElement:tag=>new Node(tag)};
globalThis.IntersectionObserver=class {
  constructor(callback){this.callback=callback;this.targets=new Set();observers.push(this);}
  observe(node){this.targets.add(node);}unobserve(node){this.targets.delete(node);}disconnect(){this.disconnected=true;this.targets.clear();}
};
globalThis.Image=class {constructor(){this.width=960;this.height=120;images.push(this);}set src(value){this.url=value;}};
try {
  const catalog=['斬撃','炎','竜巻','落雷','雨','雪'],focus=new Node('button');let selected;
  const finish=openEffectImagePicker({catalog,selected:'竜巻',returnFocus:focus,onSelect:name=>{selected=name;},sourceFor:name=>({src:name})});
  const dialog=body.children[0],gallery=dialog.children[3],search=dialog.children[2],observer=observers.at(-1);
  assert.equal(dialog.open,true);assert.equal(gallery.children.length,6);
  assert.equal(gallery.children[2].attrs['aria-pressed'],'true');
  observer.callback(gallery.children.map(target=>({target,isIntersecting:true})));
  assert.equal(images.length,4,'at most four thumbnails load concurrently');
  images[0].onload();assert.equal(images.length,5);
  search.value='竜';search.handlers.input();
  assert.equal(gallery.children.filter(n=>!n.hidden).length,1);
  gallery.children[2].handlers.click();
  assert.equal(selected,'竜巻');assert.equal(body.children.length,0);assert.ok(observer.disconnected);assert.ok(focus.focused);
  const before=images.length;images[1].onload();assert.equal(images.length,before,'closing prevents new thumbnail loads');
  finish();
  selected=undefined;
  openEffectImagePicker({catalog,selected:'炎',onSelect:name=>{selected=name;},sourceFor:()=>null});
  const cancelled=body.children[0];cancelled.handlers.cancel({preventDefault(){}});
  assert.equal(selected,undefined,'cancel does not change selection');assert.equal(body.children.length,0);
} finally {Object.assign(globalThis,previous);}
console.log('PASS: image modal selection, search, selected marker, cancellation, focus return and bounded lazy loading. No browser.');
