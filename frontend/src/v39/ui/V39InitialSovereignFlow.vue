<script setup>
import { ref } from "vue";
import RaceSelectModal from "../../components/RaceSelectModal.vue";
import ClassSelectModal from "../../components/ClassSelectModal.vue";
import CharacterNameModal from "../../components/CharacterNameModal.vue";
import { applyV39InitialSovereignProfile } from "../core/v39-initial-sovereign.js";

const selectedRace = ref("");
const selectedClass = ref("");
const selectedCharacterName = ref("主人公");
const selectedVillageName = ref("はじまりの村");
const visibleStep = ref("");
const setupTarget = ref(null);

function openSetup(detail = {}) {
  const playerId = String(detail?.playerId || "player-1").trim();
  if (!playerId) return false;
  setupTarget.value = {
    playerId,
    playMode:String(detail?.playMode || "single-normal"),
    beforeMap:detail?.beforeMap === true,
    multiplayerRaceOnly:detail?.multiplayerRaceOnly === true,
    multiplayerProfile:detail?.multiplayerProfile === true
  };
  selectedRace.value = String(detail?.race || "").trim();
  selectedClass.value = "";
  selectedCharacterName.value = "主人公";
  selectedVillageName.value = "はじまりの村";
  visibleStep.value = detail?.skipRace === true ? "class" : "race";
  return true;
}

function closeAll() {
  visibleStep.value = "";
  setupTarget.value = null;
}

function closeRace() {
  const target = setupTarget.value;
  closeAll();
  if (target?.multiplayerRaceOnly) {
    window.dispatchEvent(new CustomEvent("v39:multiplayer-race-selection-cancelled"));
    return;
  }
  if (target?.beforeMap) window.openV39PlayModeSelection?.();
}

function backToRace() {
  if (setupTarget.value?.multiplayerProfile) return;
  visibleStep.value = "race";
}

function backToClass() {
  visibleStep.value = "class";
}

function confirmRace(race) {
  selectedRace.value = String(race || "").trim();
  if (!selectedRace.value) return;
  if (setupTarget.value?.multiplayerRaceOnly) {
    const playerId = setupTarget.value.playerId;
    closeAll();
    window.dispatchEvent(new CustomEvent("v39:multiplayer-race-selected", {
      detail:{ playerId, raceKey:selectedRace.value }
    }));
    return;
  }
  visibleStep.value = "class";
}

function confirmClass(payload) {
  selectedClass.value = String(payload?.className || "").trim();
  if (!selectedClass.value) return;
  visibleStep.value = "name";
}

function applyProfileToCurrentState(profile) {
  const state = window.getV39GameState?.();
  const playerId = String(profile?.playerId || "").trim();
  const players = Array.isArray(state?.players) ? state.players : [];
  if (!state || !playerId || !players.some(player => String(player?.id || "") === playerId)) {
    return { ok:false, reason:"開始勢力が準備されていません。" };
  }
  const stateWithRace = {
    ...state,
    players:players.map(player => String(player?.id || "") === playerId
      ? { ...player, race:profile.race }
      : player)
  };
  const result = applyV39InitialSovereignProfile(stateWithRace, profile);
  if (result.ok) {
    window.setV39GameState?.(result.state, { reason:"initial-sovereign-vue" });
    window.setV39ActivePlayer?.(playerId);
  }
  return result;
}

function confirmName(payload) {
  const target = setupTarget.value;
  const characterName = String(payload?.characterName || "").trim().slice(0, 20);
  const villageName = String(payload?.villageName || "").trim().slice(0, 20);
  if (!target || !selectedRace.value || !selectedClass.value || !characterName || !villageName) return;

  const profile = {
    playerId:target.playerId,
    race:selectedRace.value,
    className:selectedClass.value,
    characterName,
    villageName
  };

  if (target.beforeMap) {
    window.__v39PendingInitialSovereignProfile = profile;
    closeAll();
    window.dispatchEvent(new CustomEvent("v39:pre-map-sovereign-profile-ready", { detail:{ profile } }));
    window.openFieldSettingsModal?.({ playMode:target.playMode });
    return;
  }

  if (target.multiplayerProfile) {
    closeAll();
    window.dispatchEvent(new CustomEvent("v39:multiplayer-sovereign-profile-submitted", { detail:profile }));
    return;
  }

  const result = applyProfileToCurrentState(profile);
  if (!result.ok) {
    window.dispatchEvent(new CustomEvent("v39:initial-sovereign-profile-error", { detail:{ reason:result.reason || "統治者を作成できませんでした。" } }));
    return;
  }
  closeAll();
  window.dispatchEvent(new CustomEvent("v39:initial-sovereign-profile-ready", { detail:{ profile, state:result.state } }));
  window.setTimeout(() => window.beginV39InitialPlacement?.({ force:true }), 0);
}

function consumePendingProfile() {
  const profile = window.__v39PendingInitialSovereignProfile;
  if (!profile || typeof profile !== "object") return { ok:false, reason:"開始プロフィール未選択" };
  const result = applyProfileToCurrentState(profile);
  if (result.ok) delete window.__v39PendingInitialSovereignProfile;
  return result;
}

window.openV39PreMapSovereignSetup = detail => openSetup({ ...detail, beforeMap:true });
window.consumeV39PendingInitialSovereignProfile = consumePendingProfile;
window.addEventListener("v39:initial-sovereign-required", event => {
  if (window.getV39PlayMode?.() === "multiplayer" || window.isV39MultiplayerSetup?.() === true) return;
  openSetup({ ...event?.detail, beforeMap:false });
});
window.addEventListener("v39:multiplayer-race-select-request", event => {
  openSetup({ ...event?.detail, multiplayerRaceOnly:true });
});
window.addEventListener("v39:multiplayer-sovereign-required", event => {
  const race = String(event?.detail?.race || "").trim();
  if (!race) return;
  openSetup({ ...event?.detail, race, skipRace:true, multiplayerProfile:true });
});
</script>

<template>
  <race-select-modal
    :show="visibleStep === 'race'"
    :selected-race="selectedRace"
    :setup-progress-text="setupTarget?.beforeMap ? 'ゲーム開始前: 種族を選択' : '統治者作成: 種族を選択'"
    @close="closeRace"
    @confirm="confirmRace"
  />
  <class-select-modal
    :show="visibleStep === 'class'"
    :selected-race="selectedRace"
    :selected-class="selectedClass"
    :setup-progress-text="setupTarget?.beforeMap ? 'ゲーム開始前: クラスを選択' : '統治者作成: クラスを選択'"
    @close="backToRace"
    @back="backToRace"
    @confirm="confirmClass"
  />
  <character-name-modal
    :show="visibleStep === 'name'"
    :selected-name="selectedCharacterName"
    :selected-village-name="selectedVillageName"
    :setup-progress-text="setupTarget?.beforeMap ? 'ゲーム開始前: 統治者と村の名前を設定' : '統治者と村の名前を設定'"
    @close="backToClass"
    @confirm="confirmName"
  />
</template>
