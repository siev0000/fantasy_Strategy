function buildAudioPath(folder, filename) {
  return `/assets/audio/${folder}/${encodeURIComponent(filename)}`;
}

const audioAssetMap = {
  bgm: {
    main: buildAudioPath("bgm", "古の世界地図.mp3")
  },
  se: {
    confirm: buildAudioPath("se", "決定ボタンを押す11.mp3"),
    cancel: buildAudioPath("se", "キャンセル9.mp3"),
    open: buildAudioPath("se", "紙を広げる1.mp3"),
    change: buildAudioPath("se", "決定ボタンを押す14 (1).mp3")
  }
};

const AUDIO_STORAGE_KEY = "fantasy_strategy.audio_settings.v1";

class GameAudioController {
  constructor() {
    this.bgmAudio = null;
    this.seCache = new Map();
    this.masterVolume = 0.5;
    this.bgmVolume = 0.3;
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
    const audio = new Audio(audioAssetMap.bgm.main);
    audio.loop = true;
    audio.preload = "auto";
    this.bgmAudio = audio;
    this.applyBgmVolume();
    return audio;
  }

  async startDefaultBgm() {
    const audio = this.ensureBgm();
    if (!audio.paused) return true;
    try {
      await audio.play();
      return true;
    } catch {
      return false;
    }
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

  playSe(key) {
    const base = this.getSeAudio(key);
    if (!base) return;
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

export {
  audioAssetMap,
  getGameAudioController
};
