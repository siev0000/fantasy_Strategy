const keyOf=node=>node.id||node.dataset.v39TechniqueName||node.dataset.expeditionTool||'';
const selectedClass='v39-basic-action-selected';
const escape=value=>String(value).replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));

function readAction(node,renderIcon){
  if(node.hidden||!keyOf(node))return null;
  const section=node.matches('details')?node:node.querySelector(':scope > details');
  const summary=node.querySelector(':scope > .technique-summary');
  const labeled=node.matches('[data-basic-action-label]')?node:node.querySelector(':scope > [data-basic-action-label]');
  if(node.hasAttribute('data-basic-action-group')&&!node.firstElementChild)return null;
  const title=summary?.querySelector('.v39-expedition-tool-label')||summary?.querySelector('.technique-name');
  const label=(labeled?.dataset.basicActionLabel||title?.textContent
    ||section?.querySelector(':scope > summary')?.textContent||(node.matches('button')?node.textContent:'')).trim();
  if(!label)return null;
  const meta=(labeled?.dataset.basicActionMeta||summary?.querySelector('.technique-ap:not([hidden])')?.textContent||'').trim();
  const assigned=node.hasAttribute('data-basic-action-icon')?renderIcon(label):'';
  const icon=assigned?`<span class="technique-icon">${assigned}</span>`
    : summary?.querySelector('.technique-icon, .v39-expedition-tool-icon:not(:empty)')?.outerHTML||'';
  return {node,section,label,meta,icon,key:keyOf(node)};
}

export function createV39BasicActionNavigation({panel,list,options,heading,renderIcon=()=>'',onBack=()=>{},onChange=()=>{}}){
  let selectedKey='';
  let optionsMarkup='';
  const actions=()=>Array.from(list.children).filter(node=>
    !panel.closest('[data-boarding-pilot]')||node.hasAttribute('data-basic-inspection')).map(node=>readAction(node,renderIcon)).filter(Boolean);
  function sync(){
    const rows=actions();
    const selected=rows.find(row=>row.key===selectedKey);
    if(!selected)selectedKey='';
    panel.dataset.basicAction=selectedKey;
    list.dataset.basicAction=selectedKey;
    for(const node of list.children)node.classList.toggle(selectedClass,node===selected?.node);
    heading.hidden=!selected;
    options.hidden=!!selected;
    if(list.hidden!==!selected)list.hidden=!selected;
    if(selected?.section)selected.section.open=true;
    if(!selected){
      const next=rows.map(({key,label,meta,icon})=>`<button type="button" class="v39-basic-action-option" data-basic-action-option="${escape(key)}">${icon?`<span class="v39-basic-action-option-icon" aria-hidden="true">${icon}</span>`:''}<b>${escape(label)}</b>${meta?`<small>${escape(meta)}</small>`:''}<span aria-hidden="true">›</span></button>`).join('');
      if(next!==optionsMarkup){options.innerHTML=next;optionsMarkup=next;}
    }
    return selected;
  }
  function select(node){
    const action=actions().find(row=>row.node===node);
    if(!action)return false;
    selectedKey=action.key;
    if(action.section)action.section.open=true;
    sync();onChange(selectedKey);
    return true;
  }
  function back(){
    const previousKey=selectedKey;
    const section=actions().find(row=>row.key===previousKey)?.section;
    if(section)section.open=false;
    selectedKey='';onBack();sync();onChange('');
    Array.from(options.children).find(row=>row.dataset.basicActionOption===previousKey)?.focus();
  }
  heading.addEventListener('click',back);
  options.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-basic-action-option]');
    if(!button)return;
    const action=actions().find(row=>row.key===button.dataset.basicActionOption)?.node;
    if(!select(action))return;
    if(action.matches('[data-v39-technique-name],[data-expedition-tool]'))action.click();
    heading.focus();
  });
  sync();
  return {sync,select,back};
}
