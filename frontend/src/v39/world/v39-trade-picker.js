import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';

const pickers=new WeakMap();

export function closeV39TradePicker(root){
  const picker=root&&pickers.get(root);
  if(!picker)return;
  picker.overlay.remove();
  picker.background.inert=picker.wasInert;
  pickers.delete(root);
}

export function renderV39TradePicker(root,markup,{background,onClose,onClick,onInput,onChange,updateMarkup=updateV39RetainedMarkup,options={}}){
  let picker=pickers.get(root);
  const previous=picker?.overlay,scroll=previous?.querySelector('.v39-trade-resource-grid')?.scrollTop||0;
  const focused=document.activeElement,filter=focused?.dataset.tradeResourceFilter;
  const searchFocused=focused?.hasAttribute('data-trade-resource-search'),selection=focused?.selectionStart;
  if(!picker){
    const overlay=document.createElement('div');overlay.className='v39-trade-picker-backdrop';
    picker={overlay,background,wasInert:background.inert};pickers.set(root,picker);root.append(overlay);
  }
  picker.background.inert=true;
  const {overlay}=picker;
  updateMarkup(overlay,markup,options);
  const name=overlay.querySelector('[data-trade-picker-name]'),selectedName=name.textContent;
  overlay.onclick=event=>{
    if(event.target===overlay||event.target.closest('[data-trade-picker-close]')){event.stopPropagation();onClose();return;}
    if(onClick){event.stopPropagation();onClick(event);}
  };
  overlay.oninput=onInput||null;
  overlay.onchange=onChange||null;
  const caption=event=>{
    const button=event.target.closest('[data-trade-resource-add]');
    if(button)name.textContent=button.dataset.tradeResourceAdd;
  };
  overlay.onpointerover=caption;overlay.onfocusin=caption;
  const restoreCaption=event=>{
    const button=event.target.closest('[data-trade-resource-add]');
    if(button&&!button.contains(event.relatedTarget))name.textContent=selectedName;
  };
  overlay.onpointerout=restoreCaption;overlay.onfocusout=restoreCaption;
  overlay.onkeydown=event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
    if(event.key!=='Tab')return;
    const nodes=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')],first=nodes[0],last=nodes.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  overlay.querySelector('.v39-trade-resource-grid').scrollTop=scroll;
  const nextFocus=searchFocused?overlay.querySelector('[data-trade-resource-search]'):filter?Array.from(overlay.querySelectorAll('[data-trade-resource-filter]')).find(button=>button.dataset.tradeResourceFilter===filter):overlay.querySelector('[data-trade-picker-close]');
  if(!previous||!overlay.contains(document.activeElement)){nextFocus?.focus();if(searchFocused&&selection!=null)nextFocus?.setSelectionRange(selection,selection);}
  return overlay;
}
