const keyOf=node=>node?.id||node?.dataset?.v39TechniqueName||'';
const selectedClass='v39-basic-action-selected';

export function createV39BasicActionNavigation({panel,list,heading,label,onBack=()=>{},onChange=()=>{}}){
  let selectedKey='';
  const children=()=>Array.from(list.children);
  function sync(){
    const selected=selectedKey?children().find(node=>keyOf(node)===selectedKey&&!node.hidden):null;
    if(!selected)selectedKey='';
    panel.dataset.basicAction=selectedKey;
    list.dataset.basicAction=selectedKey;
    for(const node of children())node.classList.toggle(selectedClass,node===selected);
    heading.disabled=!selected;
    heading.setAttribute('aria-label',selected?'行動の選択画面へ戻る':'行動を選択');
    const title=selected?.querySelector('.technique-name,summary')?.textContent?.trim()||'行動';
    label.textContent=selected?`‹ ${title}`:'行動を選択';
    if(selected?.tagName==='DETAILS')selected.open=true;
    return selected;
  }
  function select(node){
    if(!node||node.hidden)return false;
    while(node.parentElement&&node.parentElement!==list)node=node.parentElement;
    if(node.parentElement!==list||!keyOf(node))return false;
    selectedKey=keyOf(node);sync();onChange(selectedKey);
    return true;
  }
  function back(){
    const previous=children().find(node=>keyOf(node)===selectedKey);
    if(previous?.tagName==='DETAILS')previous.open=false;
    selectedKey='';onBack();sync();onChange('');
  }
  heading.addEventListener('click',back);
  panel.addEventListener('click',event=>{
    const target=event.target;
    const action=target.closest?.('[data-v39-technique-name],#detailCarriedFood>summary,details.v39-squad-coordination>summary');
    if(!action||!list.contains(action))return;
    if(action.tagName==='SUMMARY'){event.preventDefault();action.parentElement.open=true;}
    select(action);
  },true);
  sync();
  return {sync,select,back};
}
