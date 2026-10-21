// Keep identity tied to the actual item/field, not its current list position.
function nodeKey(node) {
  if(node.nodeType!==1)return '';
  return [node.tagName,node.id,...[...node.attributes].filter(attr=>attr.name.startsWith('data-')).map(attr=>`${attr.name}=${attr.value}`),node.getAttribute('type')||''].join('|');
}
export function updateV39RetainedMarkup(host,markup,{preserveInput=false,preserveValue=()=>false,preserveDetails=()=>true}={}) {
  if(preserveInput&&host.__v39RetainedMarkup===markup)return;
  const template=document.createElement('template');template.innerHTML=markup;
  const patch=(parent,next)=>{
    let cursor=parent.firstChild;
    for(const source of [...next.childNodes]){
      const key=nodeKey(source);
      let current=cursor;
      if(key)while(current&&(current.nodeType!==1||nodeKey(current)!==key))current=current.nextSibling;
      else if(current&&(current.nodeType!==source.nodeType||current.nodeName!==source.nodeName))current=null;
      if(!current){parent.insertBefore(source.cloneNode(true),cursor);continue;}
      if(current!==cursor)parent.insertBefore(current,cursor);
      if(source.nodeType===1){
        const expanded=current.tagName==='DETAILS'&&preserveDetails(current)?current.open:null;
        const editing=preserveInput&&(current===document.activeElement||preserveValue(current));
        for(const attr of [...current.attributes])if(!source.hasAttribute(attr.name)&&!(editing&&attr.name==='value'))current.removeAttribute(attr.name);
        for(const attr of source.attributes)if(!(editing&&attr.name==='value')&&current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
        patch(current,source);
        if(expanded!==null)current.open=expanded;
        if((current.tagName==='INPUT'||current.tagName==='SELECT')&&!editing&&current.value!==source.value)current.value=source.value;
        if(current.tagName==='INPUT'&&!editing&&['checkbox','radio'].includes(current.type)&&current.checked!==source.checked)current.checked=source.checked;
      }else if(current.nodeValue!==source.nodeValue)current.nodeValue=source.nodeValue;
      cursor=current.nextSibling;
    }
    while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
  };
  patch(host,template.content);host.__v39RetainedMarkup=markup;
}
