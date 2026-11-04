import { resolveV39EffectSequence, V39_EFFECT_SEQUENCE_LIMIT, V39_EFFECT_STEP_OFFSET_LIMIT } from '../../lib/v39-effect-sequence.js';

export function renderV39EffectSequenceEditor(host, setting, catalog, onChange, options = {}) {
  if (!host) return;
  host.replaceChildren();
  const steps = resolveV39EffectSequence({ ...setting, decorationEffect:'' });
  const active = Math.max(-1, Math.min(steps.length - 1, options.activeIndex ?? -1));
  const tabs = options.tabsHost || host;
  if (tabs !== host) tabs.replaceChildren();
  const button = (text, action, disabled = false) => {
    const node = document.createElement('button');
    node.type = 'button'; node.textContent = text; node.disabled = disabled;
    node.addEventListener('click', action); return node;
  };
  const tab = (text, index, title) => {
    const node = button(text, () => options.onSelect?.(index));
    node.setAttribute('role', 'tab'); node.setAttribute('aria-selected', String(active === index));
    node.setAttribute('aria-label', title); node.title = title; tabs.append(node);
  };
  tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-orientation', 'vertical'); tabs.setAttribute('aria-label', 'アニメーションと共通設定');
  tab('共通', -1, '共通設定');
  steps.forEach((step, index) => tab(String(index + 1), index, `${index + 1}. ${step.effectName}`));
  tabs.append(button('＋', () => onChange([...steps, { effectName:steps.at(-1).effectName }], steps.length), steps.length >= V39_EFFECT_SEQUENCE_LIMIT));
  if (active < 0) return;
  const step = steps[active];
  const row = document.createElement('fieldset');
  row.style.cssText = 'min-width:0;margin:4px 0;padding:4px;border:1px solid #536a72;border-radius:5px';
  const legend = document.createElement('legend'); legend.textContent = `${active + 1}. ${step.effectName}`; row.append(legend);
  const select = document.createElement('select'); select.style.width = '100%'; select.setAttribute('aria-label', `${active + 1}番目のアニメーション`);
  for (const name of catalog) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }
  select.value = step.effectName;
  select.addEventListener('change', () => { step.effectName = select.value; onChange(steps, active); }); row.append(select);
  const controls = document.createElement('div'); controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:4px 0';
  const move = delta => { [steps[active], steps[active + delta]] = [steps[active + delta], steps[active]]; onChange(steps, active + delta); };
  controls.append(button('前へ', () => move(-1), active === 0), button('後へ', () => move(1), active === steps.length - 1),
    button('削除', () => { steps.splice(active, 1); onChange(steps, Math.min(active, steps.length - 1)); }, steps.length === 1)); row.append(controls);
  controls.append(button('画像一覧',()=>options.onPickImage?.(active,step.effectName,name=>{step.effectName=name;onChange(steps,active);})));

  for(const [key,title] of [['flipX','左右反転'],['flipY','上下反転']]){
    const toggle=button(step[key]?title+' ON':title,()=>{step[key]=!step[key];onChange(steps,active);});
    toggle.setAttribute('aria-pressed',String(step[key]));toggle.style.borderColor=step[key]?'#ffe28b':'';controls.append(toggle);
  }
  const fields = document.createElement('div'); fields.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px';
  for (const [key, title, min, max] of [['scalePercent','倍率 (%)',10,400],['rotationDeg','角度補正 (°)',-180,180],['offsetX','位置X (px)',-V39_EFFECT_STEP_OFFSET_LIMIT,V39_EFFECT_STEP_OFFSET_LIMIT],['offsetY','位置Y (px)',-V39_EFFECT_STEP_OFFSET_LIMIT,V39_EFFECT_STEP_OFFSET_LIMIT],['scaleXPercent','横倍率 (%)',10,400],['scaleYPercent','縦倍率 (%)',10,400],['impactXPercent','着弾点X (%)',0,100],['impactYPercent','着弾点Y (%)',0,100]]) {
    const label = document.createElement('label'); label.textContent = title;
    const input = document.createElement('input'); input.type = 'number'; input.min = min; input.max = max; input.step = 1; input.value = step[key]; input.style.cssText = 'width:100%;box-sizing:border-box';
    input.setAttribute('aria-label', `${active + 1}番目 ${title}`);
    input.addEventListener('input', () => {
      if(input.value.trim()===''||!Number.isFinite(Number(input.value)))return;
      step[key]=Number(input.value);onChange(steps,active,{live:true});
    });
    input.addEventListener('change', () => { step[key] = Number(input.value); onChange(steps, active); }); label.append(input); fields.append(label);
  }
  row.append(fields);
  const impactControls=document.createElement('div');impactControls.style.cssText='display:flex;gap:4px;margin:4px 0';
  impactControls.append(button('着弾点をタップ指定',()=>options.onPickImpact?.(active)),
    button('着弾点を中央へ',()=>{step.impactXPercent=50;step.impactYPercent=50;onChange(steps,active);}));
  row.append(impactControls);
  const modes=document.createElement('div');modes.style.cssText='display:flex;gap:4px;margin:4px 0';
  for(const [title,editing] of [['基準点編集',true],['着弾確認',false]]){
    const node=button(title,()=>options.onSetImpactPreview?.(editing));
    node.setAttribute('aria-pressed',String(Boolean(options.impactEditing)===editing));modes.append(node);
  }
  row.append(modes);
  const hint=document.createElement('p');hint.className='v39-effect-settings-note';
  hint.textContent='角度は画像の向きだけを変更。位置X＋は画面の右、位置Y＋は画面の下へ移動します。横・縦倍率は回転後の画面方向に適用します。着弾点は左上0%、中央50%、右下100%。編集と確認は同じ画像位置・同じコマです。黄色の破線枠内が設定可能範囲です。十字を動かして離すと画像位置も更新します。切替で位置は変えません。';
  row.append(hint);host.append(row);
}