import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/ui-render-work';mkdirSync(out,{recursive:true});
const baseline=process.env.V39_RENDER_BASELINE==='1';
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));
    await page.addInitScript(()=>{
      const property=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
      window.__renderWrites={};
      Object.defineProperty(Element.prototype,'innerHTML',{...property,set(value){
        if(this.id)window.__renderWrites[this.id]=(window.__renderWrites[this.id]||0)+1;
        property.set.call(this,value);
      }});
      const set=CSSStyleDeclaration.prototype.setProperty;
      window.__textFitWrites=0;
      CSSStyleDeclaration.prototype.setProperty=function(name,...values){
        if(name==='--v39-text-fit')window.__textFitWrites++;
        return set.call(this,name,...values);
      };
    });
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);
      window.startV39ExpeditionTest();window.activateV39FooterTab('squad');
    });
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    await page.waitForTimeout(350);
    const header=await page.evaluate(()=>{
      const original=document.querySelector('#resourceSet button'),snapshot=window.getV39ResourceSnapshot,getState=window.getV39GameState;
      let snapshots=0,states=0;
      window.getV39ResourceSnapshot=(...args)=>{snapshots++;return snapshot(...args);};
      window.getV39GameState=(...args)=>{states++;return getState(...args);};
      window.__renderWrites={};original.focus();
      const started=performance.now();
      try {for(let i=0;i<10;i++)window.renderV39ResourceTop();}
      finally {window.getV39ResourceSnapshot=snapshot;window.getV39GameState=getState;}
      return {syncMs:performance.now()-started,snapshots,states,writes:window.__renderWrites,
        sameButton:original===document.querySelector('#resourceSet button'),sameFocus:document.activeElement===original};
    });
    if(!baseline) {
      assert(header.sameButton&&header.sameFocus,'header keeps buttons and keyboard focus');
      assert.equal(header.snapshots,10,'only one resource snapshot per header update');
      assert.equal(header.states,0,'closed resource header does not copy the world');
      assert.equal(header.writes.resourceSet||0,0,'resource set is not cleared');
    }
    writeFileSync(`${out}/header-${baseline?'before':'after'}-${width}.json`,JSON.stringify(header,null,2));
    console.log(`${width} header: ${JSON.stringify(header)}`);
    if(!baseline) {
      await page.locator('#resourceSet [data-group="food"]').click();
      assert(await page.locator('#resourceDrawer').evaluate(drawer=>drawer.classList.contains('show')),'resource detail opens');
      const stock=await page.evaluate(()=>{
        const button=document.querySelector('#resourceSet [data-group="food"]');
        const faction=window.getV39ActiveFactionState(),base=faction.settlements[0];
        base.foodStockByType.穀物=(base.foodStockByType.穀物||0)+17;
        window.updateV39ActiveFactionState({settlements:faction.settlements.map(row=>row.id===base.id?base:row)},{reason:'header-stock-test'});
        const expected=window.getV39ResourceSnapshot().food.items.reduce((sum,row)=>sum+row.value,0).toLocaleString('ja-JP');
        return {same:button===document.querySelector('#resourceSet [data-group="food"]'),expected,actual:button.querySelector('.value-main').textContent};
      });
      assert(stock.same);assert.equal(stock.actual,stock.expected,'real stock changes update the preserved header');
      await page.locator('#v39-specialty-header').click();
      await page.locator('[data-specialty-tab="specialties"]').click();
      const specialty=await page.evaluate(()=>{
        const button=document.getElementById('v39-specialty-header'),panel=document.getElementById('v39-specialty-panel'),child=panel.firstElementChild;
        for(let i=0;i<5;i++)window.renderV39ResourceTop();
        return {same:button===document.getElementById('v39-specialty-header'),sameContent:child===panel.firstElementChild,
          expanded:button.getAttribute('aria-expanded'),tab:panel.querySelector('[aria-selected="true"]').dataset.specialtyTab};
      });
      assert(specialty.same&&specialty.sameContent,'unchanged specialty drawer preserves DOM');
      assert.equal(specialty.expanded,'true');assert.equal(specialty.tab,'specialties');
      await page.locator('[data-specialty-close]').click();
    }
    if(!baseline) {
      const unrelated=await page.evaluate(async()=>{
        const list=document.getElementById('detailTechniqueList');
        let count=0;
        const observer=new MutationObserver(records=>{count+=records.filter(record=>[...record.addedNodes,...record.removedNodes].some(node=>node.dataset?.expeditionTool)).length;});
        observer.observe(list,{childList:true,subtree:true});
        document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        observer.disconnect();return count;
      });
      assert.equal(unrelated,0,'unrelated document click must not rebuild tool actions');
    }
    const result=await page.evaluate(async()=>{
      const original=document.querySelector('#squadMemberList .squad-card');
      original.focus();
      window.__renderWrites={};window.__textFitWrites=0;
      const started=performance.now();
      for(let i=0;i<10;i++)window.refreshV39SquadDerivedUI();
      const syncMs=performance.now()-started;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      return {syncMs,writes:window.__renderWrites,textFitWrites:window.__textFitWrites,
        sameCard:original===document.querySelector('#squadMemberList .squad-card'),sameFocus:document.activeElement===original};
    });
    if(!baseline) {
      assert(result.sameCard,'unchanged refresh must retain card/focus nodes');
      assert(result.sameFocus,'unchanged refresh must retain keyboard focus');
      for(const id of ['squadSelector','squadMemberList','detailEquipmentList','detailTechniqueRows'])
        assert.equal(result.writes[id]||0,0,`${id}: unchanged refresh must not replace DOM`);
      assert.equal(result.textFitWrites,0,'unchanged labels must not be remeasured');
    }
    await page.evaluate(()=>{
      const player=window.getV39ActivePlayer(),id=window.getV39SelectedSquadUnit().id;
      const units=player.factionState.units.map(unit=>unit.id===id?{...unit,name:'名前変更を反映',hp:Math.max(1,unit.hp-7)}:unit);
      window.updateV39ActiveFactionState({units},{reason:'render-regression'});
    });
    await page.waitForFunction(()=>document.querySelector('#squadMemberList .selected .squad-name')?.textContent==='名前変更を反映');
    const hp=await page.evaluate(()=>({unit:window.getV39SelectedSquadUnit().hp,text:document.querySelector('#squadMemberList .selected .hp .v39-card-vital-value').textContent}));
    assert.equal(Number(hp.text.split('/')[0]),hp.unit,'changed HP is reflected');
    await page.locator('[data-squad-detail-tab="action"]').click();
    assert(await page.locator('#detailTechniqueRows [data-v39-technique-name]').count()>0,'actions remain available');
    await page.evaluate(()=>window.openV39CharacterModal());
    const modal=await page.evaluate(async()=>{
      const body=document.querySelector('#characterModal .modal-body');
      const row=body.querySelector('[data-v39-character-row]');
      const panel=body.querySelector('.v39-char-detail-scroll');
      let mutations=0;
      const observer=new MutationObserver(records=>{mutations+=records.length;});
      observer.observe(body,{childList:true,subtree:true});
      row.focus();
      const start=performance.now();
      for(let i=0;i<10;i++)window.renderV39CharacterModal();
      const syncMs=performance.now()-start;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      observer.disconnect();
      return {syncMs,mutations,sameRow:row===body.querySelector('[data-v39-character-row]'),
        samePanel:panel===body.querySelector('.v39-char-detail-scroll'),sameFocus:document.activeElement===row};
    });
    writeFileSync(`${out}/modal-${baseline?'before':'after'}-${width}.json`,JSON.stringify(modal,null,2));
    console.log(`${width} modal: ${JSON.stringify(modal)}`);
    if(!baseline) {
      assert(modal.sameRow&&modal.samePanel&&modal.sameFocus,'unchanged modal keeps list, panel and focus');
      assert.equal(modal.mutations,0,'unchanged modal does not replace child nodes');
      await page.locator('[data-v39-character-detail-tab="equipment"]').click();
      const draft=await page.evaluate(async()=>{
        const body=document.querySelector('#characterModal .modal-body');
        const id=body.querySelector('.squad-card.selected').dataset.v39CharacterRow;
        const input=body.querySelector('[data-v39-tool-setting-count]');
        const select=body.querySelector('[data-v39-tool-setting-name]');
        if(!input||!select)throw new Error('fixture must have tool slots');
        input.value='7';select.value=select.options[1].value;input.focus();
        const name=select.value;
        const scroller=body.querySelector('.v39-char-detail-scroll');
        scroller.scrollTop=80;const top=scroller.scrollTop;
        const faction=window.getV39ActiveFactionState();
        window.updateV39ActiveFactionState({units:faction.units.map(unit=>unit.id!==id?unit:{...unit,hp:unit.hp-1,
          toolStockByType:{...unit.toolStockByType,[name]:19}})},{reason:'modal-stock-regression'});
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return {id,name,count:body.querySelector('[data-v39-tool-setting-count]').value,
          selected:body.querySelector('[data-v39-tool-setting-name]').value,
          stock:body.querySelector('[data-v39-tool-setting-name] option:checked').textContent,
          focus:document.activeElement===body.querySelector('[data-v39-tool-setting-count]'),
          top,afterTop:body.querySelector('.v39-char-detail-scroll').scrollTop};
      });
      assert.equal(draft.count,'7');assert.equal(draft.selected,draft.name);
      assert(draft.stock.includes('19'),'actual stock updates without losing the unsaved loadout');
      assert(draft.focus);assert.equal(draft.afterTop,draft.top);
      await page.locator('#characterModal [data-v39-tool-setting-count]').first().fill('1');
      await page.evaluate(()=>{
        [...document.querySelectorAll('#characterModal [data-v39-tool-setting-name]')].slice(1).forEach(select=>{select.value='';});
      });
      await page.locator('[data-v39-tool-settings-save]').click();
      assert((await page.locator('#characterModal output').innerText()).includes('保存しました'));
      const savedLoadout=await page.evaluate(id=>window.getV39ActiveFactionState().units.find(u=>u.id===id).defaultToolLoadout,draft.id);
      assert.deepEqual(savedLoadout,[{name:draft.name,count:1}],'save uses the retained draft and actual unit');
      await page.locator('#characterModal [data-v39-tool-setting-count]').first().fill('2');
      await page.locator('[data-v39-character-detail-tab="skills"]').click();
      await page.locator('[data-v39-character-detail-tab="equipment"]').click();
      assert.equal(await page.locator('#characterModal [data-v39-tool-setting-count]').first().inputValue(),'1','tab switch restores saved data, not another draft');
      await page.locator('[data-v39-character-detail-tab="status"]').click();
      const folded=await page.evaluate(async()=>{
        const section=document.querySelector('#characterModal details');section.open=false;
        const f=window.getV39ActiveFactionState(),id=document.querySelector('#characterModal .squad-card.selected').dataset.v39CharacterRow;
        window.updateV39ActiveFactionState({units:f.units.map(u=>u.id===id?{...u,status:{...u.status,攻撃:(u.status.攻撃||0)+2}}:u)},{reason:'modal-stat-regression'});
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return document.querySelector('#characterModal details').open;
      });
      assert.equal(folded,false,'stat changes keep folded sections');
    }
    await page.locator('[data-v39-character-detail-tab="skills"]').click();
    assert(await page.locator('#characterModal .technique-card').count()>0,'modal skills remain available');
    if(!baseline) {
      await page.locator('#characterModal [data-v39-character-skill]').first().click();
      const selectedSkill=await page.evaluate(async()=>{
        const skill=document.querySelector('#characterModal [data-v39-character-skill].is-expanded');
        skill.focus();const name=skill.dataset.v39CharacterSkill;
        const f=window.getV39ActiveFactionState(),id=document.querySelector('#characterModal .squad-card.selected').dataset.v39CharacterRow;
        window.updateV39ActiveFactionState({units:f.units.map(u=>u.id===id?{...u,hp:u.hp-1}:u)},{reason:'modal-skill-focus'});
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return {name,expanded:document.querySelector('#characterModal .is-expanded')?.dataset.v39CharacterSkill,
          focused:document.activeElement.dataset.v39CharacterSkill};
      });
      assert.equal(selectedSkill.expanded,selectedSkill.name);assert.equal(selectedSkill.focused,selectedSkill.name);
    }
    await page.screenshot({path:`${out}/${baseline?'before':'after'}-${width}.png`});
    assert.deepEqual(errors,[]);
    writeFileSync(`${out}/${baseline?'before':'after'}-${width}.json`,JSON.stringify(result,null,2));
    console.log(`${width}: ${JSON.stringify(result)}`);
    await page.close();
  }
} finally {await browser.close();}
