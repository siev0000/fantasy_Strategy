function buildAudioPath(folder, filename) {
  return `/assets/audio/${folder}/${encodeURIComponent(filename)}`;
}

const audioAssetMap = {
  bgm: {
    title: buildAudioPath("bgm", "著作権フリーBGM 【たそがれて】ゲーム音楽   オープニングBGM.mp3"),
    field: buildAudioPath("bgm", "古の世界地図.mp3")
  },
  se: {
    confirm: buildAudioPath("se", "se-confirm.mp3"),
    cancel: buildAudioPath("se", "se-cancel.mp3"),
    open: buildAudioPath("se", "se-open.mp3"),
    change: buildAudioPath("se", "se-change.mp3")
  }
};

const AUDIO_STORAGE_KEY = "fantasy_strategy.audio_settings.v1";

class GameAudioController {
  constructor() {
    this.bgmAudio = null;
    this.bgmScene = "title";
    this.bgmRequested = false;
    this.seCache = new Map();
    this.explicitSeCount = 0;
    this.masterVolume = 0.5;
    this.bgmVolume = 0.15;
    this.seVolume = 0.5;
    this.loadVolumeSettings();
  }

  clampVolume(value, fallback) {
    const raw = Number.isFinite(value) ? value : Number(value);
    const safe = Number.isFinite(raw) ? raw : fallback;
    return Math.max(0, Math.min(1, safe));
  }

  applyBgmVolume() {
    if (!this.bgmAudio) return;
    this.bgmAudio.volume = this.masterVolume * this.bgmVolume;
  }

  loadVolumeSettings() {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(AUDIO_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.masterVolume = this.clampVolume(parsed?.masterVolume, this.masterVolume);
      this.bgmVolume = this.clampVolume(parsed?.bgmVolume, this.bgmVolume);
      this.seVolume = this.clampVolume(parsed?.seVolume, this.seVolume);
    } catch {
      // no-op
    }
  }

  saveVolumeSettings() {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({
        masterVolume: this.masterVolume,
        bgmVolume: this.bgmVolume,
        seVolume: this.seVolume
      }));
    } catch {
      // no-op
    }
  }

  ensureBgm() {
    if (this.bgmAudio) return this.bgmAudio;
    const audio = new Audio(audioAssetMap.bgm[this.bgmScene]);
    audio.loop = true;
    audio.preload = "auto";
    this.bgmAudio = audio;
    this.applyBgmVolume();
    return audio;
  }

  async startDefaultBgm() {
    this.bgmRequested = true;
    const audio = this.ensureBgm();
    if (!audio.paused) return true;
    try {
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  setBgmScene(scene) {
    if (scene === this.bgmScene) return;
    this.stopBgm();
    this.bgmAudio = null;
    this.bgmScene = scene;
    if (this.bgmRequested) void this.startDefaultBgm();
  }

  stopBgm() {
    if (!this.bgmAudio) return;
    this.bgmAudio.pause();
    this.bgmAudio.currentTime = 0;
  }

  getSeAudio(key) {
    const src = audioAssetMap.se[key];
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
    const base = this.getSeAudio(key === "select" ? "change" : key);
    if (!base) return;
    if (!fallback) this.explicitSeCount++;
    const volume = this.masterVolume * this.seVolume;
    if (volume <= 0) return;
    try {
      const se = base.cloneNode(true);
      se.volume = volume;
      const played = se.play();
      if (played && typeof played.catch === "function") {
        played.catch(() => {});
      }
    } catch {
      // no-op
    }
  }

  setMasterVolume(value) {
    this.masterVolume = this.clampVolume(value, this.masterVolume);
    this.applyBgmVolume();
    this.saveVolumeSettings();
  }

  setBgmVolume(value) {
    this.bgmVolume = this.clampVolume(value, this.bgmVolume);
    this.applyBgmVolume();
    this.saveVolumeSettings();
  }

  setSeVolume(value) {
    this.seVolume = this.clampVolume(value, this.seVolume);
    this.saveVolumeSettings();
  }

  getVolumeSettings() {
    return {
      masterVolume: this.masterVolume,
      bgmVolume: this.bgmVolume,
      seVolume: this.seVolume
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
  return () => {
    document.removeEventListener("click", onInteraction, true);
    document.removeEventListener("keydown", onInteraction, true);
    for (const timer of timers) window.clearTimeout(timer);
    audio.stopBgm();
  };
}

export {
  audioAssetMap,
  bindGameAudioInteractions,
  getGameAudioController
};
