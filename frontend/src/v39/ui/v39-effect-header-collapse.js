const STORAGE_KEY = 'v39-effect-preview-header-collapsed';

export function installV39EffectHeaderCollapse({ panel, toggle, storage, compact = false, onChange = () => {} }) {
  let collapsed = compact;
  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (saved === 'true' || saved === 'false') collapsed = saved === 'true';
  } catch {}
  const update = () => {
    panel.classList.toggle('is-preview-header-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.textContent = collapsed ? '条件 ▾' : '条件 ▴';
    toggle.title = collapsed ? '距離・範囲などの条件設定を下部に開く' : '下部の条件設定を折りたたむ';
  };
  update();
  toggle.addEventListener('click', () => {
    collapsed = !collapsed; update();
    try { storage.setItem(STORAGE_KEY, String(collapsed)); } catch {}
    onChange(collapsed);
  });
  return { isCollapsed:() => collapsed };
}
