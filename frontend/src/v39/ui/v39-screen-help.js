import './v39-screen-help.css';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));

export function renderV39ScreenHelp(title, entries){
  return renderV39ScreenHelpContent(title, `<dl>${entries.map(([label,description])=>
    `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(description)}</dd></div>`).join('')}</dl>`);
}

export function renderV39ScreenHelpContent(title, content, {inline=false}={}){
  const label=escapeHtml(title);
  return `<div class="v39-screen-help${inline?' v39-screen-help-inline':''}">
    <button type="button" class="v39-screen-help-trigger" aria-label="${label}の案内" aria-expanded="false">?</button>
    <div class="v39-screen-help-content" popover="auto" role="region" aria-label="${label}の案内" tabindex="0"><strong>${label}</strong>${content}</div>
  </div>`;
}

function positionHelp(button, panel){
  const anchor=button.getBoundingClientRect();
  const {clientWidth:width,clientHeight:height}=document.documentElement;
  const gap=8;
  if(!anchor.width||anchor.bottom<=0||anchor.top>=height){panel.hidePopover();return;}
  const above=Math.max(0,anchor.top-gap*2);
  const below=Math.max(0,height-anchor.bottom-gap*2);
  const openAbove=panel.scrollHeight>below&&above>below;
  panel.style.maxHeight=`${Math.min(height*0.5,openAbove?above:below)}px`;
  const left=Math.max(gap,Math.min(anchor.right-panel.offsetWidth,width-panel.offsetWidth-gap));
  panel.style.left=`${left}px`;
  panel.style.top=`${openAbove?anchor.top-panel.offsetHeight-gap:anchor.bottom+gap}px`;
}

if(typeof document!=='undefined'){
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('.v39-screen-help-trigger');
    if(!button)return;
    event.stopPropagation();
    const panel=button.nextElementSibling;
    if(panel.matches(':popover-open')){panel.hidePopover();return;}
    panel.showPopover({source:button});
    positionHelp(button,panel);
  },true);
  document.addEventListener('beforetoggle',event=>{
    const panel=event.target;
    if(!panel.matches?.('.v39-screen-help-content'))return;
    panel.previousElementSibling?.setAttribute('aria-expanded',String(event.newState==='open'));
  },true);
  const openHelp=()=>document.querySelector('.v39-screen-help-content:popover-open');
  const reposition=()=>{
    const panel=openHelp();
    if(panel)positionHelp(panel.previousElementSibling,panel);
  };
  window.addEventListener('resize',reposition);
  document.addEventListener('scroll',reposition,true);
  window.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const panel=openHelp();
    if(!panel)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const button=panel.previousElementSibling;
    panel.hidePopover();
    button.focus({preventScroll:true});
  },true);
}
