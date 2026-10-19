import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const oldFile='昆虫・甲殻・地中生物_ユニット一覧.webp';
const path='data/source/export/json/出現敵.json';
const before=JSON.parse(execFileSync('git',['show',`HEAD:${path}`],{encoding:'utf8'}));
const after=JSON.parse(readFileSync(path,'utf8'));
assert.equal(before.length,after.length);
const updated=before.flatMap((row,i)=>row.画像ファイル===oldFile?[{old:row,current:after[i]}]:[]);
assert.equal(updated.length,46);
for(let i=0;i<before.length;i++) {
  const {画像ファイル:a,画像番号:b,...restBefore}=before[i];
  const {画像ファイル:c,画像番号:d,...restAfter}=after[i];
  assert.deepEqual(restBefore,restAfter,`unrelated data changed: ${i}`);
  if(a!==oldFile)assert.deepEqual([a,b],[c,d]);
}
assert(!after.some(row=>row.画像ファイル===oldFile));

const out='output/web-game/insect-artwork';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  const report=await page.evaluate(async ({updated,oldFile})=>{
    const {resolveMonsterSheetArtwork:art,resolveMonsterSheetFrame:frame}=await import('/src/lib/monster-sheet-artwork.js');
    const {resolveEnemyArtwork,resolveUnitArtwork}=await import('/src/lib/map-entity-artwork.js');
    const checks=updated.map(({old,current})=>({name:current.種族名,
      expected:[current.画像ファイル,current.画像番号],
      current:art(current),legacy:art(old),
      saved:art({imageFile:old.画像ファイル,imageIndex:old.画像番号,level:50,sizeArtworkByLevel:true}),
      unit:resolveUnitArtwork(current),enemy:resolveEnemyArtwork(current),
      direct:frame(oldFile,old.画像番号)}));
    return {checks,unknown:frame(oldFile,12),unrelated:frame('狼・馬_ユニット集.webp',7)};
  },{updated,oldFile});
  const images=new Set();
  for(const row of report.checks)for(const key of ['current','legacy','saved','unit','enemy','direct']) {
    assert.deepEqual([row[key]?.sheetFrame.fileName,row[key]?.sheetFrame.slotNumber],row.expected,`${row.name}/${key}`);
    images.add(row[key].src);
  }
  assert.equal(report.unknown,null);assert.equal(report.unrelated.sheetFrame.slotNumber,7);
  for(const src of images)assert.equal((await page.request.get(new URL(src,page.url()).href)).status(),200);
  // Diagnostic gallery uses the same 4x3 crop coordinates as the runtime sheets.
  await page.evaluate(async checks=>{
    const rows=[...new Map(checks.map(row=>[row.expected.join(':'),row])).values()];
    const gallery=document.createElement('div');gallery.id='insect-artwork-verification';
    Object.assign(gallery.style,{position:'fixed',inset:'0',zIndex:'2147483647',background:'#152329',color:'white',display:'grid',gridTemplateColumns:'repeat(5,1fr)',alignContent:'start',gap:'12px',padding:'12px',overflow:'auto'});
    for(const row of rows){
      const card=document.createElement('div'),sprite=document.createElement('div'),label=document.createElement('div');
      const {column,row:r}=row.current.sheetFrame;
      Object.assign(sprite.style,{height:'180px',width:'180px',backgroundImage:`url("${row.current.src}")`,backgroundSize:'400% 300%',backgroundPosition:`${column/3*100}% ${r/2*100}%`,backgroundRepeat:'no-repeat'});
      label.textContent=`${row.name} #${row.expected[1]}`;card.append(sprite,label);gallery.append(card);
    }
    document.body.append(gallery);
    await Promise.all(rows.map(row=>new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=row.current.src;})));
  },report.checks);
  await page.screenshot({path:`${out}/dedicated-sheets.png`});
  assert.deepEqual(errors,[]);
  console.log('46 source rows: only artwork changed; new/old save/unit/enemy/direct frame paths and all image requests passed');
} finally {await browser.close();}
