const selector='.squad-card .squad-name';
const tracked=new Set(),pending=new Set();
const fittedRatios=new WeakMap();
let scheduled=false,probe;

function schedule(label){
  if(label)pending.add(label);
  if(scheduled)return;
  scheduled=true;requestAnimationFrame(refresh);
}
function refresh(){
  scheduled=false;
  const labels=[...pending].filter(label=>label.isConnected&&label.getBoundingClientRect().width>0);
  pending.clear();
  for(const label of labels)label.style.setProperty('--v39-name-fit','1');
  if(!labels.length)return;
  if(!probe){
    probe=document.createElement('span');probe.setAttribute('aria-hidden','true');
    probe.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;display:block;white-space:normal;overflow-wrap:anywhere;height:auto;max-height:none;padding:0;border:0;margin:0;';
    document.body.append(probe);
  }
  const entries=labels.map(label=>{
    const style=getComputedStyle(label);
    return {label,width:label.getBoundingClientRect().width,text:label.textContent,
      size:parseFloat(style.fontSize),line:parseFloat(style.lineHeight),
      family:style.fontFamily,weight:style.fontWeight,spacing:style.letterSpacing,
      wordBreak:style.wordBreak,fontStyle:style.fontStyle};
  });
  for(const entry of entries){
    Object.assign(probe.style,{width:`${entry.width}px`,fontFamily:entry.family,fontWeight:entry.weight,
      letterSpacing:entry.spacing,wordBreak:entry.wordBreak,fontStyle:entry.fontStyle});
    probe.textContent=entry.text;
    const fits=ratio=>{
      probe.style.fontSize=`${entry.size*ratio}px`;
      probe.style.lineHeight=`${entry.line*ratio}px`;
      return probe.getBoundingClientRect().height<=entry.line*ratio*2+0.1
        &&probe.scrollWidth<=entry.width+1;
    };
    let ratio=1;
    if(!fits(1)){
      // Measure real wrapping, including Japanese punctuation, rather than character count.
      let low=0,high=1;
      for(let step=0;step<14;step++){
        const middle=(low+high)/2;
        if(fits(middle))low=middle;else high=middle;
      }
      ratio=low;
    }
    entry.label.style.setProperty('--v39-name-fit',String(ratio));
    fittedRatios.set(entry.label,String(ratio));
  }
}
function install(){
  if(!document.body){document.addEventListener('DOMContentLoaded',install,{once:true});return;}
  const resize=new ResizeObserver(entries=>{for(const entry of entries)schedule(entry.target);});
  const styles=new MutationObserver(records=>{
    for(const {target} of records)if(target.style.getPropertyValue('--v39-name-fit')!==fittedRatios.get(target))schedule(target);
  });
  const discover=node=>{
    if(!(node instanceof Element))return;
    const labels=node.matches(selector)?[node]:node.querySelectorAll(selector);
    for(const label of labels)if(!tracked.has(label)){
      tracked.add(label);resize.observe(label);styles.observe(label,{attributes:true,attributeFilter:['style']});schedule(label);
    }
  };
  discover(document.body);
  new MutationObserver(records=>{
    for(const record of records){
      const label=record.target.parentElement?.closest(selector);
      if(record.type==='characterData'&&label)schedule(label);
      if(record.type==='childList'){
        if(record.target instanceof Element&&record.target.matches(selector))schedule(record.target);
        for(const node of record.addedNodes)discover(node);
      }
    }
    let removed=false;
    for(const label of tracked)if(!label.isConnected){tracked.delete(label);pending.delete(label);resize.unobserve(label);removed=true;}
    if(removed){styles.disconnect();for(const label of tracked)styles.observe(label,{attributes:true,attributeFilter:['style']});}
  }).observe(document.body,{childList:true,characterData:true,subtree:true});
  const invalidate=()=>{for(const label of tracked)schedule(label);};
  window.addEventListener('resize',invalidate);
  window.addEventListener('v39:display-settings-changed',invalidate);
  document.fonts?.ready.then(invalidate);
  document.fonts?.addEventListener('loadingdone',invalidate);
}
install();
