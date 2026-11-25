import audioFiles from "../../../config/v39-audio-catalog.json";

function buildAudioPath(folder, filename) {
  return `${import.meta.env?.BASE_URL || "/"}assets/audio/${folder}/${filename.split("/").map(encodeURIComponent).join("/")}`;
}

const defaultSounds = {
  bgm: {
    title: "著作権フリーBGM 【たそがれて】ゲーム音楽   オープニングBGM.mp3",
    field: "古の世界地図.mp3"
  },
  se: {
    confirm: "se-confirm.mp3",
    cancel: "se-cancel.mp3",
    open: "se-open.mp3",
    change: "se-change.mp3",
    namedWeapon: "se-confirm.mp3"
  }
};

const seLabels = {"se-confirm.mp3":"決定音","se-cancel.mp3":"戻る音","se-open.mp3":"開く音","se-change.mp3":"切り替え音"};
const audioCatalog = Object.fromEntries(Object.entries(audioFiles).map(([kind, files]) => [
  kind, files.map(id => ({
    id, src:buildAudioPath(kind,id),
    label:seLabels[id] ?? id.match(/【(.+?)】/)?.[1] ?? id.replace(/\.mp3$/i,"")
  }))
]));
const soundUrls = Object.fromEntries(Object.entries(audioCatalog).map(([kind, files]) => [
  kind, new Map(files.map(file => [file.id,file.src]))
]));
const audioAssetMap = Object.fromEntries(Object.entries(defaultSounds).map(([kind, entries]) => [
  kind, Object.fromEntries(Object.entries(entries).map(([key,id]) => [key,soundUrls[kind].get(id)]))
]));

const AUDIO_STORAGE_KEY = "fantasy_strategy.audio_settings.v1";

class GameAudioController {
  constructor() {
    this.bgmAudio = null;
    this.bgmScene = "title";
    this.bgmRequested = false;
    this.preview = null;
    this.seCache = new Map();
    this.activeSe = new Set();
    this.explicitSeCount = 0;
    this.sounds = {bgm:{...defaultSounds.bgm},se:{...defaultSounds.se}};
    this.masterVolume = 0.5;
    this.bgmVolume = 0.15;
    this.seVolume = 0.5;
    this.muted = false;
    this.loadVolumeSettings();
  }

  clampVolume(value, fallback) {
    const raw = Number.isFinite(value) ? value : Number(value);
    const safe = Number.isFinite(raw) ? raw : fallback;
    return Math.max(0, Math.min(1, safe));
  }

  applyAudioVolumes() {
    if (this.bgmAudio) {
      this.bgmAudio.volume = this.masterVolume * this.bgmVolume;
      this.bgmAudio.muted = this.muted;
    }
    if (this.preview) {
      this.preview.audio.volume = this.masterVolume * (this.preview.kind === "bgm" ? this.bgmVolume : this.seVolume);
      this.preview.audio.muted = this.muted;
    }
  }

  loadVolumeSettings() {
    try {
      const raw = globalThis.window?.localStorage?.getItem(AUDIO_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.masterVolume = this.clampVolume(parsed?.masterVolume, this.masterVolume);
      this.bgmVolume = this.clampVolume(parsed?.bgmVolume, this.bgmVolume);
      this.seVolume = this.clampVolume(parsed?.seVolume, this.seVolume);
      this.muted = parsed?.muted === true;
      for (const [kind, entries] of Object.entries(this.sounds)) {
        for (const key of Object.keys(entries)) {
          const id = parsed?.sounds?.[kind]?.[key];
          if (id === "" || soundUrls[kind].has(id)) entries[key] = id;
        }
      }
    } catch {
      // no-op
    }
  }

  saveVolumeSettings() {
    try {
      globalThis.window?.localStorage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify({
        masterVolume: this.masterVolume,
        bgmVolume: this.bgmVolume,
        seVolume: this.seVolume,
        muted: this.muted,
        sounds: this.sounds
      }));
    } catch {
      // no-op
    }
  }

  ensureBgm() {
    if (this.bgmAudio) return this.bgmAudio;
    const src = soundUrls.bgm.get(this.sounds.bgm[this.bgmScene]);
    if (!src) return null;
    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = "auto";
    this.bgmAudio = audio;
    this.applyAudioVolumes();
    return audio;
  }

  async startDefaultBgm() {
    this.bgmRequested = true;
    if (this.preview?.kind === "bgm") return false;
    const audio = this.ensureBgm();
    if (!audio) return false;
    if (!audio.paused) return true;
    try {
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  setBgmScene(scene) {
    if (scene === this.bgmScene || !Object.hasOwn(this.sounds.bgm,scene)) return;
    this.bgmScene = scene;
    this.refreshBgm();
  }

  refreshBgm() {
    this.stopBgm();
    this.bgmAudio = null;
    if (this.bgmRequested) void this.startDefaultBgm();
  }

  stopBgm() {
    if (!this.bgmAudio) return;
    this.bgmAudio.pause();
    this.bgmAudio.currentTime = 0;
  }

  getSeAudio(key) {
    const src = soundUrls.se.get(this.sounds.se[key]);
    if (!src) return null;
    let base = this.seCache.get(src);
    if (!base) {
      base = new Audio(src);
      base.preload = "auto";
      base.volume = this.masterVolume * this.seVolume;
      this.seCache.set(src, base);
    }
    return base;
  }

  playSe(key, {fallback = false} = {}) {
    const sound = key === "select" ? "change" : key;
    if (!Object.hasOwn(this.sounds.se,sound)) return;
    if (!fallback) this.explicitSeCount++;
    const volume = this.masterVolume * this.seVolume;
    if (this.muted || volume <= 0) return;
    const base = this.getSeAudio(sound);
    if (!base) return;
    const se = base.cloneNode(true);
    const release = () => {
      this.activeSe.delete(se);
      se.removeEventListener("ended", release);
      se.removeEventListener("error", release);
    };
    se.volume = volume;
    se.addEventListener("ended", release);
    se.addEventListener("error", release);
    this.activeSe.add(se);
    try {
      Promise.resolve(se.play()).catch(release);
    } catch {
      release();
    }
  }

  getSoundSelection(kind,key) {
    return this.sounds[kind]?.[key] ?? "";
  }

  setSoundSelection(kind,key,id) {
    if (!Object.hasOwn(this.sounds,kind) || !Object.hasOwn(this.sounds[kind],key)
      || id !== "" && !soundUrls[kind].has(id) || this.sounds[kind][key] === id) return;
    this.sounds[kind][key] = id;
    this.saveVolumeSettings();
    if (kind === "bgm" && key === this.bgmScene) this.refreshBgm();
  }

  async previewSound(kind,id) {
    const src = soundUrls[kind]?.get(id);
    if (this.muted || !src) return false;
    this.stopPreview({resumeBgm:kind !== "bgm"});
    if (kind === "bgm") this.bgmAudio?.pause();
    const audio = new Audio(src);
    const preview = {kind,audio};
    this.preview = preview;
    this.applyAudioVolumes();
    const finish = () => {
      if (this.preview === preview) this.stopPreview();
    };
    audio.addEventListener("ended",finish,{once:true});
    audio.addEventListener("error",finish,{once:true});
    try {
      await audio.play();
      return true;
    } catch {
      finish();
      return false;
    }
  }

  stopPreview({resumeBgm = true} = {}) {
    const preview = this.preview;
    if (!preview) return;
    this.preview = null;
    preview.audio.pause();
    if (resumeBgm && preview.kind === "bgm" && this.bgmRequested) void this.startDefaultBgm();
  }

  setMasterVolume(value) {
    this.masterVolume = this.clampVolume(value, this.masterVolume);
    this.applyAudioVolumes();
    this.saveVolumeSettings();
  }

  setBgmVolume(value) {
    this.bgmVolume = this.clampVolume(value, this.bgmVolume);
    this.applyAudioVolumes();
    this.saveVolumeSettings();
  }

  setSeVolume(value) {
    this.seVolume = this.clampVolume(value, this.seVolume);
    this.applyAudioVolumes();
    this.saveVolumeSettings();
  }

  setMuted(value) {
    this.muted = value === true;
    this.applyAudioVolumes();
    for (const se of this.activeSe) se.muted = this.muted;
    this.saveVolumeSettings();
  }

  getVolumeSettings() {
    return {
      masterVolume: this.masterVolume,
      bgmVolume: this.bgmVolume,
      seVolume: this.seVolume,
      muted: this.muted
    };
  }
}

let sharedController = null;

function getGameAudioController() {
  if (!sharedController) {
    sharedController = new GameAudioController();
  }
  return sharedController;
}

function getButtonSound(button) {
  const assigned = button.dataset.audioSe;
  if (assigned === "off") return null;
  if (Object.hasOwn(audioAssetMap.se, assigned)) return assigned;
  const label = (button.getAttribute("aria-label") || button.textContent).trim();
  const action = button.dataset.v39ItemListAction;
  if (button.matches(".close,[data-close],[data-summon-close]") ||
      /^(戻る|閉じる|キャンセル|取り消す|一覧に戻る|[×✕]$)/.test(label) ||
      ["back", "close", "cancel"].includes(action)) return "cancel";
  if (button.hasAttribute("aria-haspopup") || action === "open" || /(?:を開く|を見る)$/.test(label)) return "open";
  if (button.matches('[role="tab"],[aria-pressed]') || /切り替え/.test(label)) return "change";
  return "confirm";
}

function bindGameAudioInteractions() {
  const audio = getGameAudioController();
  const timers = new Set();
  const playTitle = () => audio.setBgmScene("title");
  const playField = () => audio.setBgmScene("field");
  const playTestField = () => {
    if (audio.bgmScene === "field" || !window.isV39TestMode?.()
      || document.getElementById("v39-play-mode-select")?.classList.contains("open")) return;
    const faction = window.getV39ActiveFactionState?.();
    const placed = faction?.settlements?.some(base => base.placed) || faction?.village?.placed;
    const deployed = faction?.units?.some(unit => Number.isInteger(unit.x) && unit.x >= 0
      && Number.isInteger(unit.y) && unit.y >= 0);
    if (placed || deployed) playField();
  };
  const sceneEvents = [
    ["v39:play-mode-opened",playTitle],
    ["v39:play-mode-closed",playTestField],
    ["v39:initial-placement-complete",playField],
    ["v39:multiplayer-game-started",playField],
    ["v39:save-loaded",playField],
    ["v39:game-state-changed",playTestField]
  ];
  const onInteraction = event => {
    if (!event.isTrusted) return;
    void audio.startDefaultBgm();
    if (event.type !== "click") return;
    const button = event.target?.closest?.('button, [role="button"], [role="tab"]');
    if (!button || button.matches(":disabled") || button.closest('[aria-disabled="true"], [inert]')) return;
    const sound = getButtonSound(button);
    if (!sound) return;
    const explicitSeCount = audio.explicitSeCount;
    // Give existing action handlers time to play their own sound.
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      if (audio.explicitSeCount === explicitSeCount) audio.playSe(sound, {fallback:true});
    }, 0);
    timers.add(timer);
  };
  document.addEventListener("click", onInteraction, true);
  document.addEventListener("keydown", onInteraction, true);
  for (const [event,handler] of sceneEvents) window.addEventListener(event,handler);
  playTestField();
  return () => {
    document.removeEventListener("click", onInteraction, true);
    document.removeEventListener("keydown", onInteraction, true);
    for (const [event,handler] of sceneEvents) window.removeEventListener(event,handler);
    for (const timer of timers) window.clearTimeout(timer);
    audio.stopPreview({resumeBgm:false});
    audio.stopBgm();
  };
}

export {
  audioAssetMap,
  audioCatalog,
  bindGameAudioInteractions,
  getGameAudioController
};
