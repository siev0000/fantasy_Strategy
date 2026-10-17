// Keep the real header in place; the popover top layer escapes the app's stacking context.
const roots=new Set();
let controller=null;
export function installTradeLayout(root) {
  roots.add(root);
  if(controller){controller.observe(root);controller.sync();return;}
  let header=null,previousPopover=null,spacer=null;
  const drawer=document.getElementById('resourceDrawer'),previousDrawerPopover=drawer?.getAttribute('popover')??null;
  const specialty=document.getElementById('v39-specialty-panel'),previousSpecialtyPopover=specialty?.getAttribute('popover')??null;
  const active=()=>[...roots].some(panel=>!panel.hidden);
  function measure() {
    if(!active()||!header)return;
    const container=header.parentElement,rect=container?.getBoundingClientRect();
    if(!rect)return;
    const height=parseFloat(getComputedStyle(container).gridTemplateRows)||header.getBoundingClientRect().height;
    const bottom=Math.max(0,rect.top+height);
    for(const panel of roots)panel.style.setProperty('--v39-trade-top',`${bottom}px`);
    drawer?.style.setProperty('--trade-drawer-top',`${bottom+6}px`);
    specialty?.style.setProperty('--trade-drawer-top',`${bottom+6}px`);
    header.style.setProperty('--trade-header-top',`${rect.top}px`);
    header.style.setProperty('--trade-header-left',`${rect.left}px`);
    header.style.setProperty('--trade-header-width',`${rect.width}px`);
    header.style.setProperty('--trade-header-height',`${height}px`);
    if(spacer){spacer.style.height=`${height}px`;spacer.style.flex=`0 0 ${height}px`;}
  }
  function sync() {
    if(active()) {
      if(!header){
        header=document.querySelector('.topbar');
        if(!header)return;
        previousPopover=header.getAttribute('popover');
        measure();
        if(header.showPopover){
          spacer=document.createElement('div');spacer.className='v39-trade-header-space';spacer.setAttribute('aria-hidden','true');header.before(spacer);
          header.setAttribute('popover','manual');header.classList.add('v39-trade-live-header');header.showPopover();
        }
        observer.observe(header.parentElement);
        observer.observe(header);
      }
      measure();
    } else if(header) {
      if(header.matches(':popover-open'))header.hidePopover();
      header.classList.remove('v39-trade-live-header');
      if(previousPopover===null)header.removeAttribute('popover');else header.setAttribute('popover',previousPopover);
      spacer?.remove();spacer=null;
      for(const key of ['top','left','width','height'])header.style.removeProperty(`--trade-header-${key}`);
      observer.disconnect();header=null;
    }
    syncDrawer();
    syncSpecialty();
  }
  function syncDrawer() {
    if(!drawer?.showPopover)return;
    const show=active()&&drawer.classList.contains('show');
    if(show){if(!drawer.classList.contains('v39-trade-live-drawer'))drawer.classList.add('v39-trade-live-drawer');drawer.setAttribute('popover','manual');if(!drawer.matches(':popover-open'))drawer.showPopover();}
    else {if(drawer.matches(':popover-open'))drawer.hidePopover();if(drawer.classList.contains('v39-trade-live-drawer'))drawer.classList.remove('v39-trade-live-drawer');if(previousDrawerPopover===null)drawer.removeAttribute('popover');else drawer.setAttribute('popover',previousDrawerPopover);}
  }
  function syncSpecialty() {
    if(!specialty?.showPopover)return;
    if(active()&&!specialty.hidden){specialty.classList.add('v39-trade-live-drawer');specialty.setAttribute('popover','manual');if(!specialty.matches(':popover-open'))specialty.showPopover();}
    else {if(specialty.matches(':popover-open'))specialty.hidePopover();specialty.classList.remove('v39-trade-live-drawer');if(previousSpecialtyPopover===null)specialty.removeAttribute('popover');else specialty.setAttribute('popover',previousSpecialtyPopover);}
  }
  const observer=new ResizeObserver(measure);
  const rootObserver=new MutationObserver(sync);
  controller={sync,observe:panel=>rootObserver.observe(panel,{attributes:true,attributeFilter:['hidden']})};
  controller.observe(root);
  if(drawer)new MutationObserver(syncDrawer).observe(drawer,{attributes:true,attributeFilter:['class']});
  if(specialty)new MutationObserver(syncSpecialty).observe(specialty,{attributes:true,attributeFilter:['hidden']});
  for(const panel of [drawer,specialty])if(panel)for(const type of ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','wheel'])panel.addEventListener(type,event=>{if(active())event.stopPropagation();});
  window.addEventListener('keydown',event=>{
    if(!active()||event.key!=='Escape')return;
    const button=drawer?.matches(':popover-open')?drawer.querySelector('#resourceDrawerClose'):specialty?.matches(':popover-open')?specialty.querySelector('[data-specialty-close]'):null;
    if(button){event.preventDefault();event.stopImmediatePropagation();button.click();}
  },true);
  window.addEventListener('resize',measure);
  sync();
}
