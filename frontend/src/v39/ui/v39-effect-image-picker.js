import { resolveEffectSheetLayout, resolveEffectFrameRange } from '../../../../配布用/アニメーション再生機能/phaser-effect-player.mjs';
import { getV39EffectImageSource } from '../combat/v39-effect-player.js';

let closePicker;

export function openEffectImagePicker({ catalog, selected, onSelect, returnFocus, sourceFor = getV39EffectImageSource }) {
  closePicker?.();
  const dialog = document.createElement('dialog');
  dialog.className = 'v39-effect-image-modal';
  dialog.setAttribute('aria-label', 'エフェクト画像を選択');
  dialog.style.cssText = 'width:min(760px,96vw);height:min(680px,90dvh);max-width:96vw;max-height:90dvh;padding:8px;border:1px solid #66828b;border-radius:8px;background:#0d171b;color:#edf7f4;box-sizing:border-box;overflow:hidden';
  const style = document.createElement('style');
  style.textContent = '.v39-effect-image-modal::backdrop{background:#000b}.v39-effect-image-modal button,.v39-effect-image-modal input{font:inherit;color:#edf7f4;background:#173039;border:1px solid #536a72;border-radius:5px;padding:5px;box-sizing:border-box}.v39-effect-image-modal button[aria-pressed="true"]{border-color:#ffe28b;background:#345249}.v39-effect-image-modal-grid button[hidden]{display:none!important}.v39-effect-image-modal button:focus-visible{outline:2px solid #78e0ff;outline-offset:-2px}';
  const heading = document.createElement('header');
  heading.style.cssText = 'display:flex;align-items:center;gap:8px;flex:none';
  const title = document.createElement('strong');title.textContent = 'エフェクト画像';title.style.flex = '1';
  const close = document.createElement('button');close.type = 'button';close.textContent = '閉じる';heading.append(title, close);
  const search = document.createElement('input');search.type = 'search';search.placeholder = '名前で検索';search.setAttribute('aria-label','エフェクト画像を検索');search.style.cssText = 'width:100%;flex:none';
  const gallery = document.createElement('div');gallery.className = 'v39-effect-image-modal-grid';
  gallery.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));align-content:start;gap:6px;min-height:0;overflow:auto;overscroll-behavior:contain;flex:1';
  const empty = document.createElement('p');empty.textContent = '該当する画像はありません';empty.hidden = true;
  dialog.append(style, heading, search, gallery, empty);
  let disposed = false, running = 0;
  const queue = [], cards = [];
  const observer = new IntersectionObserver(entries => {
    for(const entry of entries){
      if(!entry.isIntersecting || entry.target.hidden || entry.target.dataset.thumbnail)continue;
      observer.unobserve(entry.target);entry.target.dataset.thumbnail='queued';queue.push(entry.target);
    }
    drain();
  }, { root:gallery });
  function drain() {
    while(!disposed && queue.length && running < 4){
      const button = queue.shift();
      if(button.hidden){delete button.dataset.thumbnail;observer.observe(button);continue;}
      let source;
      try { source = sourceFor(button.dataset.effectImage); } catch { source = null; }
      if(!source?.src){button.dataset.thumbnail = 'error';continue;}
      const image = new Image();running++;
      image.onload = () => {
        running--;
        if(disposed)return;
        const layout = resolveEffectSheetLayout(image.width,image.height);
        const range = resolveEffectFrameRange(layout.frameCount,source);
        const frame = Math.floor((range.start+range.end)/2);
        const canvas = button.querySelector('canvas');
        const scale = Math.min(canvas.width/layout.frameWidth,canvas.height/layout.frameHeight);
        const width = layout.frameWidth*scale,height = layout.frameHeight*scale;
        canvas.getContext('2d')?.drawImage(image,layout.horizontal?frame*layout.frameWidth:0,
          layout.horizontal?0:frame*layout.frameHeight,layout.frameWidth,layout.frameHeight,
          (canvas.width-width)/2,(canvas.height-height)/2,width,height);
        button.dataset.thumbnail = 'ready';drain();
      };
      image.onerror = () => {running--;button.dataset.thumbnail = 'error';drain();};
      image.src = source.src;
    }
  }
  const finish = () => {
    if(disposed)return;
    disposed = true;observer.disconnect();queue.length = 0;
    if(dialog.open)dialog.close();dialog.remove();
    if(closePicker === finish)closePicker = undefined;
    if(returnFocus?.isConnected)returnFocus.focus();
  };
  closePicker = finish;
  for(const name of catalog){
    const button = document.createElement('button');button.type = 'button';button.dataset.effectImage = name;
    button.setAttribute('aria-label',name);button.setAttribute('aria-pressed',String(name === selected));
    button.style.cssText = 'display:flex;flex-direction:column;align-items:center;min-width:0';
    const canvas = document.createElement('canvas');canvas.width = 160;canvas.height = 120;
    canvas.style.cssText = 'width:100%;height:76px;object-fit:contain;background:#091318';
    const label = document.createElement('span');label.textContent = name;label.style.cssText = 'overflow-wrap:anywhere;line-height:1.25;font-size:13px';
    button.append(canvas,label);gallery.append(button);cards.push(button);observer.observe(button);
    button.addEventListener('click',()=>{finish();onSelect(name);});
  }
  search.addEventListener('input',()=>{
    const query = search.value.trim().toLocaleLowerCase();let visible = 0;
    for(const button of cards){
      button.hidden = !button.dataset.effectImage.toLocaleLowerCase().includes(query);
      if(!button.hidden){visible++;if(!button.dataset.thumbnail)observer.observe(button);}
    }
    empty.hidden = visible > 0;
  });
  close.addEventListener('click',finish);
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});
  dialog.addEventListener('close',finish);
  document.body.append(dialog);dialog.showModal();dialog.style.display = 'flex';dialog.style.flexDirection = 'column';dialog.style.gap = '8px';search.focus();
  return finish;
}

export function installEffectImagePicker() {
  const select = document.getElementById('v39-effect-setting-base');
  if(!select || select.dataset.imagePickerInstalled)return;
  select.dataset.imagePickerInstalled = 'true';
  const button = document.createElement('button');button.type = 'button';button.textContent = '画像一覧';
  button.addEventListener('click',()=>openEffectImagePicker({catalog:Array.from(select.options,option=>option.value),selected:select.value,returnFocus:button,
    onSelect:name=>{select.value=name;select.dispatchEvent(new Event('change',{bubbles:true}));}}));
  select.closest('.v39-effect-setting-row').append(button);
}
