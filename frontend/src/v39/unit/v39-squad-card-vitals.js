// Card markup and gauges belong to v39-unit-card.js. Only width-dependent text fitting lives here.
const measured = new WeakMap();
let scheduled = false;
let fontVersion = 0;

function refresh() {
  const pending = [];
  for (const label of document.querySelectorAll('#squadMemberList .squad-name, #squadMemberList .squad-pos, #characterModal .squad-name, #characterModal .squad-pos')) {
    const width = label.clientWidth;
    if (!width) continue;
    const text = label.textContent;
    const old = measured.get(label);
    if (old?.width === width && old.text === text && old.fontVersion === fontVersion) continue;
    pending.push({label, width, text});
  }
  // Batch writes and measurements instead of forcing a layout twice for every label.
  for (const {label} of pending) label.style.setProperty('--v39-text-fit', '1');
  for (const entry of pending) entry.ratio = Math.min(1, entry.width / Math.max(1, entry.label.scrollWidth));
  for (const {label, width, text, ratio} of pending) {
    label.style.setProperty('--v39-text-fit', String(ratio));
    measured.set(label, {width, text, fontVersion});
  }
}

function scheduleRefresh() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; refresh(); });
}

function install() {
  const list = document.getElementById('squadMemberList');
  if (!(list instanceof HTMLElement)) { window.setTimeout(install, 50); return; }
  const observer = new MutationObserver(scheduleRefresh);
  const resize = new ResizeObserver(scheduleRefresh);
  for (const host of [list, document.querySelector('#characterModal .modal-body')].filter(Boolean)) {
    observer.observe(host, {childList:true, subtree:true});
    resize.observe(host);
  }
  const invalidateFonts = () => { fontVersion++; scheduleRefresh(); };
  window.addEventListener('v39:display-settings-changed', invalidateFonts);
  // Crossing the desktop/mobile breakpoint can change font metrics even at the same card width.
  window.addEventListener('resize', invalidateFonts);
  document.fonts?.ready.then(invalidateFonts);
  document.fonts?.addEventListener('loadingdone', invalidateFonts);
  window.refreshV39SquadCardVitals = scheduleRefresh;
  scheduleRefresh();
}

install();
