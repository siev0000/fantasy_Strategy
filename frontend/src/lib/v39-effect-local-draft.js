export const V39_EFFECT_DRAFT_PATH = 'config/local/v39-effect-settings.json';
const DIRTY_KEY = 'v39-effect-draft-unsaved';
const CONNECTED_KEY = 'v39-effect-draft-connected';

export function createV39EffectDraftSync({ snapshot, apply, fetch:request, storage, onStatus = () => {}, hasLocalChanges = () => false, delay = 500 }) {
  let revision = null, ready = false, blocked = false, hydrating = false, queued = false;
  let timer = null, saving = null;
  const status = message => onStatus(message);
  const mark = dirty => { try { dirty ? storage.setItem(DIRTY_KEY, '1') : storage.removeItem(DIRTY_KEY); } catch {} };
  const connected = () => { try{return storage.getItem(CONNECTED_KEY)==='1';}catch{return false;} };
  const markConnected = () => { try{storage.setItem(CONNECTED_KEY,'1');}catch{} };
  const isDirty = () => { try { return storage.getItem(DIRTY_KEY) === '1'; } catch { return false; } };
  const api = async options => {
    const response = await request('/api/local/effect-settings', { cache:'no-store', ...options });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('保存APIがありません。ローカルサーバーを再起動してください。');
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || 'JSON保存に失敗しました。'); error.conflict = response.status === 409; throw error; }
    return result;
  };
  const hydrate = payload => {
    if (!payload) return;
    const backup = snapshot();
    hydrating = true;
    try { apply(payload); }
    catch (error) { apply(backup); throw error; }
    finally { hydrating = false; }
  };
  async function flush({ overwrite = false } = {}) {
    clearTimeout(timer);
    if (saving) { queued = true; await saving; return; }
    if (!ready) { status('JSON保存は未接続です。ブラウザ内の設定は保持されています。'); return; }
    if (blocked && !overwrite) return;
    queued = true;
    saving = (async () => {
      try {
        if (overwrite) { revision = (await api()).revision; blocked = false; }
        while (queued && !blocked) {
          queued = false;
          const result = await api({ method:'PUT', headers:{ 'Content-Type':'application/json', 'X-V39-Local-Editor':'1' },
            body:JSON.stringify({ revision, payload:snapshot() }) });
          revision = result.revision;
        }
        if (!queued && !blocked) { mark(false); markConnected(); status(`JSON保存済み: ${V39_EFFECT_DRAFT_PATH}`); }
      } catch (error) {
        mark(true); queued = true;
        if (error.conflict) blocked = true;
        status(`${error.message} ブラウザ内の設定は保持されています。`);
      }
    })();
    try { await saving; } finally { saving = null; }
  }
  function changed() {
    if (hydrating) return;
    mark(true); queued = true;
    if (!ready || blocked) return;
    status('JSON保存待ち…'); clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, delay);
  }
  async function start() {
    try {
      const result = await api(); revision = result.revision; ready = true;
      if (isDirty() || (result.payload && !connected() && hasLocalChanges())) { mark(true); blocked = true; status('ブラウザに未保存の変更があります。「JSONへ保存」か「JSONを読込」で選択してください。'); return; }
      hydrate(result.payload); markConnected();
      if (result.payload) status(`JSON読込済み: ${V39_EFFECT_DRAFT_PATH}`);
      else { changed(); await flush(); }
    } catch (error) { ready = false; status(error.message); }
  }
  async function reload() {
    clearTimeout(timer);
    if (saving) await saving;
    try {
      const result = await api();
      if (!result.payload) { status('保存済みJSONはまだありません。'); return; }
      hydrate(result.payload); revision = result.revision;
      ready = true; blocked = false; queued = false; mark(false); markConnected();
      status(`JSON読込済み: ${V39_EFFECT_DRAFT_PATH}`);
    } catch (error) { status(error.message); }
  }
  return { start, changed, flush, reload, isDirty,
    isReady:() => ready, isBlocked:() => blocked, dispose:() => clearTimeout(timer) };
}
